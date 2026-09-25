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

  @Get('compras-mg/oportunidades')
  async buscarOportunidadesComprasMg() {
    const adapter = this.integrations['adapters'].find(a => a.id === 'compras-mg');
    if (!adapter || !('fetchOportunidades' in adapter)) throw new Error('Adapter Compras MG não encontrado');

    const result = await (adapter as any).fetchOportunidades();
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
