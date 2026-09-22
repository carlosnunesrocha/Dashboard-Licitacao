import { apiRequest } from './client';
import type {
  KanbanStatus,
  Licitacao,
  LicitacaoDetail,
  LicitacoesFilters,
  LicitacoesMeta,
  Portal,
  Resultado,
} from '../types';

export function listLicitacoes(filters: LicitacoesFilters) {
  return apiRequest<Licitacao[]>('/licitacoes', {
    query: {
      portalOrigem: filters.portalOrigem,
      responsavelId: filters.responsavelId,
      busca: filters.busca,
    },
  });
}

export function getMeta() {
  return apiRequest<LicitacoesMeta>('/licitacoes/meta');
}

export function getLicitacao(id: string) {
  return apiRequest<LicitacaoDetail>(`/licitacoes/${id}`);
}

/**
 * Carrega a licitação com os detalhes do portal (itens, proposta, vencedor).
 * Na primeira chamada o backend busca no portal e persiste; depois vem do banco.
 */
export function getLicitacaoDetalhes(id: string) {
  return apiRequest<LicitacaoDetail>(`/integrations/detalhes/${id}`);
}

export function moveLicitacao(id: string, status: KanbanStatus, resultado?: Resultado) {
  return apiRequest<Licitacao>(`/licitacoes/${id}/move`, {
    method: 'PATCH',
    body: { status, resultado },
  });
}

/**
 * Cadastro manual — usado por portais sem integração (BNC, BLL), onde o sync
 * é impossível: reCAPTCHA por requisição e sem exportação. Ver PROGRESS.md.
 */
export interface CreateLicitacaoInput {
  portalOrigem: Portal;
  externalId: string;
  orgao: string;
  objeto: string;
  modalidade?: string;
  valorEstimado?: number;
  dataAbertura?: string;
  dataLimite?: string;
  status?: KanbanStatus;
  responsavelId?: string;
  urlOriginal?: string;
  observacoes?: string;
}

export function createLicitacao(data: CreateLicitacaoInput) {
  return apiRequest<Licitacao>('/licitacoes', { method: 'POST', body: data });
}

export interface UpdateLicitacaoInput {
  responsavelId?: string | null;
  observacoes?: string;
}

export function updateLicitacao(id: string, data: UpdateLicitacaoInput) {
  return apiRequest<Licitacao>(`/licitacoes/${id}`, { method: 'PATCH', body: data });
}