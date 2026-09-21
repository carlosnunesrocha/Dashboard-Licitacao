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

export interface PortalAdapter {
  readonly id: string;
  readonly label: string;
  sync(): Promise<SyncResult>;
  /** Opcional: portais que expõem detalhes por licitação implementam isto. */
  fetchDetalhes?(
    idSubprogram: number,
    idSchool: number,
    idBudget: number,
    idSupplier: number,
  ): Promise<DetalhesLicitacao>;
}