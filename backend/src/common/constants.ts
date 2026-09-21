export const KANBAN_STATUS = [
  'EM_ANALISE',
  'DOCUMENTACAO',
  'PROPOSTA_ENVIADA',
  'EM_DISPUTA',
  'RESULTADO',
] as const;
export type KanbanStatus = (typeof KANBAN_STATUS)[number];

export const PORTAL = [
  'pncp',
  'licitar-digital',
  'bnc-compras',
  'bll-compras',
  'caixa-escolar',
] as const;
export type Portals = (typeof PORTAL)[number];

export const RESULTADO = ['GANHOU', 'PERDEU'] as const;
export type Resultado = (typeof RESULTADO)[number];

export interface UserPrincipal {
  id: string;
  email: string;
  nome: string;
  role: string;
}