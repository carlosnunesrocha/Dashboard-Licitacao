import { useDroppable } from '@dnd-kit/core';
import type { KanbanStatus, Licitacao } from '../types';
import { KANBAN_STATUS_LABEL } from '../types';
import { LicitacaoCard } from './LicitacaoCard';

export function KanbanColumn({
  status,
  licitacoes,
  onCardClick,
}: {
  status: KanbanStatus;
  licitacoes: Licitacao[];
  onCardClick: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div className={`kanban-column${isOver ? ' is-over' : ''}`} ref={setNodeRef}>
      <div className="kanban-column-header">
        <span>{KANBAN_STATUS_LABEL[status]}</span>
        <span className="kanban-column-count">{licitacoes.length}</span>
      </div>
      <div className="kanban-column-body">
        {licitacoes.map((l) => (
          <LicitacaoCard key={l.id} licitacao={l} onClick={() => onCardClick(l.id)} />
        ))}
        {licitacoes.length === 0 && <div className="kanban-column-empty">Sem licitações</div>}
      </div>
    </div>
  );
}