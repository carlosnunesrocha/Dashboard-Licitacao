import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '../components/layout/PageHeader';
import { ExtendedLicitacaoCard } from '../components/ExtendedLicitacaoCard';
import { LicitacaoModal } from '../components/LicitacaoModal';
import { FiltersBar } from '../components/FiltersBar';
import { getMeta, createLicitacao, deleteLicitacao } from '../api/licitacoes';
import { getCacheOportunidades, invalidateCacheOportunidades, setCacheOportunidades } from '../lib/oportunidadesCache';
import { listUsers } from '../api/users';
import { PORTAL_LABEL } from '../types';
import type { Licitacao, Portal } from '../types';
import { apiRequest } from '../api/client';

const KEYWORDS = [
  'papel a4', 'papel a3', 'papel sulfite', 'papel alcalino', 'resma', 'resma a4',
  'resma a3', 'chamex', 'papel 75g', 'papel 90g', 'papelaria', 'material de expediente',
  'materiais de expediente', 'material de escritório', 'materiais de escritório',
  'artigos de escritório', 'suprimentos de escritório', 'material de papelaria',
  'materiais de papelaria', 'artigos de papelaria', 'material escolar', 'materiais escolares',
  'material pedagogico', 'kit escolar', 'kit material escolar', 'kit aluno', 'kit estudante',
  'material pedagógico', 'caderno', 'caneta', 'lápis', 'pasta', 'arquivo', 'arquivo morto',
  'caixa arquivo', 'envelope', 'cola', 'grampeador', 'grampo', 'clips', 'borracha', 'corretivo',
  'lapiseira', 'fichário', 'etiqueta adesiva', 'bloco de notas', 'marca texto', 'marcador permanente',
  'pincel atômico', 'quadro branco', 'calculadora', 'tesoura', 'estilete', 'régua', 'fita adesiva',
  'fita crepe', 'cartolina', 'agenda', 'livro ata', 'prancheta', 'giz', 'eva',
];

interface Oportunidade {
  id: string;
  externalId: string;
  portalOrigem?: string;
  orgao: string;
  objeto: string;
  modalidade?: string;
  valorEstimado?: number;
  dataAbertura?: string;
  dataLimite?: string;
  urlOriginal?: string;
}

function fetchOportunidades(busca?: string): Promise<Oportunidade[]> {
  const q = encodeURIComponent(KEYWORDS.join(','));
  const buscaParam = busca ? `&busca=${encodeURIComponent(busca)}` : '';
  return apiRequest<{ data: Oportunidade[] }>(
    `/integrations/caixa-escolar/oportunidades?q=${q}${buscaParam}`,
  ).then((res) => res.data);
}

export function LicitacoesPage() {
  const queryClient = useQueryClient();
  const [busca, setBusca] = useState('');
  const [portalAtivo, setPortalAtivo] = useState('');
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [modoSelecao, setModoSelecao] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [modalOportunidade, setModalOportunidade] = useState<Oportunidade | null>(null);
  const [modalLicitacao, setModalLicitacao] = useState<Licitacao | null>(null);

  const metaQuery = useQuery({ queryKey: ['meta'], queryFn: getMeta });
  const usersQuery = useQuery({ queryKey: ['users'], queryFn: listUsers });

  const {
    data: oportunidades = [],
    isLoading: loading,
    isError,
    error,
  } = useQuery({
    queryKey: ['oportunidades', 'caixa-escolar', busca, portalAtivo],
    queryFn: () => fetchOportunidades(busca),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 2,
    initialData: () => getCacheOportunidades() as Oportunidade[] | undefined,
  });

  // Cache local: grava no localStorage quando o fetch completa (24h TTL).
  useEffect(() => {
    if (oportunidades.length > 0) setCacheOportunidades(oportunidades);
  }, [oportunidades]);

  const addMut = useMutation({
    mutationFn: (op: Oportunidade) =>
      createLicitacao({
        portalOrigem: 'caixa-escolar',
        externalId: op.externalId,
        orgao: op.orgao,
        objeto: op.objeto,
        modalidade: op.modalidade,
        dataAbertura: op.dataAbertura ?? undefined,
        dataLimite: op.dataLimite ?? undefined,
        valorEstimado: op.valorEstimado,
        urlOriginal: op.urlOriginal,
        status: 'EM_ANALISE',
      }),
    onMutate: async (op) => {
      await queryClient.cancelQueries({ queryKey: ['oportunidades', 'caixa-escolar', busca, portalAtivo] });
      const prev = queryClient.getQueryData<Oportunidade[]>(['oportunidades', 'caixa-escolar', busca, portalAtivo]);
      queryClient.setQueryData<Oportunidade[]>(
        ['oportunidades', 'caixa-escolar', busca, portalAtivo],
        (old) => (old ?? []).filter((o) => o.id !== op.id),
      );
      alert(`"${op.orgao}" adicionada ao Kanban em Em Análise.`);
      return { prev };
    },
    onSuccess: () => {
      invalidateCacheOportunidades();
    },
    onError: (_err, _op, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['oportunidades', 'caixa-escolar', busca, portalAtivo], ctx.prev);
      alert('Erro ao adicionar ao Kanban. Tente novamente.');
    },
  });

  const delMut = useMutation({
    mutationFn: (op: Oportunidade) => deleteLicitacao(op.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['oportunidades', 'caixa-escolar', busca, portalAtivo] }),
  });

  async function adicionarAoKanban(op: Oportunidade) {
    if (!window.confirm(`Adicionar "${op.orgao}" ao Kanban para análise?`)) return;
    await addMut.mutateAsync(op);
  }

  async function excluirSelecionados() {
    if (!window.confirm(`Remover ${selecionados.size} oportunidade(s)?`)) return;
    setExcluindo(true);
    try {
      for (const id of Array.from(selecionados)) {
        await delMut.mutateAsync({ id } as any);
      }
      setSelecionados(new Set());
    } finally {
      setExcluindo(false);
    }
  }

  function toggleSelecao(id: string) {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function cancelarSelecao() {
    setModoSelecao(false);
    setSelecionados(new Set());
  }

  return (
    <div className="licitacoes-page">
      <PageHeader
        titulo="Licitações"
        descricao="Oportunidades monitoradas pelo sistema"
      />

      <FiltersBar
        filters={{ busca: busca || undefined, portalOrigem: (portalAtivo || undefined) as never }}
        onChange={(f) => {
          setBusca(f.busca ?? '');
          setPortalAtivo(f.portalOrigem ?? '');
        }}
        meta={metaQuery.data}
        users={usersQuery.data}
        onNovaLicitacao={() => {}}
      />

      <div className="licitacoes-toolbar" style={{ margin: '16px 0', display: 'flex', gap: '8px', alignItems: 'center' }}>
        {modoSelecao ? (
          <>
            <button
              className="btn-secondary"
              onClick={() => setSelecionados(new Set(
                oportunidades.filter((op) => !selecionados.has(op.id)).map((op) => op.id)
              ))}
              disabled={excluindo || oportunidades.every((op) => selecionados.has(op.id))}
            >
              Selecionar todos
            </button>
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              {selecionados.size} selecionada(s)
            </span>
            <button className="btn-secondary" onClick={cancelarSelecao} disabled={excluindo}>
              Cancelar
            </button>
            <button
              style={{
                background: 'var(--danger)', color: 'white', border: 'none',
                borderRadius: '6px', padding: '10px 18px', fontWeight: 600,
                cursor: selecionados.size === 0 ? 'default' : 'pointer',
                opacity: selecionados.size === 0 ? 0.6 : 1,
              }}
              onClick={excluirSelecionados}
              disabled={selecionados.size === 0 || excluindo}
            >
              {excluindo ? 'Excluindo...' : `Excluir (${selecionados.size})`}
            </button>
          </>
        ) : (
          <button className="btn-secondary" onClick={() => setModoSelecao(true)}>
            Selecionar
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>Carregando oportunidades...</div>
      ) : isError ? (
        <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
          Falha ao carregar oportunidades: {String(error)}
        </div>
      ) : oportunidades.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
          Nenhuma oportunidade encontrada para os filtros aplicados.
        </div>
      ) : (
        <div className="licitacao-list">
          {oportunidades.map((op) => (
            <div key={op.id} style={{ position: 'relative' }}>
              {modoSelecao && (
                <div style={{ position: 'absolute', top: '16px', left: '16px', zIndex: 2 }}>
                  <input
                    type="checkbox"
                    checked={selecionados.has(op.id)}
                    onChange={() => toggleSelecao(op.id)}
                    style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              )}
              <ExtendedLicitacaoCard
                licitacao={op as unknown as Licitacao}
                compact
                onClick={() => (modoSelecao ? toggleSelecao(op.id) : setModalOportunidade(op))}
              />
              {!modoSelecao && (
                <div style={{ position: 'absolute', bottom: '20px', right: '20px' }}>
                  <button
                    className="btn-primary"
                    style={{ fontSize: '13px', padding: '6px 14px' }}
                    disabled={addMut.isPending && addMut.variables?.id === op.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      adicionarAoKanban(op);
                    }}
                  >
                    {addMut.isPending && addMut.variables?.id === op.id ? 'Adicionando...' : '+ Kanban'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {modalOportunidade && (
        <OportunidadeModal
          oportunidade={modalOportunidade}
          onClose={() => setModalOportunidade(null)}
          onAdicionarAoKanban={(op) => adicionarAoKanban(op)}
        />
      )}

      {modalLicitacao && (
        <LicitacaoModal
          id={modalLicitacao.id}
          onClose={() => setModalLicitacao(null)}
        />
      )}
    </div>
  );
}

/**
 * Popup: exibe portal, modalidade, datas e um botão "+ Kanban" que envia
 * TODOS os dados da oportunidade para o banco principal em uma única chamada.
 */
function OportunidadeModal({
  oportunidade,
  onClose,
  onAdicionarAoKanban,
}: {
  oportunidade: Oportunidade;
  onClose: () => void;
  onAdicionarAoKanban: (op: Oportunidade) => void;
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{oportunidade.orgao}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div style={{ marginBottom: '16px' }}>
            <span className={`portal-badge portal-${oportunidade.portalOrigem ?? 'caixa-escolar'}`}>
              {PORTAL_LABEL[(oportunidade.portalOrigem ?? 'caixa-escolar') as Portal]}
            </span>
          </div>

          <div style={{ marginBottom: '12px' }}>
            <strong style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Objeto
            </strong>
            {oportunidade.objeto}
          </div>

          <div style={{ marginBottom: '12px' }}>
            <strong style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Modalidade
            </strong>
            {oportunidade.modalidade || '—'}
          </div>

          <div style={{ display: 'flex', gap: '24px', fontSize: '13px', marginBottom: '16px' }}>
            {oportunidade.dataAbertura && (
              <div>
                <strong>Abertura</strong>
                <div>{new Date(oportunidade.dataAbertura).toLocaleDateString('pt-BR')}</div>
              </div>
            )}
            {oportunidade.dataLimite && (
              <div>
                <strong>Encerramento</strong>
                <div>{new Date(oportunidade.dataLimite).toLocaleDateString('pt-BR')}</div>
              </div>
            )}
          </div>

          {oportunidade.urlOriginal && (
            <div style={{ marginBottom: '16px' }}>
              <a href={oportunidade.urlOriginal} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--btn-action)' }}>
                Ver no portal →
              </a>
            </div>
          )}
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Fechar</button>
          <button
            className="btn-primary"
            onClick={() => {
              onAdicionarAoKanban(oportunidade);
              onClose();
            }}
          >
            + Kanban
          </button>
        </div>
      </div>
    </div>
  );
}
