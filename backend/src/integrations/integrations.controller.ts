import { Controller, Get, Param, Post } from '@nestjs/common';
import { IntegrationsService } from './integrations.service.js';
import { Roles } from '../auth/decorators/roles.decorator.js';

@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Get('detalhes/:licitacaoId')
  carregarDetalhes(@Param('licitacaoId') licitacaoId: string) {
    return this.integrations.carregarDetalhes(licitacaoId);
  }

  @Get()
  list() {
    return this.integrations.list();
  }

  @Roles('admin')
  @Post(':id/sync')
  sync(@Param('id') id: string) {
    return this.integrations.syncOne(id);
  }

  @Roles('admin')
  @Post('sync-all')
  syncAll() {
    return this.integrations.syncAll();
  }
}