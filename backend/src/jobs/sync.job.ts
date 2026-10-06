import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { IntegrationsService } from '../integrations/integrations.service.js';
import { RedisService } from '../redis/redis.service.js';

@Injectable()
export class SyncJob {
  private readonly logger = new Logger(SyncJob.name);

  constructor(
    private readonly integrations: IntegrationsService,
    private readonly redis: RedisService,
  ) {}

  @Cron(CronExpression.EVERY_6_HOURS, { name: 'sincronizacao-portais' })
  async handleSync() {
    this.logger.log('Iniciando sincronização agendada dos portais');
    const results = await this.integrations.syncAll();
    this.logger.log(`Sincronização concluída: ${JSON.stringify(results)}`);
  }

  /**
   * Limpeza diária do cache de oportunidades.
   *
   * TTL por chave já expira individualmente a cada 24h, mas o flush garante
   * que nada fique preso se o worker reiniciar entre expirações.
   * Roda todo dia 2h da manhã.
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM, { name: 'limpeza-cache-oportunidades' })
  async limparCacheOportunidades() {
    const keys = await this.redis.keys('oportunidades:*');
    if (keys.length > 0) {
      await this.redis.del(keys);
      this.logger.log(`Cache de oportunidades limpo: ${keys.length} chave(s)`);
    }
  }
}