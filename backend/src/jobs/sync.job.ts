import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { IntegrationsService } from '../integrations/integrations.service.js';

@Injectable()
export class SyncJob {
  private readonly logger = new Logger(SyncJob.name);

  constructor(private readonly integrations: IntegrationsService) {}

  @Cron(CronExpression.EVERY_6_HOURS, { name: 'sincronizacao-portais' })
  async handleSync() {
    this.logger.log('Iniciando sincronização agendada dos portais');
    const results = await this.integrations.syncAll();
    this.logger.log(`Sincronização concluída: ${JSON.stringify(results)}`);
  }
}