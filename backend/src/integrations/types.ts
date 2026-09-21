import type { DetalhesLicitacao } from '../licitacoes/licitacoes.service.js';

export interface SyncResult {
  portalId: string;
  imported: number;
  updated: number;
  /** Registros que saíram do portal e foram marcados como desaparecidos. */
  desaparecidos?: number;
  errored?: boolean;
  errorMsg?: string;
}

/**
 * O que um adaptador recebe para buscar detalhes.
 *
 * Tipo estrutural em vez do modelo do Prisma: mantém a interface independente
 * do schema e deixa explícito o que os adaptadores podem usar.
 *
 * Os campos `id*` são chaves da **Caixa Escolar** e vêm nulos em qualquer
 * outro portal — cada adaptador valida o que precisa.
 */
export interface LicitacaoParaDetalhes {
  externalId: string;
  portalOrigem: string;
  idSubprogram: number | null;
  idSchool: number | null;
  idSupplier: number | null;
}

export interface PortalAdapter {
  readonly id: string;
  readonly label: string;
  sync(): Promise<SyncResult>;
  /**
   * Opcional: portais que expõem detalhes por licitação implementam isto.
   *
   * Recebe a licitação inteira porque cada portal se identifica de um jeito —
   * a Caixa Escolar precisa de subprograma/escola/fornecedor, o LicitarDigital
   * só do `externalId`. A assinatura anterior recebia os quatro inteiros da
   * Caixa Escolar, o que impedia qualquer outro portal de implementar detalhes.
   */
  fetchDetalhes?(licitacao: LicitacaoParaDetalhes): Promise<DetalhesLicitacao>;
}