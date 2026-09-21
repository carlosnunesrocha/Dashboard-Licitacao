import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getLicitacaoDetalhes, updateLicitacao } from '../api/licitacoes';
import { listUsers } from '../api/users';
import { KANBAN_STATUS_LABEL, PORTAL_LABEL } from '../types';
import type { LicitacaoDetail, LicitacaoItem } from '../types';
import { useAuth } from '../context/AuthContext';

function toNumber(value?: string | number | null): number | null {
  if (value === null || value === undefined) return null;
  const num = typeof value === 'string' ? Number(value) : value;
  return Number.isNaN(num) ? null : num;
}

function formatCurrency(value?: string | number | null) {
  const num = toNumber(value);
  if (num === null) return '—';
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatQty(value?: string | number | null) {
  const num = toNumber(value);
  if (num === null) return '—';
  return num.toLocaleString('pt-BR');
}

function formatDateTime(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('pt-BR');
}

function itemTotal(item: LicitacaoItem): number | null {
  const unit = toNumber(item.valorUnitario);
  const qty = toNumber(item.quantidade);
  if (unit === null || qty === null) return null;
  return unit * qty;
}

export function LicitacaoModal({ id, onClose }: { id: string; onClose: () => void }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const queryClient = useQueryClient();

  const {
    data: licitacao,
    isLoading,
    isError,
    error,
  } = useQuery<LicitacaoDetail>({
    queryKey: ['licitacao', id],
    queryFn: () => getLicitacaoDetalhes(id),
  });

  const { data: users } = useQuery({ queryKey: ['users'], queryFn: listUsers });

  const [responsavelId, setResponsavelId] = useState<string | null>(null);
  const [observacoes, setObservacoes] = useState<string | null>(null);

  const updateMutation = useMutation({
    mutationFn: () =>
      updateLicitacao(id, {
        responsavelId: (responsavelId ?? licitacao?.responsavelId) || null,
        observacoes: observacoes ?? licitacao?.observacoes ?? '',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['licitacao', id] });
      queryClient.invalidateQueries({ queryKey: ['licitacoes'] });
    },
  });

  if (isLoading || isError || !licitacao) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-card" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2>{isError ? 'Não foi possível carregar' : 'Carregando detalhes...'}</h2>
            <button className="modal-close" onClick={onClose}>
              ×
            </button>
          </div>
          {isError && (
            <p>{error instanceof Error ? error.message : 'Erro inesperado ao buscar o portal.'}</p>
          )}
        </div>
      </div>
    );
  }

  const perdeu = licitacao.resultado === 'PERDEU';
  const itens = licitacao.itens ?? [];

  // Em "Proposta Enviada" a negociação ainda está em aberto: o que interessa
  // acompanhar é a proposta que mandamos, então só a seção 3 é exibida.
  const somenteProposta = licitacao.status === 'PROPOSTA_ENVIADA';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card licitacao-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{licitacao.orgao}</h2>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-status-row">
          <span className="portal-badge portal-full">{PORTAL_LABEL[licitacao.portalOrigem]}</span>
          <span className="status-pill">{KANBAN_STATUS_LABEL[licitacao.status]}</span>
          {licitacao.resultado && (
            <span className={`resultado-badge resultado-${licitacao.resultado.toLowerCase()}`}>
              {licitacao.resultado === 'GANHOU' ? 'Ganhou' : 'Perdeu'}
            </span>
          )}
        </div>

        <div className="modal-section">
          <label>Objeto</label>
          <p>{licitacao.objeto}</p>
        </div>

        <div className="modal-grid">
          <div className="modal-section">
            <label>Modalidade</label>
            <p>{licitacao.modalidade || '—'}</p>
          </div>
          <div className="modal-section">
            <label>Valor estimado (escola)</label>
            <p>{formatCurrency(licitacao.valorEstimado)}</p>
          </div>
          <div className="modal-section">
            <label>Data de abertura</label>
            <p>{formatDateTime(licitacao.dataAbertura)}</p>
          </div>
          <div className="modal-section">
            <label>Prazo de entrega</label>
            <p>{formatDateTime(licitacao.dataLimite)}</p>
          </div>
        </div>

        {/* Bloco comparativo: só quando perdemos */}
        {perdeu && (
          <div className="comparativo-perda">
            <div>
              <label>Nossa proposta</label>
              <strong>{formatCurrency(licitacao.valorTotalProposta)}</strong>
            </div>
            <div>
              <label>Empresa vencedora</label>
              <strong>{licitacao.empresaVencedora || '—'}</strong>
            </div>
            <div>
              <label>Valor vencedor</label>
              <strong className="valor-vencedor">{formatCurrency(licitacao.valorVencedor)}</strong>
            </div>
          </div>
        )}

        {!somenteProposta && (
          <>
            {/* 1) Detalhamento da solicitação */}
            <div className="modal-section">
              <label>1. Detalhamento da solicitação</label>
              <p className="detalhamento-texto">{licitacao.detalhamento || '—'}</p>
            </div>

            {/* 2) Lista de itens solicitados */}
            <div className="modal-section">
              <label>2. Itens solicitados ({itens.length})</label>
              {itens.length === 0 ? (
                <p>—</p>
              ) : (
                <table className="itens-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Item</th>
                      <th>Un.</th>
                      <th>Qtd.</th>
                      <th>Vl. referência</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itens.map((item) => (
                      <tr key={item.id}>
                        <td>{item.ordem}</td>
                        <td>
                          <strong>{item.tipo || '—'}</strong>
                          <span className="item-descricao">{item.descricao}</span>
                        </td>
                        <td>{item.unidade || '—'}</td>
                        <td>{formatQty(item.quantidade)}</td>
                        <td>{formatCurrency(item.valorReferencia)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {/* Proposta de itens */}
        <div className="modal-section">
          <label>{somenteProposta ? 'Proposta de itens' : '3. Nossa proposta por item'}</label>
          {itens.length === 0 ? (
            <p>—</p>
          ) : (
            <table className="itens-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Item</th>
                  {somenteProposta && <th>Un.</th>}
                  {somenteProposta && <th>Qtd.</th>}
                  <th>Vl. unitário</th>
                  <th>Vl. total</th>
                  <th>Observações</th>
                  <th>Garantia ofertada</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((item) => (
                  <tr key={item.id}>
                    <td>{item.ordem}</td>
                    <td>
                      <strong>{item.tipo || '—'}</strong>
                      {somenteProposta && <span className="item-descricao">{item.descricao}</span>}
                    </td>
                    {somenteProposta && <td>{item.unidade || '—'}</td>}
                    {somenteProposta && <td>{formatQty(item.quantidade)}</td>}
                    <td>{formatCurrency(item.valorUnitario)}</td>
                    <td>{formatCurrency(itemTotal(item))}</td>
                    <td className="celula-texto">{item.observacoes || '—'}</td>
                    <td className="celula-texto">{item.garantiaOfertada || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="proposta-total">
            Valor total do orçamento: <strong>{formatCurrency(licitacao.valorTotalProposta)}</strong>
          </div>
        </div>

        {licitacao.urlOriginal && (
          <div className="modal-section">
            <label>Fonte original</label>
            <p>
              <a href={licitacao.urlOriginal} target="_blank" rel="noreferrer">
                Abrir no portal
              </a>
            </p>
          </div>
        )}

        {isAdmin && (
          <>
            <div className="modal-section">
              <label htmlFor="responsavel">Responsável</label>
              <select
                id="responsavel"
                value={responsavelId ?? licitacao.responsavelId ?? ''}
                onChange={(e) => setResponsavelId(e.target.value)}
              >
                <option value="">Sem responsável</option>
                {users?.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nome}
                  </option>
                ))}
              </select>
            </div>

            <div className="modal-section">
              <label htmlFor="observacoes">Observações internas</label>
              <textarea
                id="observacoes"
                value={observacoes ?? licitacao.observacoes ?? ''}
                onChange={(e) => setObservacoes(e.target.value)}
                rows={3}
              />
            </div>

            <button
              className="btn-primary"
              onClick={() => updateMutation.mutate()}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? 'Salvando...' : 'Salvar alterações'}
            </button>
            {updateMutation.isError && (
              <div className="form-error">Falha ao salvar. Tente novamente.</div>
            )}
          </>
        )}

        <div className="modal-section">
          <label>Histórico de status</label>
          <ul className="historico-list">
            {licitacao.historico.map((h) => (
              <li key={h.id}>
                <span className="status-pill">
                  {KANBAN_STATUS_LABEL[h.statusAnterior as keyof typeof KANBAN_STATUS_LABEL] ?? '—'}
                </span>
                {' → '}
                <span className="status-pill">
                  {KANBAN_STATUS_LABEL[h.statusNovo as keyof typeof KANBAN_STATUS_LABEL] ??
                    h.statusNovo}
                </span>
                <span className="historico-meta">
                  {h.usuario?.nome ?? 'sistema'} · {formatDateTime(h.alteradoEm)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}