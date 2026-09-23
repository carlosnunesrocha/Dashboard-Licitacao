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
 * Detalhe buscado não é o mesmo que detalhe completo.
 *
 * Um card em Perdeu sem `empresaVencedora` foi buscado enquanto o orçamento
 * ainda estava em análise no portal (`budget.status = ANAP`): ali
 * `idSupplierProposalWinner` é nulo e a lista de concorrentes responde 404 —
 * ela só passa a existir depois que a escola conclui. "Nossa proposta foi
 * recusada" e "a escola já escolheu com quem fica" são eventos distintos, e o
 * primeiro chega antes.
 *
 * Sem esta noção, `detalhesSincronizadosEm` carimbado nessa janela congelaria
 * o card para sempre: quando o vencedor finalmente aparecesse, ninguém voltaria
 * para buscá-lo, e o dashboard contaria a derrota sem saber para quem.
 */
export const DETALHES_INCOMPLETOS = {
  resultado: 'PERDEU',
  empresaVencedora: null,
} satisfies Prisma.LicitacaoWhereInput;

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
  /**
   * Data em que NÓS enviamos a proposta, normalizada entre portais. Separada
   * de `dataAbertura` porque cada portal guarda uma coisa ali (envio da
   * proposta na Caixa Escolar, sessão do pregão no LicitarDigital) — e o
   * dashboard precisa de um campo que signifique o mesmo em todos.
   */
  dataProposta?: string;
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
    // O que a operadora digitou vence o que o portal devolve: no LicitarDigital
    // o portal devolve `null` (não expõe a nossa proposta), e sem esta trava o
    // sync apagaria o valor digitado a cada rodada.
    const atual = await this.prisma.licitacao.findUnique({
      where: { id },
      select: { valorPropostaManual: true },
    });

    await this.prisma.$transaction([
      this.prisma.licitacaoItem.deleteMany({ where: { licitacaoId: id } }),
      this.prisma.licitacao.update({
        where: { id },
        data: {
          detalhamento: detalhes.detalhamento,
          ...(atual?.valorPropostaManual
            ? {}
            : { valorTotalProposta: detalhes.valorTotalProposta }),
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

    // `undefined` = campo ausente no payload, não mexe. `null` = a operadora
    // apagou, então limpa o valor E a marca de manual (senão o campo ficaria
    // vazio e travado contra o sync para sempre).
    const valorInformado = dto.valorTotalProposta !== undefined;
    const dataInformada = dto.dataProposta !== undefined;

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
        ...(valorInformado && {
          valorTotalProposta: dto.valorTotalProposta,
          valorPropostaManual: dto.valorTotalProposta !== null,
        }),
        ...(dataInformada && {
          dataProposta: dto.dataProposta ? new Date(dto.dataProposta) : null,
          dataPropostaManual: dto.dataProposta !== null,
        }),
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

    // Carimba quando o resultado saiu — é por esta data que o dashboard filtra
    // "ganhos do mês". Só na ENTRADA em Resultado: trocar Ganhou↔Perdeu depois
    // não é um resultado novo, e reescrever a data falsearia o relatório.
    // Para os 891 cards importados em 14/09 não há o que carimbar: a data real
    // da decisão ficou no portal, que não a expõe.
    const entrandoEmResultado = dto.status === 'RESULTADO' && licitacao.status !== 'RESULTADO';

    return this.prisma.licitacao.update({
      where: { id },
      data: {
        status: dto.status,
        resultado: dto.status === 'RESULTADO' ? (dto.resultado ?? licitacao.resultado) : null,
        ...(entrandoEmResultado && { dataResultado: new Date() }),
        ...(dto.status !== 'RESULTADO' && { dataResultado: null }),
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

  /**
   * Cards que ainda não tiveram os detalhes buscados no portal — é deles que
   * sai o valor da proposta, sem o qual o dashboard mede 4% da realidade.
   *
   * Exclui os desaparecidos: saíram do portal, e pedir detalhe deles é bater
   * numa porta que responde 404.
   */
  async idsSemDetalhes(portalOrigem: string, limite?: number): Promise<string[]> {
    const linhas = await this.prisma.licitacao.findMany({
      where: {
        portalOrigem,
        desaparecidoEm: null,
        OR: [{ detalhesSincronizadosEm: null }, DETALHES_INCOMPLETOS],
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
      ...(limite ? { take: limite } : {}),
    });
    return linhas.map((l) => l.id);
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

    const existente = await this.prisma.licitacao.findUnique({
      where: { portalOrigem_externalId: { portalOrigem, externalId: data.externalId } },
      select: { resultado: true, dataPropostaManual: true },
    });

    // Só carimba `dataResultado` quando o resultado APARECE numa sincronização
    // de um card que já acompanhávamos sem resultado — aí sabemos que saiu
    // agora (com erro de até 6h, o intervalo do sync). Card que chega ao
    // sistema já resolvido fica com data nula: a decisão é anterior a nós e o
    // portal não informa quando foi. Inventar a data de hoje faria os 891
    // cards importados em 14/09 parecerem decididos todos no mesmo dia.
    const resultadoSaiuAgora = !!data.resultadoSugerido && !!existente && !existente.resultado;

    // Data digitada pela operadora não é sobrescrita pelo portal.
    const dataDoPortal = data.dataProposta ? new Date(data.dataProposta) : null;
    const podeGravarData = !existente?.dataPropostaManual;

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
        dataProposta: dataDoPortal,
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
        ...(podeGravarData && { dataProposta: dataDoPortal }),
        ...(resultadoSaiuAgora && { dataResultado: new Date() }),
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