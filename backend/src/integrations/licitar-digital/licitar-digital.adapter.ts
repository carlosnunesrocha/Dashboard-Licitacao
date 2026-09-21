import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { LicitacaoParaDetalhes, PortalAdapter, SyncResult } from '../types.js';
import {
  LicitacoesService,
  type DetalhesLicitacao,
} from '../../licitacoes/licitacoes.service.js';
import {
  LicitarDigitalClient,
  type AuctionDetail,
  type AuctionLot,
  type AuctionNotice,
  type ShortFilter,
} from './licitar-digital.client.js';

const APP_ORIGIN = 'https://app2.licitardigital.com.br';

/**
 * Visão canônica do portal: **favoritos**.
 *
 * Decisão do usuário (2026-09-21): na operação da empresa, os processos em que
 * ela está participando ou já participou ficam registrados em Favoritos. É o
 * critério do negócio, e ele manda aqui.
 *
 * NÃO troque sem migrar os dados: `marcarDesaparecidos` escopa pelo portal
 * inteiro, então alternar a visão marca tudo da visão anterior como
 * desaparecido de uma vez.
 */
const FILTRO_PADRAO: ShortFilter = 'favorite';

/**
 * Teto de sanidade. A consulta pública do portal tem ~101 mil editais; as
 * listas da empresa têm dezenas. Um número acima disto significa que a resposta
 * não veio escopada à empresa.
 */
const MAX_ESPERADO = 5_000;

/**
 * Códigos de situação do lote, como o portal os devolve. A lista foi montada
 * a partir dos valores observados; qualquer código novo aparece cru no modal
 * em vez de ser escondido — ver `traduzir()`.
 */
const SITUACAO_LOTE: Record<string, string> = {
  negotiation_finished: 'Negociação encerrada',
  negotiation: 'Em negociação',
  dispute: 'Em disputa',
  waiting: 'Aguardando',
  canceled: 'Cancelado',
  finished: 'Encerrado',
};

const FASE_LOTE: Record<string, string> = {
  contract: 'Contratação',
  proposal: 'Propostas',
  dispute: 'Disputa',
  appeal: 'Recursos',
  qualification: 'Habilitação',
};

@Injectable()
export class LicitarDigitalAdapter implements PortalAdapter {
  readonly id = 'licitar-digital';
  readonly label = 'LicitarDigital';
  private readonly logger = new Logger(LicitarDigitalAdapter.name);

  constructor(
    private readonly config: ConfigService,
    private readonly licitacoes: LicitacoesService,
  ) {}

  async sync(): Promise<SyncResult> {
    const token = this.config.get<string>('LICITAR_DIGITAL_TOKEN');

    if (!token) {
      this.logger.warn(
        'LicitarDigital: token não configurado. Defina LICITAR_DIGITAL_TOKEN no .env (localStorage["_LDToken"] da área logada)',
      );
      return {
        portalId: this.id,
        imported: 0,
        updated: 0,
        errored: true,
        errorMsg: 'Token não configurado',
      };
    }

    const filtro = (this.config.get<string>('LICITAR_DIGITAL_FILTRO') ??
      FILTRO_PADRAO) as ShortFilter;
    const client = new LicitarDigitalClient(token);

    this.logger.log(`Iniciando sync LicitarDigital (filtro=${filtro})`);

    let imported = 0;
    let updated = 0;
    let offset = 0;
    let total = 0;
    const vistos = new Set<string>();

    do {
      const pagina = await client.buscarPagina(filtro, offset);
      total = pagina.meta.count;

      this.verificarEscopo(pagina.data, total, filtro);

      if (pagina.data.length === 0) {
        // Ainda faltavam registros segundo o próprio portal: ele se
        // contradisse. Seguir daria um `vistos` incompleto e, no fim,
        // marcaria os ausentes como desaparecidos.
        if (offset < total) {
          throw new Error(
            `LicitarDigital: página vazia em offset=${offset} com meta.count=${total}. ` +
              'Resposta inconsistente — sync abortado para não marcar registros como desaparecidos indevidamente.',
          );
        }
        break;
      }

      for (const item of pagina.data) {
        const externalId = String(item.id);
        vistos.add(externalId);

        const existed = await this.licitacoes.isPortalItemRegistered(this.id, externalId);

        await this.licitacoes.upsertFromIntegration(this.id, {
          externalId,
          orgao: this.montarOrgao(item),
          objeto: this.montarObjeto(item),
          modalidade: item.auctionType ?? undefined,
          dataAbertura: item.auctionStartDate ?? undefined,
          dataLimite: item.auctionEndDate ?? undefined,
          // TODO: não há URL por processo confirmada; esta leva à listagem.
          urlOriginal: `${APP_ORIGIN}/pesquisa?only${filtro === 'proposal' ? 'Proposal' : 'Favorites'}`,
          // statusSugerido e resultadoSugerido são deliberadamente OMITIDOS.
          // O portal não expõe ganhou/perdeu (confirmado pelo usuário em
          // 2026-09-21) e a operadora conduz o andamento pelo Kanban. Enviar
          // statusSugerido faria o sync sobrescrever esse trabalho a cada 6h,
          // porque upsertFromIntegration grava o campo sem guarda.
        });

        if (existed) updated++;
        else imported++;
      }

      // Avança pelo que a página REALMENTE trouxe. O portal pagina de 20 em 20,
      // mas somar 20 fixo pularia registros se uma página vier parcial antes do
      // fim — e os pulados seriam marcados como desaparecidos.
      offset += pagina.data.length;
    } while (offset < total);

    // Resposta sem nenhum registro. Pode ser legítimo (a empresa não tem
    // propostas) ou uma falha silenciosa — e os dois casos são indistinguíveis
    // aqui. Como marcar tudo como desaparecido esvaziaria o board, recusamos e
    // deixamos um humano decidir.
    if (vistos.size === 0) {
      this.logger.error('LicitarDigital: nenhum registro retornado; marcação de desaparecidos ignorada');
      return {
        portalId: this.id,
        imported: 0,
        updated: 0,
        errored: true,
        errorMsg:
          'Nenhum registro retornado pelo portal. Sync abortado antes de marcar desaparecidos — verifique o token e o filtro.',
      };
    }

    // Só aqui, depois de varrer TODAS as páginas. Se algo falhar no meio, a
    // exceção sobe e esta linha não roda — evitando marcar o portal inteiro
    // como desaparecido por causa de um sync parcial.
    const desaparecidos = await this.licitacoes.marcarDesaparecidos(this.id, [...vistos]);

    this.logger.log(
      `LicitarDigital concluído: ${imported} importadas, ${updated} atualizadas, ${desaparecidos} desaparecidas`,
    );
    return { portalId: this.id, imported, updated, desaparecidos };
  }

  /**
   * Fail-closed contra o modo de falha mais perigoso deste portal.
   *
   * Sem Authorization válido, a API **não** devolve erro: ela ignora o
   * shortFilter em silêncio e responde a consulta pública inteira (~101 mil
   * editais, todas as flags false). Gravar isso encheria o board de
   * prospecção alheia — exatamente o que o painel existe para evitar.
   *
   * Por isso abortamos em vez de confiar no status HTTP.
   */
  private verificarEscopo(itens: AuctionNotice[], total: number, filtro: ShortFilter): void {
    if (total > MAX_ESPERADO) {
      throw new Error(
        `LicitarDigital: resposta com ${total} registros (teto ${MAX_ESPERADO}). ` +
          'Isso é a consulta pública, não as licitações da empresa — token provavelmente inválido. Sync abortado.',
      );
    }

    const daEmpresa = (i: AuctionNotice) =>
      filtro === 'proposal' ? i.hasProposal : i.isFavorite;

    const intruso = itens.find((i) => !daEmpresa(i));
    if (intruso) {
      throw new Error(
        `LicitarDigital: item ${intruso.id} não pertence ao filtro "${filtro}" ` +
          '(flag da empresa ausente). Resposta não escopada. Sync abortado.',
      );
    }
  }

  /**
   * Detalhes de um processo: descrição, lotes e quem venceu.
   *
   * Duas ausências, ambas do portal e não do código:
   * - **Nossa proposta item a item não vem daqui.** A API do painel
   *   (`app2`) não a expõe; ela vive em `app.licitardigital.com.br`, ainda
   *   não mapeada. Por isso `valorTotalProposta` é nulo.
   * - O portal organiza por **lote**, não por item solto, então cada "item"
   *   do modal é um lote — sem unidade nem quantidade.
   */
  async fetchDetalhes(licitacao: LicitacaoParaDetalhes): Promise<DetalhesLicitacao> {
    const token = this.config.get<string>('LICITAR_DIGITAL_TOKEN');
    if (!token) {
      throw new BadRequestException(
        'LicitarDigital: token não configurado. Defina LICITAR_DIGITAL_TOKEN no .env',
      );
    }

    const auctionId = Number(licitacao.externalId);
    if (!Number.isFinite(auctionId)) {
      throw new BadRequestException(
        `LicitarDigital: externalId '${licitacao.externalId}' não é numérico`,
      );
    }

    const client = new LicitarDigitalClient(token);
    const [processo, lotes] = await Promise.all([
      client.buscarProcesso(auctionId),
      client.buscarLotes(auctionId),
    ]);

    const nosso = client.providerId;
    // Um processo costuma ter ampla concorrência + cota reservada ME/EPP, com
    // vencedores DIFERENTES. Resolve o nome de cada um (o client faz cache).
    const vencedores = await this.resolverVencedores(client, lotes);

    return {
      detalhamento: this.montarDetalhamento(processo),
      // O portal não expõe a nossa proposta nesta API.
      valorTotalProposta: null,
      empresaVencedora: this.vencedorPrincipal(lotes, vencedores, nosso),
      valorVencedor: null,
      itens: lotes.map((lote, i) => ({
        // Índice sequencial, não `lote.item`: lotes complementares do mesmo
        // item compartilham o número, e duas linhas "1" pareceriam defeito.
        ordem: i + 1,
        descricao: this.montarDescricaoLote(lote, lotes),
        tipo: null,
        unidade: null,
        quantidade: null,
        // showReferenceValue = 0 significa que o portal esconde o valor nesta
        // licitação; exibi-lo mostraria algo que o próprio portal não mostra.
        valorReferencia: lote.showReferenceValue ? lote.referenceValue : null,
        valorUnitario: null,
        observacoes: this.montarSituacaoLote(lote, vencedores, nosso),
        garantiaOfertada: null,
        garantiaExigida: null,
      })),
    };
  }

  /** providerId → nome, para todos os vencedores do processo. */
  private async resolverVencedores(
    client: LicitarDigitalClient,
    lotes: AuctionLot[],
  ): Promise<Map<number, string>> {
    const ids = [...new Set(lotes.map((l) => l.winnerProviderId).filter((id): id is number => !!id))];
    const nomes = new Map<number, string>();

    await Promise.all(
      ids.map(async (id) => {
        const f = await client.buscarFornecedor(id);
        nomes.set(id, f?.companyName?.trim() || f?.tradingName?.trim() || `Fornecedor ${id}`);
      }),
    );
    return nomes;
  }

  /**
   * `DetalhesLicitacao` comporta um único vencedor, mas o processo pode ter
   * vários. Escolhe o primeiro que não seja a nossa empresa — o caso que
   * interessa ao board ("quem nos ganhou"). O vencedor de cada lote aparece
   * individualmente em `observacoes`.
   */
  private vencedorPrincipal(
    lotes: AuctionLot[],
    nomes: Map<number, string>,
    nosso: number | null,
  ): string | null {
    const deOutro = lotes.find((l) => l.winnerProviderId && l.winnerProviderId !== nosso);
    return deOutro?.winnerProviderId ? (nomes.get(deOutro.winnerProviderId) ?? null) : null;
  }

  /**
   * Quando lotes compartilham o mesmo número de item (ampla concorrência e
   * cota reservada do mesmo objeto), o número sozinho não distingue — então
   * ele entra no texto para deixar claro que a repetição é do portal.
   */
  private montarDescricaoLote(lote: AuctionLot, todos: AuctionLot[]): string {
    const base = lote.lotDescription?.trim() || 'Sem descrição';
    const repetido = todos.filter((l) => l.item === lote.item).length > 1;
    return repetido ? `Lote ${lote.item} · ${base}` : base;
  }

  private montarDetalhamento(p: AuctionDetail): string | null {
    const linhas: string[] = [];
    if (p.simpleDescription?.trim()) linhas.push(p.simpleDescription.trim());

    const ficha: string[] = [];
    if (p.processNumber) ficha.push(`Processo nº ${p.processNumber}`);
    if (p.purcharseNumber) ficha.push(`Compra nº ${p.purcharseNumber}`);
    if (p.organizationUnit?.organizationUnitName) {
      ficha.push(p.organizationUnit.organizationUnitName);
    }
    if (ficha.length) linhas.push(ficha.join(' · '));

    const prazos: string[] = [];
    if (p.startDateTimeToSendProposal) {
      prazos.push(`Propostas a partir de ${this.data(p.startDateTimeToSendProposal)}`);
    }
    if (p.endDateTimeToSendProposal) {
      prazos.push(`até ${this.data(p.endDateTimeToSendProposal)}`);
    }
    if (p.startDateTimeDispute) prazos.push(`Disputa em ${this.data(p.startDateTimeDispute)}`);
    if (prazos.length) linhas.push(prazos.join(' · '));

    if (p.isCanceled) linhas.push('⚠️ Processo cancelado pelo órgão.');
    if (p.pncpLink) linhas.push(`PNCP: ${p.pncpLink}`);

    return linhas.length ? linhas.join('\n\n') : null;
  }

  /**
   * Situação do lote em texto — o modal não tem campo próprio para isso.
   *
   * Inclui o vencedor DESTE lote: é o que diferencia lotes complementares do
   * mesmo item, e o campo `empresaVencedora` só comporta um.
   */
  private montarSituacaoLote(
    lote: AuctionLot,
    nomes: Map<number, string>,
    nosso: number | null,
  ): string | null {
    const partes: string[] = [];
    if (lote.isItDesert) partes.push('Deserto');
    if (lote.isItFrustrated) partes.push('Fracassado');

    const situacao = this.traduzir(lote.status, SITUACAO_LOTE);
    if (situacao) partes.push(`Situação: ${situacao}`);

    const fase = this.traduzir(lote.lotStage, FASE_LOTE);
    if (fase) partes.push(`Fase: ${fase}`);

    if (lote.winnerProviderId) {
      partes.push(
        lote.winnerProviderId === nosso
          ? '🏆 Vencemos este lote'
          : `Vencedor: ${nomes.get(lote.winnerProviderId) ?? lote.winnerProviderId}`,
      );
    }
    return partes.length ? partes.join(' · ') : null;
  }

  /**
   * Traduz os códigos do portal. Valor desconhecido é devolvido cru em vez de
   * virar "—": esconder o que não se conhece é pior do que mostrar em inglês,
   * porque some a informação e ninguém percebe que falta tradução.
   */
  private traduzir(valor: string | null, mapa: Record<string, string>): string | null {
    if (!valor) return null;
    return mapa[valor] ?? valor;
  }

  private data(iso: string): string {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  }

  private montarOrgao(item: AuctionNotice): string {
    const partes = [item.organizationName, item.organizationUnitName]
      .map((p) => p?.trim())
      .filter((p): p is string => Boolean(p));
    // Unidade repetida no nome do órgão vira ruído no card.
    const unicas = [...new Set(partes)];
    return unicas.join(' – ') || 'Órgão não informado';
  }

  private montarObjeto(item: AuctionNotice): string {
    const descricao = item.simpleDescription?.trim().replace(/\s+/g, ' ');
    const numero = item.auctionNumber?.trim();
    if (descricao && numero) return `Processo nº ${numero} – ${descricao}`;
    return descricao || (numero ? `Processo nº ${numero}` : `Processo ${item.id}`);
  }
}
