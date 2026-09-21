import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuctionNotice } from './licitar-digital.client.js';

/**
 * O foco destes testes são as guardas do adaptador, não o caminho feliz.
 *
 * Este portal tem um modo de falha silencioso e destrutivo: sem Authorization
 * válido a API não devolve erro — ela ignora o shortFilter e responde a
 * consulta pública inteira (~101 mil editais, flags todas false). E como o
 * sync termina chamando `marcarDesaparecidos`, uma resposta vazia ou parcial
 * esvazia o board. As duas coisas parecem sucesso se ninguém verificar.
 *
 * O cliente é mockado de propósito: o transporte (curl) é detalhe dele, e
 * está coberto em licitar-digital.client.spec.ts.
 */

const { buscarPagina } = vi.hoisted(() => ({ buscarPagina: vi.fn() }));

// Classe, não vi.fn(arrow): o adaptador faz `new LicitarDigitalClient(...)`,
// e arrow function não é construtível.
vi.mock('./licitar-digital.client.js', () => ({
  LicitarDigitalClient: class {
    buscarPagina = buscarPagina;
  },
}));

const { LicitarDigitalAdapter } = await import('./licitar-digital.adapter.js');

/** Item moldado na resposta real de doSearchAuctionNotice (2026-09-21). */
function licitacao(over: Partial<AuctionNotice> = {}): AuctionNotice {
  return {
    id: 112357,
    auctionType: 'E',
    auctionNumber: '154/2026',
    accreditationNumber: '077/2026',
    auctionFinished: 0,
    startDateTimeDispute: '2026-09-17T12:00:00.000Z',
    methodDispute: 2,
    simpleDescription: 'Aquisição de materiais de expediente (papelaria).',
    auctionStartDate: '2026-09-03T19:00:00.000Z',
    auctionEndDate: null,
    organizationUnitName: 'MUNICÍPIO DE UBERABA',
    organizationName: 'Prefeitura Municipal de Uberaba',
    biddingStageId: 10,
    auctionCanceled: 0,
    platform: 'ammlicita',
    isFavorite: true,
    hasProposal: true,
    isSuggestion: false,
    ...over,
  };
}

function pagina(data: AuctionNotice[], count: number, offset = 0) {
  return { data, meta: { count, limit: 20, offset } };
}

describe('LicitarDigitalAdapter', () => {
  let licitacoes: {
    isPortalItemRegistered: ReturnType<typeof vi.fn>;
    upsertFromIntegration: ReturnType<typeof vi.fn>;
    marcarDesaparecidos: ReturnType<typeof vi.fn>;
  };

  function criar(valores: Record<string, string | undefined> = {}) {
    const padrao: Record<string, string | undefined> = {
      LICITAR_DIGITAL_TOKEN: 'token-de-teste',
      LICITAR_DIGITAL_FILTRO: 'favorite',
      ...valores,
    };
    const config = { get: vi.fn((k: string) => padrao[k]) };
    return new LicitarDigitalAdapter(config as never, licitacoes as never);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    licitacoes = {
      isPortalItemRegistered: vi.fn().mockResolvedValue(false),
      upsertFromIntegration: vi.fn().mockResolvedValue(undefined),
      marcarDesaparecidos: vi.fn().mockResolvedValue(0),
    };
  });

  describe('guardas de escopo', () => {
    it('aborta quando a resposta traz o universo público em vez da empresa', async () => {
      // O sintoma exato de token inválido: count gigante, flags todas false.
      buscarPagina.mockResolvedValue(
        pagina([licitacao({ hasProposal: false, isFavorite: false })], 101_915),
      );

      await expect(criar().sync()).rejects.toThrow(/consulta pública|101915/i);
      expect(licitacoes.upsertFromIntegration).not.toHaveBeenCalled();
      expect(licitacoes.marcarDesaparecidos).not.toHaveBeenCalled();
    });

    it('aborta se algum item não pertence ao filtro pedido', async () => {
      // Filtro padrão é favorite: o intruso é um item sem isFavorite.
      buscarPagina.mockResolvedValue(
        pagina([licitacao(), licitacao({ id: 999, isFavorite: false })], 2),
      );

      await expect(criar().sync()).rejects.toThrow(/não escopada|999/i);
      expect(licitacoes.marcarDesaparecidos).not.toHaveBeenCalled();
    });

    it('valida contra hasProposal quando o filtro é proposal', async () => {
      buscarPagina.mockResolvedValue(
        pagina([licitacao({ isFavorite: true, hasProposal: false })], 1),
      );

      await expect(
        criar({ LICITAR_DIGITAL_FILTRO: 'proposal' }).sync(),
      ).rejects.toThrow(/não escopada/i);
    });

    it('aceita favorito sem proposta — é o critério do negócio', async () => {
      // Dos 29 favoritos reais, 11 não têm proposta. Eles DEVEM entrar.
      buscarPagina.mockResolvedValue(
        pagina([licitacao({ isFavorite: true, hasProposal: false })], 1),
      );

      const res = await criar().sync();

      expect(res.imported).toBe(1);
    });
  });

  describe('proteção do board', () => {
    it('NÃO marca desaparecidos quando o portal não devolve nada', async () => {
      // A guarda mais importante: marcarDesaparecidos([]) marcaria todos os
      // registros do portal como sumidos, esvaziando o painel — e o sync
      // pareceria bem-sucedido.
      buscarPagina.mockResolvedValue(pagina([], 0));

      const res = await criar().sync();

      expect(licitacoes.marcarDesaparecidos).not.toHaveBeenCalled();
      expect(res.errored).toBe(true);
      expect(res.errorMsg).toMatch(/nenhum registro/i);
    });

    it('aborta se uma página vier vazia antes do fim da paginação', async () => {
      buscarPagina
        .mockResolvedValueOnce(pagina([licitacao()], 60))
        .mockResolvedValueOnce(pagina([], 60, 1));

      await expect(criar().sync()).rejects.toThrow(/inconsistente|página vazia/i);
      expect(licitacoes.marcarDesaparecidos).not.toHaveBeenCalled();
    });

    it('marca desaparecidos só depois de varrer todas as páginas', async () => {
      buscarPagina
        .mockResolvedValueOnce(pagina([licitacao({ id: 1 })], 2))
        .mockResolvedValueOnce(pagina([licitacao({ id: 2 })], 2, 1));

      await criar().sync();

      expect(licitacoes.marcarDesaparecidos).toHaveBeenCalledTimes(1);
      expect(licitacoes.marcarDesaparecidos).toHaveBeenCalledWith('licitar-digital', ['1', '2']);
    });
  });

  describe('paginação', () => {
    it('percorre todas as páginas avançando o offset pelo que veio', async () => {
      // count=29 é o caso real dos favoritos: 2 páginas, a segunda com 9.
      const p1 = Array.from({ length: 20 }, (_, i) => licitacao({ id: i + 1 }));
      const p2 = Array.from({ length: 9 }, (_, i) => licitacao({ id: i + 21 }));
      buscarPagina
        .mockResolvedValueOnce(pagina(p1, 29))
        .mockResolvedValueOnce(pagina(p2, 29, 20));

      const res = await criar().sync();

      expect(buscarPagina).toHaveBeenCalledTimes(2);
      expect(buscarPagina).toHaveBeenNthCalledWith(1, 'favorite', 0);
      expect(buscarPagina).toHaveBeenNthCalledWith(2, 'favorite', 20);
      expect(res.imported).toBe(29);
    });

    it('não pula registros quando uma página vem parcial', async () => {
      // Somar 20 fixo pularia o id=2 e ele seria marcado como desaparecido.
      buscarPagina
        .mockResolvedValueOnce(pagina([licitacao({ id: 1 })], 2))
        .mockResolvedValueOnce(pagina([licitacao({ id: 2 })], 2, 1));

      const res = await criar().sync();

      expect(buscarPagina).toHaveBeenNthCalledWith(2, 'favorite', 1);
      expect(res.imported).toBe(2);
    });

    it('separa importadas de atualizadas pelo que já existe no banco', async () => {
      licitacoes.isPortalItemRegistered
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);
      buscarPagina.mockResolvedValue(
        pagina([licitacao({ id: 1 }), licitacao({ id: 2 })], 2),
      );

      const res = await criar().sync();

      expect(res.updated).toBe(1);
      expect(res.imported).toBe(1);
    });
  });

  describe('configuração e mapeamento', () => {
    it('não chama o portal sem token configurado', async () => {
      const res = await criar({ LICITAR_DIGITAL_TOKEN: undefined }).sync();

      expect(buscarPagina).not.toHaveBeenCalled();
      expect(res.errored).toBe(true);
      expect(res.errorMsg).toMatch(/token/i);
    });

    it('omite statusSugerido e resultadoSugerido (a operadora conduz o Kanban)', async () => {
      buscarPagina.mockResolvedValue(pagina([licitacao()], 1));

      await criar().sync();

      const payload = licitacoes.upsertFromIntegration.mock.calls[0][1];
      expect(payload.statusSugerido).toBeUndefined();
      expect(payload.resultadoSugerido).toBeUndefined();
    });

    it('junta órgão e unidade sem repetir quando são iguais', async () => {
      buscarPagina.mockResolvedValue(
        pagina(
          [licitacao({ organizationName: 'Prefeitura X', organizationUnitName: 'Prefeitura X' })],
          1,
        ),
      );

      await criar().sync();

      expect(licitacoes.upsertFromIntegration.mock.calls[0][1].orgao).toBe('Prefeitura X');
    });

    it('monta o objeto com número do processo e descrição', async () => {
      buscarPagina.mockResolvedValue(pagina([licitacao()], 1));

      await criar().sync();

      expect(licitacoes.upsertFromIntegration.mock.calls[0][1].objeto).toBe(
        'Processo nº 154/2026 – Aquisição de materiais de expediente (papelaria).',
      );
    });

    it('sobrevive a campos nulos do portal', async () => {
      buscarPagina.mockResolvedValue(
        pagina(
          [
            licitacao({
              simpleDescription: null,
              auctionNumber: null,
              organizationName: null,
              organizationUnitName: null,
              auctionStartDate: null,
            }),
          ],
          1,
        ),
      );

      const res = await criar().sync();

      const payload = licitacoes.upsertFromIntegration.mock.calls[0][1];
      expect(payload.objeto).toBe('Processo 112357');
      expect(payload.orgao).toBe('Órgão não informado');
      expect(res.imported).toBe(1);
    });
  });
});
