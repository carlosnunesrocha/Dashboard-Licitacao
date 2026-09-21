import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';

export class CreateUserDto {
  @IsString()
  nome!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  senha!: string;

  @IsOptional()
  @IsIn(['admin', 'membro'])
  role?: string;
}

export class UpdateUserDto extends PartialType(CreateUserDto) {
  senha?: string;
}