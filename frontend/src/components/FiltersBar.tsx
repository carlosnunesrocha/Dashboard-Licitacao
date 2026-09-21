import { useEffect, useState } from 'react';
import type { LicitacoesFilters, LicitacoesMeta, User } from '../types';
import { PORTAL_LABEL } from '../types';
import { useAuth } from '../context/AuthContext';

export function FiltersBar({
  filters,
  onChange,
  meta,
  users,
}: {
  filters: LicitacoesFilters;
  onChange: (filters: LicitacoesFilters) => void;
  meta?: LicitacoesMeta;
  users?: User[];
}) {
  const { user, logout } = useAuth();
  const [busca, setBusca] = useState(filters.busca ?? '');

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (busca !== (filters.busca ?? '')) onChange({ ...filters, busca: busca || undefined });
    }, 400);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca]);

  return (
    <div className="filters-bar">
      <div className="filters-bar-title">
        <h1>Painel de Licitações</h1>
      </div>

      <div className="filters-bar-controls">
        <input
          type="text"
          placeholder="Buscar por órgão, objeto ou modalidade..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />

        <select
          value={filters.portalOrigem ?? ''}
          onChange={(e) =>
            onChange({ ...filters, portalOrigem: (e.target.value || undefined) as never })
          }
        >
          <option value="">Todos os portais</option>
          {meta?.portais.map((p) => (
            <option key={p} value={p}>
              {PORTAL_LABEL[p]}
            </option>
          ))}
        </select>

        <select
          value={filters.responsavelId ?? ''}
          onChange={(e) => onChange({ ...filters, responsavelId: e.target.value || undefined })}
        >
          <option value="">Todos os responsáveis</option>
          {users?.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nome}
            </option>
          ))}
        </select>
      </div>

      <div className="filters-bar-user">
        <span>{user?.nome}</span>
        <button className="btn-link" onClick={logout}>
          Sair
        </button>
      </div>
    </div>
  );
}