import { useDroppable } from '@dnd-kit/core';
import type { Licitacao } from '../types';
import { LicitacaoCard } from './LicitacaoCard';

function SubColumn({
  id,
  titulo,
  variante,
  licitacoes,
  onCardClick,
}: {
  id: string;
  titulo: string;
  variante: 'ganhou' | 'perdeu';
  licitacoes: Licitacao[];
  onCardClick: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div className={`resultado-subcoluna${isOver ? ' is-over' : ''}`} ref={setNodeRef}>
      <div className={`resultado-subheader resultado-subheader-${variante}`}>
        <span>{titulo}</span>
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

/**
 * Coluna "Resultado" com título abrangendo duas sub-colunas (Ganhou | Perdeu),
 * como células mescladas numa planilha. Cada sub-coluna é um droppable próprio,
 * então arrastar um card para uma delas já define o resultado.
 */
export function KanbanResultadoColumn({
  ganhou,
  perdeu,
  onCardClick,
}: {
  ganhou: Licitacao[];
  perdeu: Licitacao[];
  onCardClick: (id: string) => void;
}) {
  return (
    <div className="kanban-column resultado-column">
      <div className="kanban-column-header">
        <span>Resultado</span>
        <span className="kanban-column-count">{ganhou.length + perdeu.length}</span>
      </div>
      <div className="resultado-subcolunas">
        <SubColumn
          id="RESULTADO::GANHOU"
          titulo="Ganhou"
          variante="ganhou"
          licitacoes={ganhou}
          onCardClick={onCardClick}
        />
        <SubColumn
          id="RESULTADO::PERDEU"
          titulo="Perdeu"
          variante="perdeu"
          licitacoes={perdeu}
          onCardClick={onCardClick}
        />
      </div>
    </div>
  );
}