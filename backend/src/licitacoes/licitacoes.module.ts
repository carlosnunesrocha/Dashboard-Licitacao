import { Module } from '@nestjs/common';
import { LicitacoesService } from './licitacoes.service.js';
import { LicitacoesController } from './licitacoes.controller.js';

@Module({
  controllers: [LicitacoesController],
  providers: [LicitacoesService],
  exports: [LicitacoesService],
})
export class LicitacoesModule {}