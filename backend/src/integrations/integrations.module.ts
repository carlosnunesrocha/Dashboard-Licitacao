import { Module } from '@nestjs/common';
import { LicitacoesModule } from '../licitacoes/licitacoes.module.js';
import { CaixaEscolarAdapter } from './caixa-escolar/caixa-escolar.adapter.js';
import { LicitarDigitalAdapter } from './licitar-digital/licitar-digital.adapter.js';
import { ComprasMgModule } from './compras-mg/compras-mg.module.js';
import { ComprasMgAdapter } from './compras-mg/compras-mg.adapter.js';
import { IntegrationsService } from './integrations.service.js';
import { IntegrationsController } from './integrations.controller.js';
import { PORTAL_ADAPTERS } from './integrations.constants.js';

// O adaptador do PNCP existe em ./pncp/ mas está fora desta lista de propósito:
// a API pública do PNCP não informa se a empresa participa de uma licitação,
// então ele só traz oportunidades gerais — prospecção já é resolvida por outra
// automação da empresa, fora deste painel.
@Module({
  imports: [LicitacoesModule, ComprasMgModule],
  controllers: [IntegrationsController],
  providers: [
    CaixaEscolarAdapter,
    LicitarDigitalAdapter,
    {
      provide: PORTAL_ADAPTERS,
      useFactory: (caixa: CaixaEscolarAdapter, licitar: LicitarDigitalAdapter, comprasMg: ComprasMgAdapter) => [
        caixa,
        licitar,
        comprasMg
      ],
      inject: [CaixaEscolarAdapter, LicitarDigitalAdapter, ComprasMgAdapter],
    },
    IntegrationsService,
  ],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}