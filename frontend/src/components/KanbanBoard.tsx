import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { KANBAN_STATUS } from '../types';
import type { KanbanStatus, Licitacao, Resultado } from '../types';
import { moveLicitacao } from '../api/licitacoes';
import { KanbanColumn } from './KanbanColumn';
import { KanbanResultadoColumn } from './KanbanResultadoColumn';

/** Sub-colunas de Resultado usam ids compostos: "RESULTADO::GANHOU". */
function parseDropTarget(dropId: string): { status: KanbanStatus; resultado?: Resultado } {
  const [status, resultado] = dropId.split('::');
  return { status: status as KanbanStatus, resultado: resultado as Resultado | undefined };
}

export function KanbanBoard({
  licitacoes,
  queryKey,
  onCardClick,
}: {
  licitacoes: Licitacao[];
  queryKey: QueryKey;
  onCardClick: (id: string) => void;
}) {
  const queryClient = useQueryClient();

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const moveMutation = useMutation({
    mutationFn: ({
      id,
      status,
      resultado,
    }: {
      id: string;
      status: KanbanStatus;
      resultado?: Resultado;
    }) => moveLicitacao(id, status, resultado),
    onMutate: async ({ id, status, resultado }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<Licitacao[]>(queryKey);
      queryClient.setQueryData<Licitacao[]>(queryKey, (old) =>
        (old ?? []).map((l) =>
          l.id === id
            ? { ...l, status, resultado: status === 'RESULTADO' ? (resultado ?? null) : null }
            : l,
        ),
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;

    const licitacao = licitacoes.find((l) => l.id === active.id);
    if (!licitacao) return;

    const { status, resultado } = parseDropTarget(String(over.id));

    // nada a fazer se caiu no mesmo lugar
    if (licitacao.status === status && (licitacao.resultado ?? undefined) === resultado) return;

    // mover para Resultado exige saber qual sub-coluna (Ganhou/Perdeu)
    if (status === 'RESULTADO' && !resultado) return;

    moveMutation.mutate({ id: licitacao.id, status, resultado });
  }

  const columns: Record<KanbanStatus, Licitacao[]> = {
    EM_ANALISE: [],
    DOCUMENTACAO: [],
    PROPOSTA_ENVIADA: [],
    EM_DISPUTA: [],
    RESULTADO: [],
  };
  for (const l of licitacoes) {
    columns[l.status]?.push(l);
  }

  const resultadoGanhou = columns.RESULTADO.filter((l) => l.resultado === 'GANHOU');
  const resultadoPerdeu = columns.RESULTADO.filter((l) => l.resultado !== 'GANHOU');

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="kanban-board">
        {KANBAN_STATUS.filter((s) => s !== 'RESULTADO').map((status) => (
          <KanbanColumn
            key={status}
            status={status}
            licitacoes={columns[status]}
            onCardClick={onCardClick}
          />
        ))}
        <KanbanResultadoColumn
          ganhou={resultadoGanhou}
          perdeu={resultadoPerdeu}
          onCardClick={onCardClick}
        />
      </div>
    </DndContext>
  );
}