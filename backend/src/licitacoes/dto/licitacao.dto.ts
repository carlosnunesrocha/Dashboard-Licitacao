import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { KANBAN_STATUS, PORTAL, RESULTADO } from '../../common/constants.js';

export class CreateLicitacaoDto {
  @IsString()
  orgao!: string;

  @IsString()
  objeto!: string;

  @IsOptional()
  @IsString()
  modalidade?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  valorEstimado?: number;

  @IsOptional()
  @IsDateString()
  dataAbertura?: string;

  @IsOptional()
  @IsDateString()
  dataLimite?: string;

  @IsIn(PORTAL)
  portalOrigem!: typeof PORTAL[number];

  @IsString()
  externalId!: string;

  @IsOptional()
  @IsString()
  urlOriginal?: string;

  @IsOptional()
  @IsIn(KANBAN_STATUS)
  status?: string;

  @IsOptional()
  @IsString()
  responsavelId?: string;

  @IsOptional()
  @IsString()
  observacoes?: string;
}

export class UpdateLicitacaoDto {
  @IsOptional()
  @IsString()
  orgao?: string;

  @IsOptional()
  @IsString()
  objeto?: string;

  @IsOptional()
  @IsString()
  modalidade?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  valorEstimado?: number;

  @IsOptional()
  @IsDateString()
  dataAbertura?: string;

  @IsOptional()
  @IsDateString()
  dataLimite?: string;

  @IsOptional()
  @IsString()
  urlOriginal?: string;

  @IsOptional()
  @IsString()
  responsavelId?: string;

  @IsOptional()
  @IsString()
  observacoes?: string;

  /**
   * Preenchidos à mão pela operadora nos portais que não expõem a proposta —
   * hoje LicitarDigital, amanhã BNC/BLL. Gravar qualquer um dos dois marca o
   * campo como manual, e a partir daí o sync de detalhes não o sobrescreve.
   * `null` limpa o valor e desfaz a marca.
   */
  @IsOptional()
  @IsNumber()
  @Min(0)
  valorTotalProposta?: number | null;

  @IsOptional()
  @IsDateString()
  dataProposta?: string | null;
}

export class MoveLicitacaoDto {
  @IsIn(KANBAN_STATUS)
  status!: string;

  @IsOptional()
  @IsIn(RESULTADO)
  resultado?: string;
}