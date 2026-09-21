import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { LicitacoesService } from './licitacoes.service.js';
import {
  CreateLicitacaoDto,
  MoveLicitacaoDto,
  UpdateLicitacaoDto,
} from './dto/licitacao.dto.js';
import { ListLicitacoesQueryDto } from './dto/list-licitacoes-query.dto.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { KANBAN_STATUS, PORTAL, type UserPrincipal } from '../common/constants.js';

@Controller('licitacoes')
export class LicitacoesController {
  constructor(private readonly licitacoesService: LicitacoesService) {}

  @Get()
  findAll(@Query() query: ListLicitacoesQueryDto) {
    return this.licitacoesService.findAll(query);
  }

  @Get('meta')
  getMeta() {
    return { status: KANBAN_STATUS, portais: PORTAL };
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.licitacoesService.findOne(id);
  }

  @Roles('admin')
  @Post()
  create(@Body() dto: CreateLicitacaoDto, @CurrentUser() user: UserPrincipal) {
    return this.licitacoesService.create(dto, user.id);
  }

  @Roles('admin')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateLicitacaoDto) {
    return this.licitacoesService.update(id, dto);
  }

  @Patch(':id/move')
  move(@Param('id') id: string, @Body() dto: MoveLicitacaoDto, @CurrentUser() user: UserPrincipal) {
    return this.licitacoesService.move(id, dto, user.id);
  }

  @Roles('admin')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.licitacoesService.remove(id);
  }
}