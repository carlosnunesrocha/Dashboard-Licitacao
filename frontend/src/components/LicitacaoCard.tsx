import { useDraggable } from '@dnd-kit/core';
import type { Licitacao } from '../types';
import { PORTAL_LABEL } from '../types';

export function LicitacaoCard({
  licitacao,
  onClick,
}: {
  licitacao: Licitacao;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: licitacao.id,
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 10 }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`kanban-card${isDragging ? ' is-dragging' : ''}`}
      onClick={onClick}
    >
      <div className="kanban-card-header">
        <span className={`portal-badge portal-${licitacao.portalOrigem}`}>
          {PORTAL_LABEL[licitacao.portalOrigem]}
        </span>
        {licitacao.resultado && (
          <span className={`resultado-badge resultado-${licitacao.resultado.toLowerCase()}`}>
            {licitacao.resultado === 'GANHOU' ? 'Ganhou' : 'Perdeu'}
          </span>
        )}
      </div>
      <div className="kanban-card-orgao">{licitacao.orgao}</div>
      <div className="kanban-card-objeto">{licitacao.objeto}</div>
    </div>
  );
}