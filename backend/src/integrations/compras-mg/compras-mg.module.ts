import { Module } from '@nestjs/common';
import { ComprasMgAdapter } from './compras-mg.adapter.js';
import { LicitacoesModule } from '../../licitacoes/licitacoes.module.js';

@Module({
  imports: [LicitacoesModule],
  providers: [ComprasMgAdapter],
  exports: [ComprasMgAdapter],
})
export class ComprasMgModule {}
