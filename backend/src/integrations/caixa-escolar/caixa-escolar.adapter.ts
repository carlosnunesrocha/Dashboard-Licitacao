import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PortalAdapter, SyncResult } from '../types.js';
import { LicitacoesService } from '../../licitacoes/licitacoes.service.js';

const API_BASE = 'https://api.caixaescolar.educacao.mg.gov.br';
const PORTAL_BASE_URL = 'https://caixaescolar.educacao.mg.gov.br/compras/orcamentos';

/**
 * Apenas os status que representam negociações reais da empresa.
 * NAEN (não enviada) e FORA (prazo encerrado) são o universo geral de
 * oportunidades disponíveis no portal — não negociações da empresa — e
 * são ignorados aqui pois já cobertos pela automação de prospecção existente.
 */
const STATUS_MAP: Record<string, { status: string; resultado?: string }> = {
  ENVI: { status: 'PROPOSTA_ENVIADA' },                // Proposta enviada, aguardando decisão
  APRO: { status: 'RESULTADO', resultado: 'GANHOU' },   // Aprovado pela escola
  RECU: { status: 'RESULTADO', resultado: 'PERDEU' },   // Recusado pela escola
};

interface BudgetProposalItem {
  idBudget: number;
  idSubprogram: number;
  idSchool: number;
  idSupplier: number;
  nuBudgetOrder: string;
  schoolName: string;
  countyName: string;
  expenseGroupDescription: string;
  dtProposalSubmission: string | null;
  dtServiceDelivery: string | null;
  supplierStatus: string;
}

interface BudgetProposalResponse {
  data: BudgetProposalItem[];
  meta: { totalItems: number; totalPages: number; currentPage: number };
}

interface BudgetDetailResponse {
  initiativeDescription: string | null;
  estimatedValue: string | null;
  idSupplierProposalWinner: number | null;
}

interface ProposalSummary {
  idSupplier: number;
  idSupplierWinner: number | null;
  txFantasyName: string | null;
  totalPropose: string | null;
}

interface ProposalItemResponse {
  nuItemOrder: number;
  txDescription: string | null;
  txBudgetItemType: string | null;
  txBudgetItemUnit: string | null;
  nuQuantity: string | null;
  nuReferralValue: number | null;
  nuValueByItem: number | null;
  txItemObservation: string | null;
  txWarrantyDescription: string | null;
  txWarrantyRequired: string | null;
}

export interface LicitacaoDetalhes {
  detalhamento: string | null;
  valorTotalProposta: number | null;
  empresaVencedora: string | null;
  valorVencedor: number | null;
  itens: {
    ordem: number;
    descricao: string;
    tipo: string | null;
    unidade: string | null;
    quantidade: number | null;
    valorReferencia: number | null;
    valorUnitario: number | null;
    observacoes: string | null;
    garantiaOfertada: string | null;
    garantiaExigida: string | null;
  }[];
}

/**
 * A API da Caixa Escolar devolve UTF-8 interpretado como Latin-1 (mojibake):
 * "Jurídica" chega como "JurÃ­dica". Reinterpretar os bytes corrige o texto.
 * Se a reinterpretação falhar (texto já correto), devolve o original.
 */
function fixEncoding(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!/[ÃÂ]/.test(value)) return value;
  const fixed = Buffer.from(value, 'latin1').toString('utf8');
  return fixed.includes('�') ? value : fixed;
}

@Injectable()
export class CaixaEscolarAdapter implements PortalAdapter {
  readonly id = 'caixa-escolar';
  readonly label = 'Caixa Escolar – SGD/MG';
  private readonly logger = new Logger(CaixaEscolarAdapter.name);
  private sessionCookie: string | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly licitacoes: LicitacoesService,
  ) {}

  async sync(): Promise<SyncResult> {
    const user = this.config.get<string>('CAIXA_ESCOLAR_USER');
    const pass = this.config.get<string>('CAIXA_ESCOLAR_PASS');

    if (!user || !pass) {
      this.logger.warn('Caixa Escolar: credenciais não configuradas. Defina CAIXA_ESCOLAR_USER e CAIXA_ESCOLAR_PASS no .env');
      return { portalId: this.id, imported: 0, updated: 0, errored: true, errorMsg: 'Credenciais não configuradas' };
    }

    this.logger.log('Iniciando sync Caixa Escolar');
    await this.login(user, pass);

    let imported = 0;
    let updated = 0;
    const vistos = new Set<string>();

    for (const [statusCode, mapping] of Object.entries(STATUS_MAP)) {
      this.logger.log(`Buscando status=${statusCode}...`);
      let page = 1;
      let totalPages = 1;

      do {
        const body = await this.fetchPage(statusCode, page);
        totalPages = body.meta.totalPages;

        for (const item of body.data) {
          vistos.add(String(item.idBudget));
          const existed = await this.licitacoes.isPortalItemRegistered(this.id, String(item.idBudget));
          const escola = fixEncoding(item.schoolName);
          const municipio = fixEncoding(item.countyName);
          const grupoDespesa = fixEncoding(item.expenseGroupDescription);

          await this.licitacoes.upsertFromIntegration(this.id, {
            externalId: String(item.idBudget),
            orgao: [escola, municipio].filter(Boolean).join(' – '),
            objeto: `Orçamento nº ${item.nuBudgetOrder} – ${grupoDespesa}`,
            modalidade: 'Caixa Escolar – Orçamento Descentralizado',
            dataAbertura: item.dtProposalSubmission ?? undefined,
            dataLimite: item.dtServiceDelivery ?? undefined,
            urlOriginal: `${PORTAL_BASE_URL}?status=${statusCode}`,
            statusSugerido: mapping.status,
            resultadoSugerido: mapping.resultado,
            idSubprogram: item.idSubprogram,
            idSchool: item.idSchool,
            idSupplier: item.idSupplier,
          });

          if (existed) updated++;
          else imported++;
        }

        page++;
      } while (page <= totalPages);
    }

    // Registros nossos que não apareceram em nenhum status do portal: a escola
    // removeu o orçamento ou ele saiu do escopo. Marca em vez de apagar, para
    // não perder o histórico de negociações já acompanhadas.
    const desaparecidos = await this.licitacoes.marcarDesaparecidos(this.id, [...vistos]);

    this.logger.log(
      `Caixa Escolar concluído: ${imported} importadas, ${updated} atualizadas, ${desaparecidos} desaparecidas`,
    );
    return { portalId: this.id, imported, updated, desaparecidos };
  }

  private async login(user: string, pass: string): Promise<void> {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ txCpfCnpj: user, txPassword: pass }),
      signal: AbortSignal.timeout(25_000),
    });

    if (!res.ok) {
      throw new Error(`Login Caixa Escolar falhou: HTTP ${res.status}`);
    }

    // O cookie sessionToken é httpOnly; no Node fetch capturamos via set-cookie header
    const setCookies: string[] = (res.headers as any).getSetCookie?.() ?? [res.headers.get('set-cookie') ?? ''];
    const cookiePart = setCookies
      .map((c: string) => c.split(';')[0].trim())
      .find((c: string) => c.startsWith('sessionToken='));

    if (!cookiePart) {
      throw new Error('Login Caixa Escolar não retornou sessionToken no cookie');
    }
    this.sessionCookie = cookiePart;
    this.logger.debug('Sessão Caixa Escolar estabelecida');
  }

  /**
   * Busca os detalhes completos de um orçamento: detalhamento da solicitação,
   * itens com a nossa proposta, e (quando perdemos) quem venceu e por quanto.
   * Faz login se ainda não houver sessão ativa.
   */
  async fetchDetalhes(
    idSubprogram: number,
    idSchool: number,
    idBudget: number,
    idSupplier: number,
  ): Promise<LicitacaoDetalhes> {
    if (!this.sessionCookie) {
      const user = this.config.get<string>('CAIXA_ESCOLAR_USER');
      const pass = this.config.get<string>('CAIXA_ESCOLAR_PASS');
      if (!user || !pass) {
        throw new Error('Credenciais da Caixa Escolar não configuradas');
      }
      await this.login(user, pass);
    }

    const base = `by-subprogram/${idSubprogram}/by-school/${idSchool}/by-budget/${idBudget}`;

    // A lista de concorrentes só existe depois que o resultado é decidido:
    // enquanto a licitação está em disputa o portal responde 404. Os demais
    // dados (detalhamento e itens) já estão disponíveis, então seguimos sem ela.
    const [detalheRaw, propostas, itensRaw] = await Promise.all([
      this.authedGet<BudgetDetailResponse>(`budget/${base}`),
      this.authedGet<{ data: ProposalSummary[] }>(
        `budget-proposal/${base}?sortBy=totalPropose:ASC&page=1&limit=50`,
        { allow404: true },
      ),
      this.authedGet<{ data: ProposalItemResponse[] }>(
        `budget-proposal-item/${base}/by-supplier/${idSupplier}` +
          `?sortBy=budgetItem.nuItemOrder:ASC&page=1&limit=9999`,
      ),
    ]);

    if (!detalheRaw) throw new Error('Orçamento não encontrado no portal');
    const detalhe = detalheRaw;
    const itens = itensRaw ?? { data: [] };

    const listaPropostas = propostas?.data ?? [];
    const nossaProposta = listaPropostas.find((p) => p.idSupplier === idSupplier);
    const idVencedor = detalhe.idSupplierProposalWinner ?? listaPropostas[0]?.idSupplierWinner ?? null;
    const vencedor =
      idVencedor !== null && idVencedor !== idSupplier
        ? listaPropostas.find((p) => p.idSupplier === idVencedor)
        : undefined;

    const listaItens = itens.data ?? [];

    // Sem a lista de propostas (licitação em disputa) o total vem da soma dos
    // itens: valor unitário × quantidade.
    const totalPelosItens = listaItens.reduce((soma, i) => {
      const unit = i.nuValueByItem;
      const qtd = i.nuQuantity !== null ? Number(i.nuQuantity) : null;
      if (unit === null || qtd === null || Number.isNaN(qtd)) return soma;
      return soma + unit * qtd;
    }, 0);

    return {
      detalhamento: fixEncoding(detalhe.initiativeDescription),
      valorTotalProposta: nossaProposta?.totalPropose
        ? Number(nossaProposta.totalPropose)
        : totalPelosItens > 0
          ? totalPelosItens
          : null,
      empresaVencedora: vencedor ? fixEncoding(vencedor.txFantasyName)?.trim() ?? null : null,
      valorVencedor: vencedor?.totalPropose ? Number(vencedor.totalPropose) : null,
      itens: listaItens.map((i) => ({
        ordem: i.nuItemOrder,
        descricao: fixEncoding(i.txDescription) ?? 'Sem descrição',
        tipo: fixEncoding(i.txBudgetItemType),
        unidade: fixEncoding(i.txBudgetItemUnit),
        quantidade: i.nuQuantity !== null ? Number(i.nuQuantity) : null,
        valorReferencia: i.nuReferralValue,
        valorUnitario: i.nuValueByItem,
        observacoes: fixEncoding(i.txItemObservation),
        garantiaOfertada: fixEncoding(i.txWarrantyDescription),
        garantiaExigida: fixEncoding(i.txWarrantyRequired),
      })),
    };
  }

  private async authedGet<T>(path: string, opts?: { allow404?: boolean }): Promise<T | null> {
    const res = await fetch(`${API_BASE}/${path}`, {
      headers: { Cookie: this.sessionCookie ?? '', Accept: 'application/json' },
      signal: AbortSignal.timeout(30_000),
    });
    if (res.status === 401) {
      this.sessionCookie = null;
      throw new Error('Sessão Caixa Escolar expirou');
    }
    if (res.status === 404 && opts?.allow404) return null;
    if (!res.ok) {
      throw new Error(`Caixa Escolar HTTP ${res.status} em ${path}`);
    }
    return (await res.json()) as T;
  }

  private async fetchPage(statusCode: string, page: number): Promise<BudgetProposalResponse> {
    const url =
      `${API_BASE}/budget-proposal/summary-by-supplier-profile` +
      `?filter.supplierStatus=$eq:${statusCode}&page=${page}&limit=50&sortBy=idBudget:DESC`;

    const res = await fetch(url, {
      headers: {
        Cookie: this.sessionCookie ?? '',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(30_000),
    });

    if (res.status === 401) {
      throw new Error('Sessão Caixa Escolar expirou durante o sync — será renovada no próximo ciclo');
    }
    if (!res.ok) {
      throw new Error(`Caixa Escolar HTTP ${res.status} ao buscar status=${statusCode} página=${page}`);
    }

    return (await res.json()) as BudgetProposalResponse;
  }
}
