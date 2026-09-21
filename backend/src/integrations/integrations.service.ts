import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { PORTAL_ADAPTERS } from './integrations.constants.js';
import type { PortalAdapter, SyncResult } from './types.js';
import { LicitacoesService } from '../licitacoes/licitacoes.service.js';

@Injectable()
export class IntegrationsService {
  private readonly logger = new Logger(IntegrationsService.name);

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

    if (licitacao.detalhesSincronizadosEm) return licitacao;

    const adapter = this.adapters.find((a) => a.id === licitacao.portalOrigem);
    if (!adapter?.fetchDetalhes) {
      throw new BadRequestException(
        `Portal '${licitacao.portalOrigem}' não suporta busca de detalhes`,
      );
    }
    if (licitacao.idSubprogram === null || licitacao.idSchool === null || licitacao.idSupplier === null) {
      throw new BadRequestException(
        'Licitação sem as chaves do portal — rode uma sincronização para atualizá-la',
      );
    }

    const detalhes = await adapter.fetchDetalhes(
      licitacao.idSubprogram,
      licitacao.idSchool,
      Number(licitacao.externalId),
      licitacao.idSupplier,
    );

    return this.licitacoes.salvarDetalhes(licitacaoId, detalhes);
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