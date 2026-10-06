import { Controller, Get, Param, Post, Query } from '@nestjs/common';
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

  @Get('compras-mg/oportunidades')
  async buscarOportunidadesComprasMg() {
    const result = await this.integrations.buscarOportunidades('compras-mg');
    return { data: result };
  }

  @Get('caixa-escolar/oportunidades')
  async buscarOportunidadesCaixaEscolar(@Query('q') q?: string) {
    const palavrasChave = q ? q.split(',').map(s => s.trim()).filter(Boolean) : [];
    const result = await this.integrations.buscarOportunidades('caixa-escolar', palavrasChave);
    return { data: result };
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
