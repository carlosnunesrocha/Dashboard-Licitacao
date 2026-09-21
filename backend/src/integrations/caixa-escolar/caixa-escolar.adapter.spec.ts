import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CaixaEscolarAdapter } from './caixa-escolar.adapter.js';

/**
 * REDE DE REGRESSÃO do caminho de detalhes da Caixa Escolar.
 *
 * Escrito ANTES de generalizar `PortalAdapter.fetchDetalhes`, que hoje recebe
 * quatro inteiros do domínio deste portal. A Caixa Escolar está em uso com 946
 * registros e é a única integração com detalhes funcionando — estes testes
 * existem para que a mudança de assinatura não a quebre em silêncio.
 *
 * Cobrem o comportamento COMO ELE É hoje, não como deveria ser.
 */

const PROPOSTA_404 = Symbol('404');

interface Cenario {
  budget?: unknown;
  propostas?: unknown | typeof PROPOSTA_404;
  itens?: unknown;
}

/** Roteia o fetch por trecho de URL, como o adaptador as monta. */
function mockFetch(cenario: Cenario) {
  return vi.fn(async (url: string) => {
    if (url.includes('/auth/login')) {
      return {
        ok: true,
        status: 200,
        headers: {
          getSetCookie: () => ['sessionToken=abc123; Path=/; HttpOnly'],
          get: () => 'sessionToken=abc123; Path=/; HttpOnly',
        },
        json: async () => ({}),
      };
    }
    if (url.includes('budget-proposal-item/')) {
      return { ok: true, status: 200, json: async () => cenario.itens ?? { data: [] } };
    }
    if (url.includes('budget-proposal/')) {
      if (cenario.propostas === PROPOSTA_404) {
        return { ok: false, status: 404, json: async () => ({}) };
      }
      return { ok: true, status: 200, json: async () => cenario.propostas ?? { data: [] } };
    }
    if (url.includes('budget/')) {
      // `in` e não `??`: passar `budget: null` precisa simular corpo nulo, e
      // `null ?? {}` viraria objeto vazio — o cenário que se quer testar some.
      const corpo = 'budget' in cenario ? cenario.budget : {};
      return { ok: true, status: 200, json: async () => corpo };
    }
    throw new Error(`URL não prevista no teste: ${url}`);
  });
}

function item(over: Record<string, unknown> = {}) {
  return {
    nuItemOrder: 1,
    txDescription: 'Papel A4 75g',
    txBudgetItemType: 'Material',
    txBudgetItemUnit: 'Resma',
    nuQuantity: '10',
    nuReferralValue: 25.5,
    nuValueByItem: 22,
    txItemObservation: null,
    txWarrantyDescription: null,
    txWarrantyRequired: null,
    ...over,
  };
}

const NOSSO_FORNECEDOR = 777;

function criar() {
  const config = {
    get: vi.fn((k: string) =>
      ({ CAIXA_ESCOLAR_USER: 'usuario', CAIXA_ESCOLAR_PASS: 'senha' })[k],
    ),
  };
  const licitacoes = {
    isPortalItemRegistered: vi.fn().mockResolvedValue(false),
    upsertFromIntegration: vi.fn().mockResolvedValue(undefined),
    marcarDesaparecidos: vi.fn().mockResolvedValue(0),
  };
  return new CaixaEscolarAdapter(config as never, licitacoes as never);
}

describe('CaixaEscolarAdapter.fetchDetalhes', () => {
  let fetchMock: ReturnType<typeof mockFetch>;

  function cenario(c: Cenario) {
    fetchMock = mockFetch(c);
    vi.stubGlobal('fetch', fetchMock);
    return criar();
  }

  beforeEach(() => vi.clearAllMocks());

  it('identifica o portal como caixa-escolar', () => {
    expect(criar().id).toBe('caixa-escolar');
  });

  it('devolve detalhamento e itens do orçamento', async () => {
    const adapter = cenario({
      budget: { initiativeDescription: 'Aquisição de material de escritório' },
      itens: { data: [item()] },
    });

    const d = await adapter.fetchDetalhes(1, 2, 3, NOSSO_FORNECEDOR);

    expect(d.detalhamento).toBe('Aquisição de material de escritório');
    expect(d.itens).toHaveLength(1);
    expect(d.itens[0]).toMatchObject({
      ordem: 1,
      descricao: 'Papel A4 75g',
      unidade: 'Resma',
      quantidade: 10,
      valorReferencia: 25.5,
      valorUnitario: 22,
    });
  });

  it('monta as URLs com subprograma, escola, orçamento e fornecedor', async () => {
    const adapter = cenario({ budget: {}, itens: { data: [] } });

    await adapter.fetchDetalhes(11, 22, 33, 44);

    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes('by-subprogram/11/by-school/22/by-budget/33'))).toBe(true);
    expect(urls.some((u) => u.includes('by-supplier/44'))).toBe(true);
  });

  it('faz login quando ainda não há sessão', async () => {
    const adapter = cenario({ budget: {}, itens: { data: [] } });

    await adapter.fetchDetalhes(1, 2, 3, NOSSO_FORNECEDOR);

    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/auth/login'))).toBe(true);
  });

  describe('licitação ainda em disputa (portal responde 404 nas propostas)', () => {
    it('não quebra e calcula o total somando valorUnitario × quantidade', async () => {
      // Regressão real: não tratar esse 404 fazia o pop-up falhar inteiro.
      const adapter = cenario({
        budget: { initiativeDescription: 'Em disputa' },
        propostas: PROPOSTA_404,
        itens: { data: [item({ nuValueByItem: 22, nuQuantity: '10' })] },
      });

      const d = await adapter.fetchDetalhes(1, 2, 3, NOSSO_FORNECEDOR);

      expect(d.valorTotalProposta).toBe(220);
      expect(d.empresaVencedora).toBeNull();
      expect(d.itens).toHaveLength(1);
    });
  });

  describe('resultado decidido', () => {
    it('expõe a empresa vencedora e o valor dela quando perdemos', async () => {
      const adapter = cenario({
        budget: { initiativeDescription: 'Decidido', idSupplierProposalWinner: 999 },
        propostas: {
          data: [
            { idSupplier: 999, txFantasyName: 'Concorrente Ltda ', totalPropose: '180' },
            { idSupplier: NOSSO_FORNECEDOR, txFantasyName: 'Nossa Empresa', totalPropose: '220' },
          ],
        },
        itens: { data: [item()] },
      });

      const d = await adapter.fetchDetalhes(1, 2, 3, NOSSO_FORNECEDOR);

      expect(d.empresaVencedora).toBe('Concorrente Ltda');
      expect(d.valorVencedor).toBe(180);
      expect(d.valorTotalProposta).toBe(220);
    });

    it('não aponta vencedor quando quem ganhou fomos nós', async () => {
      const adapter = cenario({
        budget: { initiativeDescription: 'Ganhamos', idSupplierProposalWinner: NOSSO_FORNECEDOR },
        propostas: {
          data: [{ idSupplier: NOSSO_FORNECEDOR, txFantasyName: 'Nossa Empresa', totalPropose: '200' }],
        },
        itens: { data: [item()] },
      });

      const d = await adapter.fetchDetalhes(1, 2, 3, NOSSO_FORNECEDOR);

      expect(d.empresaVencedora).toBeNull();
      expect(d.valorVencedor).toBeNull();
      expect(d.valorTotalProposta).toBe(200);
    });
  });

  it('corrige o mojibake da API (UTF-8 lido como Latin-1)', async () => {
    // A API devolve 'Aquisição' como 'AquisiÃ§Ã£o'. fixEncoding reverte.
    const adapter = cenario({
      budget: { initiativeDescription: 'AquisiÃ§Ã£o de materiais' },
      itens: { data: [item({ txDescription: 'Caderno universitÃ¡rio' })] },
    });

    const d = await adapter.fetchDetalhes(1, 2, 3, NOSSO_FORNECEDOR);

    expect(d.detalhamento).toBe('Aquisição de materiais');
    expect(d.itens[0].descricao).toBe('Caderno universitário');
  });

  it('falha de forma explícita se o orçamento não existe no portal', async () => {
    const adapter = cenario({ budget: null, itens: { data: [] } });

    await expect(adapter.fetchDetalhes(1, 2, 3, NOSSO_FORNECEDOR)).rejects.toThrow(
      /não encontrado/i,
    );
  });

  it('usa "Sem descrição" quando o item vem sem texto', async () => {
    const adapter = cenario({
      budget: {},
      itens: { data: [item({ txDescription: null })] },
    });

    const d = await adapter.fetchDetalhes(1, 2, 3, NOSSO_FORNECEDOR);

    expect(d.itens[0].descricao).toBe('Sem descrição');
  });
});
