export const KANBAN_STATUS = [
  'EM_ANALISE',
  'DOCUMENTACAO',
  'PROPOSTA_ENVIADA',
  'EM_DISPUTA',
  'RESULTADO',
] as const;
export type KanbanStatus = (typeof KANBAN_STATUS)[number];

export const KANBAN_STATUS_LABEL: Record<KanbanStatus, string> = {
  EM_ANALISE: 'Em Análise',
  DOCUMENTACAO: 'Documentação',
  PROPOSTA_ENVIADA: 'Proposta Enviada',
  EM_DISPUTA: 'Em Disputa / Julgamento',
  RESULTADO: 'Resultado',
};

export const PORTAL = [
  'pncp',
  'licitar-digital',
  'bnc-compras',
  'bll-compras',
  'caixa-escolar',
] as const;
export type Portal = (typeof PORTAL)[number];

export const PORTAL_LABEL: Record<Portal, string> = {
  pncp: 'PNCP',
  'licitar-digital': 'LicitarDigital',
  'bnc-compras': 'BNC Compras',
  'bll-compras': 'BLL Compras',
  'caixa-escolar': 'Caixa Escolar',
};

export const RESULTADO = ['GANHOU', 'PERDEU'] as const;
export type Resultado = (typeof RESULTADO)[number];

export interface UserSummary {
  id: string;
  nome: string;
  email: string;
}

export interface User extends UserSummary {
  role: string;
  createdAt: string;
}

export interface Licitacao {
  id: string;
  orgao: string;
  objeto: string;
  modalidade?: string | null;
  valorEstimado?: string | number | null;
  dataAbertura?: string | null;
  dataLimite?: string | null;
  portalOrigem: Portal;
  externalId: string;
  urlOriginal?: string | null;
  status: KanbanStatus;
  resultado?: Resultado | null;
  responsavelId?: string | null;
  responsavel?: UserSummary | null;
  observacoes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StatusHistoryEntry {
  id: string;
  statusAnterior: string | null;
  statusNovo: string;
  alteradoEm: string;
  usuario?: { id: string; nome: string } | null;
}

export interface LicitacaoItem {
  id: string;
  ordem: number;
  descricao: string;
  tipo?: string | null;
  unidade?: string | null;
  quantidade?: string | number | null;
  valorReferencia?: string | number | null;
  valorUnitario?: string | number | null;
  observacoes?: string | null;
  garantiaOfertada?: string | null;
  garantiaExigida?: string | null;
}

export interface LicitacaoDetail extends Licitacao {
  historico: StatusHistoryEntry[];
  itens: LicitacaoItem[];
  detalhamento?: string | null;
  valorTotalProposta?: string | number | null;
  empresaVencedora?: string | null;
  valorVencedor?: string | number | null;
  detalhesSincronizadosEm?: string | null;
}

export interface LicitacoesMeta {
  status: KanbanStatus[];
  portais: Portal[];
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthUser {
  id: string;
  email: string;
  nome: string;
  role: string;
}

export interface LicitacoesFilters {
  portalOrigem?: Portal;
  responsavelId?: string;
  busca?: string;
}