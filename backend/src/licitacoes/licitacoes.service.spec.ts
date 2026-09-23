import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LicitacoesService } from './licitacoes.service.js';

/**
 * REDE DE REGRESSÃO das regras de proposta manual e data de resultado.
 *
 * As quatro regras aqui protegem números que vão alimentar o dashboard, e
 * todas falham em SILÊNCIO se quebrarem — o campo simplesmente fica com o
 * valor errado, sem erro nenhum. Daí valerem teste próprio.
 */

/** Prisma mínimo: só os métodos que o serviço chama nestes caminhos. */
function prismaFake(registro: Record<string, unknown> = {}) {
  const update = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...data }));
  return {
    update,
    licitacao: {
      findUnique: vi.fn(async () => registro),
      findFirst: vi.fn(async () => registro),
      findMany: vi.fn(
        async (_args: { where?: { OR?: unknown[] } }): Promise<{ id: string }[]> => [],
      ),
      update,
      upsert: vi.fn(async ({ update: dadosUpdate }: { update: Record<string, unknown> }) => ({
        ...dadosUpdate,
      })),
    },
    licitacaoItem: { deleteMany: vi.fn() },
    $transaction: vi.fn(async (ops: unknown[]) => ops),
  };
}

function servico(prisma: ReturnType<typeof prismaFake>) {
  const s = new LicitacoesService(prisma as never);
  // findOne faz include pesado e não interessa a estas regras.
  vi.spyOn(s, 'findOne').mockResolvedValue({ status: 'EM_ANALISE' } as never);
  return s;
}

describe('proposta digitada pela operadora', () => {
  let prisma: ReturnType<typeof prismaFake>;

  beforeEach(() => {
    prisma = prismaFake({ valorPropostaManual: false });
  });

  it('marca como manual quando a operadora grava valor e data', async () => {
    await servico(prisma).update('id', {
      valorTotalProposta: 12345.67,
      dataProposta: '2026-09-10T00:00:00.000Z',
    });

    const { data } = prisma.licitacao.update.mock.calls[0][0];
    expect(data.valorTotalProposta).toBe(12345.67);
    expect(data.valorPropostaManual).toBe(true);
    expect(data.dataPropostaManual).toBe(true);
  });

  it('limpar o campo (null) também solta a trava, senão ficaria vazio e travado', async () => {
    await servico(prisma).update('id', { valorTotalProposta: null, dataProposta: null });

    const { data } = prisma.licitacao.update.mock.calls[0][0];
    expect(data.valorTotalProposta).toBeNull();
    expect(data.valorPropostaManual).toBe(false);
    expect(data.dataPropostaManual).toBe(false);
  });

  it('campo ausente no payload não mexe na marca', async () => {
    await servico(prisma).update('id', { observacoes: 'só um comentário' });

    const { data } = prisma.licitacao.update.mock.calls[0][0];
    expect(data).not.toHaveProperty('valorPropostaManual');
    expect(data).not.toHaveProperty('dataPropostaManual');
  });

  it('o sync de detalhes NÃO apaga o valor digitado', async () => {
    // É o caso real do LicitarDigital: o portal devolve null, e sem a trava
    // cada rodada de detalhes zeraria o que a operadora digitou.
    prisma = prismaFake({ valorPropostaManual: true });
    const s = servico(prisma);

    await s.salvarDetalhes('id', {
      detalhamento: 'x',
      valorTotalProposta: null,
      empresaVencedora: null,
      valorVencedor: null,
      itens: [],
    } as never);

    const { data } = prisma.update.mock.calls[0][0];
    expect(data).not.toHaveProperty('valorTotalProposta');
  });

  it('sem marca manual, o detalhe do portal grava normalmente', async () => {
    prisma = prismaFake({ valorPropostaManual: false });

    await servico(prisma).salvarDetalhes('id', {
      detalhamento: 'x',
      valorTotalProposta: 999,
      empresaVencedora: null,
      valorVencedor: null,
      itens: [],
    } as never);

    const { data } = prisma.update.mock.calls[0][0];
    expect(data.valorTotalProposta).toBe(999);
  });
});

describe('detalhe incompleto (Perdeu sem vencedor)', () => {
  it('a fila do backfill inclui quem foi buscado cedo demais', async () => {
    // O portal só publica a lista de concorrentes depois de concluir; até lá
    // o card fica em Perdeu sem vencedor. Se a fila olhasse só
    // detalhesSincronizadosEm, esse card nunca mais seria buscado.
    const prisma = prismaFake({});

    await new LicitacoesService(prisma as never).idsSemDetalhes('caixa-escolar');

    const { where } = prisma.licitacao.findMany.mock.calls[0][0]!;
    expect(where?.OR).toEqual([
      { detalhesSincronizadosEm: null },
      { resultado: 'PERDEU', empresaVencedora: null },
    ]);
  });
});

describe('dataResultado', () => {
  it('carimba ao ENTRAR em Resultado', async () => {
    const prisma = prismaFake({});
    const s = new LicitacoesService(prisma as never);
    vi.spyOn(s, 'findOne').mockResolvedValue({ status: 'EM_DISPUTA' } as never);

    await s.move('id', { status: 'RESULTADO', resultado: 'GANHOU' }, 'user');

    const { data } = prisma.licitacao.update.mock.calls.at(-1)![0];
    expect(data.dataResultado).toBeInstanceOf(Date);
  });

  it('trocar Ganhou por Perdeu NÃO reescreve a data', async () => {
    // Já estava em Resultado: não é resultado novo. Reescrever falsearia o
    // relatório do mês.
    const prisma = prismaFake({});
    const s = new LicitacoesService(prisma as never);
    vi.spyOn(s, 'findOne').mockResolvedValue({ status: 'RESULTADO' } as never);

    await s.move('id', { status: 'RESULTADO', resultado: 'PERDEU' }, 'user');

    const { data } = prisma.licitacao.update.mock.calls.at(-1)![0];
    expect(data).not.toHaveProperty('dataResultado');
  });

  it('sair de Resultado limpa a data', async () => {
    const prisma = prismaFake({});
    const s = new LicitacoesService(prisma as never);
    vi.spyOn(s, 'findOne').mockResolvedValue({ status: 'RESULTADO' } as never);

    await s.move('id', { status: 'EM_DISPUTA' }, 'user');

    const { data } = prisma.licitacao.update.mock.calls.at(-1)![0];
    expect(data.dataResultado).toBeNull();
  });

  it('card que CHEGA do portal já resolvido fica sem data', async () => {
    // Os 891 importados em 14/09 caem aqui: a decisão é anterior ao sistema e
    // o portal não diz quando foi. Carimbar hoje faria parecer que 891
    // resultados saíram no mesmo dia.
    const prisma = prismaFake({ resultado: 'GANHOU', dataPropostaManual: false });

    await new LicitacoesService(prisma as never).upsertFromIntegration('caixa-escolar', {
      externalId: '1',
      orgao: 'x',
      objeto: 'y',
      resultadoSugerido: 'GANHOU',
    });

    const { update } = prisma.licitacao.upsert.mock.calls[0][0];
    expect(update).not.toHaveProperty('dataResultado');
  });

  it('resultado que APARECE num card já acompanhado ganha data', async () => {
    const prisma = prismaFake({ resultado: null, dataPropostaManual: false });

    await new LicitacoesService(prisma as never).upsertFromIntegration('caixa-escolar', {
      externalId: '1',
      orgao: 'x',
      objeto: 'y',
      resultadoSugerido: 'GANHOU',
    });

    const { update } = prisma.licitacao.upsert.mock.calls[0][0];
    expect(update.dataResultado).toBeInstanceOf(Date);
  });
});
