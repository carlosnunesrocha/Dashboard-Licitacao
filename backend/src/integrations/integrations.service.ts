import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { PORTAL_ADAPTERS } from './integrations.constants.js';
import type { PortalAdapter, SyncResult } from './types.js';
import { LicitacoesService } from '../licitacoes/licitacoes.service.js';

@Injectable()
export class IntegrationsService {
  private readonly logger = new Logger(IntegrationsService.name);

  /** Trava contra duas rodadas simultâneas: dobraria o ritmo no portal. */
  private backfillEmAndamento = false;

  constructor(
    @Inject(PORTAL_ADAPTERS) private readonly adapters: PortalAdapter[],
    private readonly licitacoes: LicitacoesService,
  ) {}

  list() {
    return this.adapters.map((a) => ({ id: a.id, label: a.label }));
  }

  /**
   * Busca os detalhes de uma licitação no portal de origem e persiste.
   * Se já houver detalhes salvos, devolve direto do banco (sem chamar o portal).
   */
  async carregarDetalhes(licitacaoId: string) {
    const licitacao = await this.licitacoes.findOne(licitacaoId);

    // Perdeu sem vencedor = detalhe buscado cedo demais, enquanto o portal
    // ainda estava em análise. Devolver o cache aqui congelaria o card: o
    // vencedor apareceria no portal e nunca chegaria ao painel.
    // Ver DETALHES_INCOMPLETOS em licitacoes.service.ts.
    const incompleto = licitacao.resultado === 'PERDEU' && !licitacao.empresaVencedora;
    if (licitacao.detalhesSincronizadosEm && !incompleto) return licitacao;

    const adapter = this.adapters.find((a) => a.id === licitacao.portalOrigem);
    if (!adapter?.fetchDetalhes) {
      // Sem adaptador não há portal de onde buscar — é o caso das licitações
      // cadastradas à mão (BNC, BLL), onde o sync é impossível. Devolver o que
      // está no banco é a resposta correta; lançar erro fazia o modal do card
      // falhar inteiro e esconder os dados que a operadora acabara de digitar.
      return licitacao;
    }
    // A exigência das chaves idSubprogram/idSchool/idSupplier é da Caixa
    // Escolar, não de todo portal — validá-la aqui impedia qualquer outro
    // adaptador de implementar detalhes. Cada um valida o que precisa.
    const detalhes = await adapter.fetchDetalhes({
      externalId: licitacao.externalId,
      portalOrigem: licitacao.portalOrigem,
      idSubprogram: licitacao.idSubprogram,
      idSchool: licitacao.idSchool,
      idSupplier: licitacao.idSupplier,
    });

    return this.licitacoes.salvarDetalhes(licitacaoId, detalhes);
  }

  /**
   * Busca os detalhes de TODOS os cards que ainda não têm, um a um.
   *
   * Existe porque os detalhes eram carregados só no clique do card: dos 964
   * registros da Caixa Escolar, 36 tinham valor da proposta. O dashboard
   * precisa dos 964.
   *
   * **Ritmo deliberadamente lento.** Cada card custa 3 requisições ao portal
   * (detalhe + itens + propostas). Em rajada isso é indistinguível de um
   * ataque e derrubaria a sessão — ou o acesso da empresa. A pausa entre cards
   * é o que mantém a operação abaixo do radar e a aplicação utilizável: o
   * event loop fica livre entre um card e outro, então o painel continua
   * respondendo enquanto o backfill roda.
   *
   * Um erro em um card não interrompe a fila — fica para a próxima rodada,
   * que só pega quem continua sem detalhe.
   */
  async backfillDetalhes(opcoes: {
    portalId: string;
    limite?: number;
    pausaMs?: number;
  }): Promise<{ total: number; ok: number; falhas: number; duracaoSeg: number }> {
    const { portalId, limite, pausaMs = 1500 } = opcoes;

    if (this.backfillEmAndamento) {
      throw new ConflictException('Já existe um backfill de detalhes em andamento');
    }

    const adapter = this.adapters.find((a) => a.id === portalId);
    if (!adapter?.fetchDetalhes) {
      throw new NotFoundException(`Integração '${portalId}' não busca detalhes`);
    }

    this.backfillEmAndamento = true;
    const inicio = Date.now();
    let ok = 0;
    let falhas = 0;

    try {
      const ids = await this.licitacoes.idsSemDetalhes(portalId, limite);
      this.logger.log(
        `Backfill ${portalId}: ${ids.length} cards sem detalhes, pausa de ${pausaMs}ms entre eles ` +
          `(~${Math.round((ids.length * (pausaMs + 800)) / 60000)} min)`,
      );

      for (const [i, id] of ids.entries()) {
        try {
          await this.carregarDetalhes(id);
          ok++;
        } catch (e) {
          falhas++;
          this.logger.warn(`Backfill ${portalId}: card ${id} falhou — ${(e as Error).message}`);
        }

        // Log esparso: uma linha por card encheria o terminal com 928 linhas.
        if ((i + 1) % 25 === 0 || i === ids.length - 1) {
          this.logger.log(`Backfill ${portalId}: ${i + 1}/${ids.length} (${ok} ok, ${falhas} falhas)`);
        }

        if (i < ids.length - 1) await this.esperar(pausaMs);
      }

      const duracaoSeg = Math.round((Date.now() - inicio) / 1000);
      this.logger.log(
        `Backfill ${portalId} concluído: ${ok} ok, ${falhas} falhas, ${duracaoSeg}s`,
      );
      return { total: ids.length, ok, falhas, duracaoSeg };
    } finally {
      this.backfillEmAndamento = false;
    }
  }

  /** Jitter de ±20%: um intervalo exato é assinatura de robô. */
  private esperar(ms: number): Promise<void> {
    const comJitter = ms * (0.8 + Math.random() * 0.4);
    return new Promise((resolve) => setTimeout(resolve, comJitter));
  }

  async syncOne(id: string): Promise<SyncResult> {
    const adapter = this.adapters.find((a) => a.id === id);
    if (!adapter) throw new NotFoundException(`Integração '${id}' não encontrada`);
    try {
      const result = await adapter.sync();
      this.logger.log(`Sync ${id}: ${result.imported} importadas, ${result.updated} atualizadas`);
      return result;
    } catch (e) {
      this.logger.error(`Erro no sync ${id}`, e instanceof Error ? e.stack : String(e));
      return {
        portalId: id,
        imported: 0,
        updated: 0,
        errored: true,
        errorMsg: e instanceof Error ? e.message : String(e),
      };
    }
  }

  async syncAll(): Promise<SyncResult[]> {
    const results: SyncResult[] = [];
    for (const adapter of this.adapters) {
      results.push(await this.syncOne(adapter.id));
    }
    return results;
  }
}