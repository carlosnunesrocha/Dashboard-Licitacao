import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  CreateLicitacaoDto,
  MoveLicitacaoDto,
  UpdateLicitacaoDto,
} from './dto/licitacao.dto.js';
import { ListLicitacoesQueryDto } from './dto/list-licitacoes-query.dto.js';

/**
 * Formato normalizado que os adaptadores de integração (PNCP, etc.)
 * produzem ao coletar licitações de cada portal.
 */
export interface IntegrationLicitacao {
  externalId: string;
  orgao: string;
  objeto: string;
  modalidade?: string;
  valorEstimado?: number;
  dataAbertura?: string;
  dataLimite?: string;
  urlOriginal?: string;
  /**
   * Quando o portal de origem já informa o andamento real da negociação
   * (ex: proposta enviada/aprovada/recusada), o adaptador pode sugerir o
   * status/resultado do Kanban. Diferente do fluxo PNCP (onde a equipe move
   * o card manualmente), aqui o portal é a fonte de verdade do andamento.
   */
  statusSugerido?: string;
  resultadoSugerido?: string;
  /** Chaves do portal necessárias para buscar os detalhes sob demanda. */
  idSubprogram?: number;
  idSchool?: number;
  idSupplier?: number;
}

/** Detalhes buscados sob demanda por um adaptador de portal. */
export interface DetalhesLicitacao {
  detalhamento: string | null;
  valorTotalProposta: number | null;
  empresaVencedora: string | null;
  valorVencedor: number | null;
  itens: {
    ordem: number;
    descricao: string;
    tipo: string | null;
    unidade: string | null;
    quantidade: number | null;
    valorReferencia: number | null;
    valorUnitario: number | null;
    observacoes: string | null;
    garantiaOfertada: string | null;
    garantiaExigida: string | null;
  }[];
}

const licitacaoInclude = {
  responsavel: {
    select: { id: true, nome: true, email: true },
  },
} satisfies Prisma.LicitacaoInclude;

@Injectable()
export class LicitacoesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListLicitacoesQueryDto) {
    // desaparecidas do portal não aparecem no board (histórico fica no banco)
    const where: Prisma.LicitacaoWhereInput = { desaparecidoEm: null };
    if (query.status) where.status = query.status;
    if (query.portalOrigem) where.portalOrigem = query.portalOrigem;
    if (query.responsavelId) where.responsavelId = query.responsavelId;
    if (query.busca) {
      where.OR = [
        { orgao: { contains: query.busca } },
        { objeto: { contains: query.busca } },
        { modalidade: { contains: query.busca } },
      ];
    }

    const orderBy: Prisma.LicitacaoOrderByWithRelationInput =
      query.ordenarPor === 'valor'
        ? { valorEstimado: 'desc' }
        : query.ordenarPor === 'prazo'
          ? { dataLimite: 'asc' }
          : { createdAt: 'desc' };

    return this.prisma.licitacao.findMany({
      where,
      orderBy,
      include: licitacaoInclude,
    });
  }

  async findOne(id: string) {
    const licitacao = await this.prisma.licitacao.findUnique({
      where: { id },
      include: {
        ...licitacaoInclude,
        itens: { orderBy: { ordem: 'asc' } },
        historico: {
          orderBy: { alteradoEm: 'desc' },
          include: { usuario: { select: { id: true, nome: true } } },
        },
      },
    });
    if (!licitacao) throw new NotFoundException('Licitação não encontrada');
    return licitacao;
  }

  /**
   * Grava os detalhes buscados no portal e substitui os itens existentes.
   * A troca de itens é feita em transação para o card nunca ser lido com a
   * lista parcialmente escrita.
   */
  async salvarDetalhes(id: string, detalhes: DetalhesLicitacao) {
    await this.prisma.$transaction([
      this.prisma.licitacaoItem.deleteMany({ where: { licitacaoId: id } }),
      this.prisma.licitacao.update({
        where: { id },
        data: {
          detalhamento: detalhes.detalhamento,
          valorTotalProposta: detalhes.valorTotalProposta,
          empresaVencedora: detalhes.empresaVencedora,
          valorVencedor: detalhes.valorVencedor,
          detalhesSincronizadosEm: new Date(),
          itens: {
            create: detalhes.itens.map((i) => ({
              ordem: i.ordem,
              descricao: i.descricao,
              tipo: i.tipo,
              unidade: i.unidade,
              quantidade: i.quantidade,
              valorReferencia: i.valorReferencia,
              valorUnitario: i.valorUnitario,
              observacoes: i.observacoes,
              garantiaOfertada: i.garantiaOfertada,
              garantiaExigida: i.garantiaExigida,
            })),
          },
        },
      }),
    ]);

    return this.findOne(id);
  }

  async create(dto: CreateLicitacaoDto, currentUserId: string) {
    return this.prisma.licitacao.create({
      data: {
        orgao: dto.orgao,
        objeto: dto.objeto,
        modalidade: dto.modalidade,
        valorEstimado: dto.valorEstimado,
        dataAbertura: dto.dataAbertura ? new Date(dto.dataAbertura) : null,
        dataLimite: dto.dataLimite ? new Date(dto.dataLimite) : null,
        portalOrigem: dto.portalOrigem,
        externalId: dto.externalId,
        urlOriginal: dto.urlOriginal,
        status: dto.status ?? 'EM_ANALISE',
        responsavelId: dto.responsavelId,
        observacoes: dto.observacoes,
        historico: {
          create: {
            statusAnterior: null,
            statusNovo: dto.status ?? 'EM_ANALISE',
            userId: currentUserId,
          },
        },
      },
      include: licitacaoInclude,
    });
  }

  async update(id: string, dto: UpdateLicitacaoDto) {
    await this.findOne(id);
    return this.prisma.licitacao.update({
      where: { id },
      data: {
        orgao: dto.orgao,
        objeto: dto.objeto,
        modalidade: dto.modalidade,
        valorEstimado: dto.valorEstimado,
        dataAbertura: dto.dataAbertura ? new Date(dto.dataAbertura) : undefined,
        dataLimite: dto.dataLimite ? new Date(dto.dataLimite) : undefined,
        urlOriginal: dto.urlOriginal,
        responsavelId: dto.responsavelId,
        observacoes: dto.observacoes,
      },
      include: licitacaoInclude,
    });
  }

  async move(id: string, dto: MoveLicitacaoDto, currentUserId: string) {
    const licitacao = await this.findOne(id);

    if (dto.status !== 'RESULTADO' && dto.status !== licitacao.status) {
      // ao sair de RESULTADO limpa o resultado
      await this.prisma.licitacao.update({
        where: { id },
        data: { resultado: null },
      });
    }

    return this.prisma.licitacao.update({
      where: { id },
      data: {
        status: dto.status,
        resultado: dto.status === 'RESULTADO' ? (dto.resultado ?? licitacao.resultado) : null,
        historico: {
          create: {
            statusAnterior: licitacao.status,
            statusNovo: dto.status,
            userId: currentUserId,
          },
        },
      },
      include: licitacaoInclude,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.licitacao.delete({ where: { id } });
  }

  /**
   * Upsert usado pelos adaptadores de integração. Nunca sobrescreve campos
   * de trabalho da equipe (status, responsável, observações, resultado).
   */
  /**
   * Marca como desaparecidas as licitações de um portal que não vieram na
   * última sincronização. Não apaga: o histórico de negociação é preservado,
   * mas o card sai do board.
   */
  async marcarDesaparecidos(portalOrigem: string, externalIdsVistos: string[]): Promise<number> {
    const { count } = await this.prisma.licitacao.updateMany({
      where: {
        portalOrigem,
        externalId: { notIn: externalIdsVistos },
        desaparecidoEm: null,
      },
      data: { desaparecidoEm: new Date() },
    });
    return count;
  }

  async isPortalItemRegistered(portalOrigem: string, externalId: string): Promise<boolean> {
    const found = await this.prisma.licitacao.findUnique({
      where: { portalOrigem_externalId: { portalOrigem, externalId } },
      select: { id: true },
    });
    return !!found;
  }

  /**
   * Upsert usado pelos adaptadores de integração. No bloco `update` só os
   * dados coletados do portal são alterados — status, responsável,
   * observações e resultado (definidos pela equipe) nunca são sobrescritos.
   * O `upsert` nativo do Prisma é seguro contra concorrência entre syncs.
   */
  async upsertFromIntegration(portalOrigem: string, data: IntegrationLicitacao) {
    const statusInicial = data.statusSugerido ?? 'EM_ANALISE';
    return this.prisma.licitacao.upsert({
      where: {
        portalOrigem_externalId: { portalOrigem, externalId: data.externalId },
      },
      create: {
        orgao: data.orgao,
        objeto: data.objeto,
        modalidade: data.modalidade,
        valorEstimado: data.valorEstimado ?? null,
        dataAbertura: data.dataAbertura ? new Date(data.dataAbertura) : null,
        dataLimite: data.dataLimite ? new Date(data.dataLimite) : null,
        portalOrigem,
        externalId: data.externalId,
        urlOriginal: data.urlOriginal,
        status: statusInicial,
        resultado: data.resultadoSugerido ?? null,
        idSubprogram: data.idSubprogram,
        idSchool: data.idSchool,
        idSupplier: data.idSupplier,
        historico: {
          create: { statusAnterior: null, statusNovo: statusInicial },
        },
      },
      update: {
        orgao: data.orgao,
        objeto: data.objeto,
        modalidade: data.modalidade,
        valorEstimado: data.valorEstimado ?? null,
        dataAbertura: data.dataAbertura ? new Date(data.dataAbertura) : null,
        dataLimite: data.dataLimite ? new Date(data.dataLimite) : null,
        urlOriginal: data.urlOriginal,
        status: data.statusSugerido,
        resultado: data.resultadoSugerido,
        idSubprogram: data.idSubprogram,
        idSchool: data.idSchool,
        idSupplier: data.idSupplier,
        // veio na sincronização, então está de volta no portal
        desaparecidoEm: null,
      },
      include: licitacaoInclude,
    });
  }
}