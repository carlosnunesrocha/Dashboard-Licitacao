import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getMeta, listLicitacoes } from '../api/licitacoes';
import { listUsers } from '../api/users';
import type { LicitacoesFilters } from '../types';
import { FiltersBar } from '../components/FiltersBar';
import { KanbanBoard } from '../components/KanbanBoard';
import { LicitacaoModal } from '../components/LicitacaoModal';

export function DashboardPage() {
  const [filters, setFilters] = useState<LicitacoesFilters>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const licitacoesQuery = useQuery({
    queryKey: ['licitacoes', filters],
    queryFn: () => listLicitacoes(filters),
  });

  const metaQuery = useQuery({ queryKey: ['meta'], queryFn: getMeta });
  const usersQuery = useQuery({ queryKey: ['users'], queryFn: listUsers });

  return (
    <div className="dashboard">
      <FiltersBar
        filters={filters}
        onChange={setFilters}
        meta={metaQuery.data}
        users={usersQuery.data}
      />

      <div className="dashboard-body">
        {licitacoesQuery.isLoading ? (
          <div className="full-page-loader">Carregando licitações...</div>
        ) : licitacoesQuery.isError ? (
          <div className="form-error">
            Falha ao carregar licitações. Verifique se o backend está no ar.
          </div>
        ) : (
          <KanbanBoard
            licitacoes={licitacoesQuery.data ?? []}
            queryKey={['licitacoes', filters]}
            onCardClick={setSelectedId}
          />
        )}
      </div>

      {selectedId && <LicitacaoModal id={selectedId} onClose={() => setSelectedId(null)} />}
    </div>
  );
}