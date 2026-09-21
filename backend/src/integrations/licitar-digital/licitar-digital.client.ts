import { Logger } from '@nestjs/common';
import { execFile } from 'node:child_process';

const MANAGER_API = 'https://manager-api.licitardigital.com.br';
const APP_ORIGIN = 'https://app2.licitardigital.com.br';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

/**
 * Por que curl e não fetch.
 *
 * O Cloudflare do LicitarDigital identifica o cliente HTTP do Node (undici) e
 * responde com desafio JS ("Just a moment"), HTTP 403, mesmo com todos os
 * cabeçalhos de navegador corretos. Verificado em 2026-09-21:
 *
 *   Python urllib ....... 201   curl ................ 201
 *   Node fetch .......... 403   node:https .......... 403
 *   node:https com cifras de navegador ............... 403
 *
 * Não é questão de cabeçalho — as mesmas cinco variações de header passam no
 * curl e falham no Node. Ajustar `ciphers`/`sigalgs` também não resolve: a
 * diferença está na construção do ClientHello (ordem de extensões, GREASE),
 * fora do alcance da configuração TLS do Node.
 *
 * Daí delegar ao curl, que está disponível em qualquer imagem base usável.
 *
 * ⚠️ Este curl (Windows) usa Schannel; em Linux ele usa OpenSSL e o
 * fingerprint muda. **Revalidar no VPS antes do deploy** — ver PROGRESS.md.
 */

export interface AuctionNotice {
  id: number;
  auctionType: string | null;
  auctionNumber: string | null;
  accreditationNumber: string | null;
  auctionFinished: number;
  startDateTimeDispute: string | null;
  methodDispute: number | null;
  simpleDescription: string | null;
  auctionStartDate: string | null;
  auctionEndDate: string | null;
  organizationUnitName: string | null;
  organizationName: string | null;
  biddingStageId: number | null;
  auctionCanceled: number;
  platform: string | null;
  isFavorite: boolean;
  hasProposal: boolean;
  isSuggestion: boolean;
}

export interface SearchPage {
  data: AuctionNotice[];
  meta: { count: number; limit: number; offset: number };
}

/** Detalhe do processo — `getAuctionNoticeById` devolve ~39 campos. */
export interface AuctionDetail {
  processNumber: string | null;
  processType: string | null;
  purcharseNumber: string | null; // grafia do portal, com o typo
  simpleDescription: string | null;
  biddingStageId: number | null;
  isFinished: boolean;
  isCanceled: boolean;
  publishedDate: string | null;
  startDateTimeDispute: string | null;
  startDateTimeToSendProposal: string | null;
  endDateTimeToSendProposal: string | null;
  pncpLink: string | null;
  organizationUnit?: { organizationUnitName?: string | null } | null;
}

/** Um lote do processo. O portal organiza por lote, não por item solto. */
export interface AuctionLot {
  id: number;
  item: number;
  lotDescription: string | null;
  referenceValue: number | null;
  /** 0 = o portal esconde o valor de referência nesta licitação. */
  showReferenceValue: number;
  status: string | null;
  lotStage: string | null;
  isItDesert: number;
  isItFrustrated: number;
  winnerProviderId: number | null;
}

export interface Provider {
  id: number;
  companyName: string | null;
  tradingName: string | null;
  docNumber: string | null;
}

/** Visões da listagem. `proposal` = a empresa enviou proposta. */
export type ShortFilter = 'proposal' | 'favorite';

interface RespostaCurl {
  status: number;
  corpo: string;
}

export class LicitarDigitalClient {
  private readonly logger = new Logger(LicitarDigitalClient.name);
  private readonly authorization: string;
  private readonly fornecedores = new Map<number, Provider | null>();
  private providerIdCache: number | null | undefined;

  constructor(token: string) {
    // A API exige o prefixo: o JWT cru responde
    // HTTP 400 {"message":"Token with invalid format","token":"TOKEN_MALFORMED"}.
    // Normaliza aqui para tolerar o .env com ou sem "Bearer ".
    const limpo = token.trim();
    this.authorization = /^Bearer\s/i.test(limpo) ? limpo : `Bearer ${limpo}`;
  }

  async buscarPagina(shortFilter: ShortFilter, offset: number): Promise<SearchPage> {
    const body = JSON.stringify({
      filter: {
        supliesProviders: [],
        shortFilter,
        startDate: 0,
        startDatePublication: 0,
        isMarketplace: 0,
      },
      offset,
    });

    const json = await this.chamar<SearchPage>(
      '/auction-notice/doSearchAuctionNotice',
      JSON.parse(body),
    );
    if (!json?.data || !json?.meta) {
      throw new Error('LicitarDigital: resposta sem data/meta — formato inesperado');
    }
    return json;
  }

  /** Detalhe do processo. Note que o parâmetro é `auctionId`, não `id`. */
  async buscarProcesso(auctionId: number): Promise<AuctionDetail> {
    const json = await this.chamar<{ data?: AuctionDetail } & AuctionDetail>(
      '/auction-notice/getAuctionNoticeById',
      { auctionId },
    );
    return (json.data ?? json) as AuctionDetail;
  }

  /**
   * Lotes do processo. O corpo exige o envelope `params` — sem ele a API
   * responde 422 {"errors":{"params":{"isObject":"params must be an object"}}}.
   */
  async buscarLotes(auctionId: number): Promise<AuctionLot[]> {
    const json = await this.chamar<{ data?: AuctionLot[] } | AuctionLot[]>(
      '/auction-notice-lot/listLotsbyAuctionId',
      { params: { auctionId } },
    );
    const lista = Array.isArray(json) ? json : (json.data ?? []);
    return lista;
  }

  /**
   * Nome de um fornecedor. Com cache por instância: uma licitação com vários
   * lotes costuma ter o mesmo vencedor, e não vale uma chamada por lote.
   */
  async buscarFornecedor(providerId: number): Promise<Provider | null> {
    const emCache = this.fornecedores.get(providerId);
    if (emCache !== undefined) return emCache;

    let provider: Provider | null = null;
    try {
      const json = await this.chamar<{ data?: Provider } & Provider>(
        '/providers/getProviderById',
        { providerId },
      );
      provider = (json.data ?? json) as Provider;
    } catch (err) {
      // Nome do vencedor é acessório: sem ele o detalhe ainda vale.
      this.logger.warn(
        `LicitarDigital: não consegui resolver o fornecedor ${providerId} — ${(err as Error).message}`,
      );
    }
    this.fornecedores.set(providerId, provider);
    return provider;
  }

  /**
   * `providerId` da empresa, lido do próprio JWT — evita mais uma variável de
   * ambiente que poderia divergir do token. Payload apenas; assinatura não é
   * verificada aqui (quem valida é a API).
   */
  get providerId(): number | null {
    if (this.providerIdCache !== undefined) return this.providerIdCache;

    let valor: number | null = null;
    try {
      const payload = this.authorization.replace(/^Bearer\s+/i, '').split('.')[1];
      const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      if (typeof claims.providerId === 'number') valor = claims.providerId;
    } catch {
      // Token fora do formato esperado: sem providerId não dá para saber se
      // fomos nós que vencemos, mas o resto do detalhe continua válido.
    }
    this.providerIdCache = valor;
    return valor;
  }

  private async chamar<T>(rota: string, body: unknown): Promise<T> {
    const { status, corpo } = await this.curl(`${MANAGER_API}${rota}`, JSON.stringify(body));

    if (status === 401 || status === 403) {
      throw new Error(
        `LicitarDigital: token rejeitado (HTTP ${status}). Gere um novo _LDToken e atualize LICITAR_DIGITAL_TOKEN no .env`,
      );
    }
    if (status < 200 || status >= 300) {
      throw new Error(`LicitarDigital: HTTP ${status} em ${rota} — ${corpo.slice(0, 200)}`);
    }
    try {
      return JSON.parse(corpo) as T;
    } catch {
      throw new Error(`LicitarDigital: resposta de ${rota} não é JSON — formato inesperado`);
    }
  }

  /**
   * Cabeçalhos e URL vão por stdin (`curl -K -`), não por argv: o token não
   * aparece na lista de processos da máquina.
   */
  private curl(url: string, body: string): Promise<RespostaCurl> {
    // %{http_code} no fim da saída — separa status do corpo sem parsear headers.
    const config = [
      `url = "${url}"`,
      'request = "POST"',
      `header = "Content-Type: application/json"`,
      `header = "Origin: ${APP_ORIGIN}"`,
      `header = "Referer: ${APP_ORIGIN}/"`,
      `header = "User-Agent: ${UA}"`,
      `header = "Accept: application/json, text/plain, */*"`,
      `header = "Accept-Language: pt-BR,pt;q=0.9"`,
      `header = "Authorization: ${this.authorization}"`,
      `data-binary = "${body.replace(/"/g, '\\"')}"`,
      'silent',
      'show-error',
      'max-time = 30',
      'write-out = "\\n%{http_code}"',
    ].join('\n');

    return new Promise((resolve, reject) => {
      const proc = execFile(
        'curl',
        ['--config', '-'],
        { maxBuffer: 20 * 1024 * 1024, timeout: 40_000 },
        (err, stdout, stderr) => {
          if (err && !stdout) {
            reject(
              new Error(
                `LicitarDigital: falha ao executar curl (${err.message}). ${stderr?.slice(0, 200) ?? ''}`,
              ),
            );
            return;
          }
          // A última linha é o status; o resto é o corpo.
          const corte = stdout.lastIndexOf('\n');
          const status = Number(stdout.slice(corte + 1).trim());
          resolve({ status, corpo: stdout.slice(0, corte) });
        },
      );
      proc.stdin?.end(config);
    });
  }
}
