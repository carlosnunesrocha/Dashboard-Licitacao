import { IsIn, IsOptional, IsString } from 'class-validator';
import { KANBAN_STATUS, PORTAL } from '../../common/constants.js';

export class ListLicitacoesQueryDto {
  @IsOptional()
  @IsIn(KANBAN_STATUS)
  status?: string;

  @IsOptional()
  @IsIn(PORTAL)
  portalOrigem?: string;

  @IsOptional()
  @IsString()
  responsavelId?: string;

  @IsOptional()
  @IsString()
  busca?: string;

  @IsOptional()
  @IsString()
  ordenarPor?: string;
}