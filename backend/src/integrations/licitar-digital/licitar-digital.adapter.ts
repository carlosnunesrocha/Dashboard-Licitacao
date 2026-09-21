import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PortalAdapter, SyncResult } from '../types.js';
import { LicitacoesService } from '../../licitacoes/licitacoes.service.js';
import {
  LicitarDigitalClient,
  type AuctionNotice,
  type ShortFilter,
} from './licitar-digital.client.js';

const APP_ORIGIN = 'https://app2.licitardigital.com.br';

/**
 * Visão canônica do portal: **favoritos**.
 *
 * Decisão do usuário (2026-09-21): na operação da empresa, os processos em que
 * ela está participando ou já participou ficam registrados em Favoritos. É o
 * critério do negócio, e ele manda aqui.
 *
 * NÃO troque sem migrar os dados: `marcarDesaparecidos` escopa pelo portal
 * inteiro, então alternar a visão marca tudo da visão anterior como
 * desaparecido de uma vez.
 */
const FILTRO_PADRAO: ShortFilter = 'favorite';

/**
 * Teto de sanidade. A consulta pública do portal tem ~101 mil editais; as
 * listas da empresa têm dezenas. Um número acima disto significa que a resposta
 * não veio escopada à empresa.
 */
const MAX_ESPERADO = 5_000;

@Injectable()
export class LicitarDigitalAdapter implements PortalAdapter {
  readonly id = 'licitar-digital';
  readonly label = 'LicitarDigital';
  private readonly logger = new Logger(LicitarDigitalAdapter.name);

  constructor(
    private readonly config: ConfigService,
    private readonly licitacoes: LicitacoesService,
  ) {}

  async sync(): Promise<SyncResult> {
    const token = this.config.get<string>('LICITAR_DIGITAL_TOKEN');

    if (!token) {
      this.logger.warn(
        'LicitarDigital: token não configurado. Defina LICITAR_DIGITAL_TOKEN no .env (localStorage["_LDToken"] da área logada)',
      );
      return {
        portalId: this.id,
        imported: 0,
        updated: 0,
        errored: true,
        errorMsg: 'Token não configurado',
      };
    }

    const filtro = (this.config.get<string>('LICITAR_DIGITAL_FILTRO') ??
      FILTRO_PADRAO) as ShortFilter;
    const client = new LicitarDigitalClient(token);

    this.logger.log(`Iniciando sync LicitarDigital (filtro=${filtro})`);

    let imported = 0;
    let updated = 0;
    let offset = 0;
    let total = 0;
    const vistos = new Set<string>();

    do {
      const pagina = await client.buscarPagina(filtro, offset);
      total = pagina.meta.count;

      this.verificarEscopo(pagina.data, total, filtro);

      if (pagina.data.length === 0) {
        // Ainda faltavam registros segundo o próprio portal: ele se
        // contradisse. Seguir daria um `vistos` incompleto e, no fim,
        // marcaria os ausentes como desaparecidos.
        if (offset < total) {
          throw new Error(
            `LicitarDigital: página vazia em offset=${offset} com meta.count=${total}. ` +
              'Resposta inconsistente — sync abortado para não marcar registros como desaparecidos indevidamente.',
          );
        }
        break;
      }

      for (const item of pagina.data) {
        const externalId = String(item.id);
        vistos.add(externalId);

        const existed = await this.licitacoes.isPortalItemRegistered(this.id, externalId);

        await this.licitacoes.upsertFromIntegration(this.id, {
          externalId,
          orgao: this.montarOrgao(item),
          objeto: this.montarObjeto(item),
          modalidade: item.auctionType ?? undefined,
          dataAbertura: item.auctionStartDate ?? undefined,
          dataLimite: item.auctionEndDate ?? undefined,
          // TODO: não há URL por processo confirmada; esta leva à listagem.
          urlOriginal: `${APP_ORIGIN}/pesquisa?only${filtro === 'proposal' ? 'Proposal' : 'Favorites'}`,
          // statusSugerido e resultadoSugerido são deliberadamente OMITIDOS.
          // O portal não expõe ganhou/perdeu (confirmado pelo usuário em
          // 2026-09-21) e a operadora conduz o andamento pelo Kanban. Enviar
          // statusSugerido faria o sync sobrescrever esse trabalho a cada 6h,
          // porque upsertFromIntegration grava o campo sem guarda.
        });

        if (existed) updated++;
        else imported++;
      }

      // Avança pelo que a página REALMENTE trouxe. O portal pagina de 20 em 20,
      // mas somar 20 fixo pularia registros se uma página vier parcial antes do
      // fim — e os pulados seriam marcados como desaparecidos.
      offset += pagina.data.length;
    } while (offset < total);

    // Resposta sem nenhum registro. Pode ser legítimo (a empresa não tem
    // propostas) ou uma falha silenciosa — e os dois casos são indistinguíveis
    // aqui. Como marcar tudo como desaparecido esvaziaria o board, recusamos e
    // deixamos um humano decidir.
    if (vistos.size === 0) {
      this.logger.error('LicitarDigital: nenhum registro retornado; marcação de desaparecidos ignorada');
      return {
        portalId: this.id,
        imported: 0,
        updated: 0,
        errored: true,
        errorMsg:
          'Nenhum registro retornado pelo portal. Sync abortado antes de marcar desaparecidos — verifique o token e o filtro.',
      };
    }

    // Só aqui, depois de varrer TODAS as páginas. Se algo falhar no meio, a
    // exceção sobe e esta linha não roda — evitando marcar o portal inteiro
    // como desaparecido por causa de um sync parcial.
    const desaparecidos = await this.licitacoes.marcarDesaparecidos(this.id, [...vistos]);

    this.logger.log(
      `LicitarDigital concluído: ${imported} importadas, ${updated} atualizadas, ${desaparecidos} desaparecidas`,
    );
    return { portalId: this.id, imported, updated, desaparecidos };
  }

  /**
   * Fail-closed contra o modo de falha mais perigoso deste portal.
   *
   * Sem Authorization válido, a API **não** devolve erro: ela ignora o
   * shortFilter em silêncio e responde a consulta pública inteira (~101 mil
   * editais, todas as flags false). Gravar isso encheria o board de
   * prospecção alheia — exatamente o que o painel existe para evitar.
   *
   * Por isso abortamos em vez de confiar no status HTTP.
   */
  private verificarEscopo(itens: AuctionNotice[], total: number, filtro: ShortFilter): void {
    if (total > MAX_ESPERADO) {
      throw new Error(
        `LicitarDigital: resposta com ${total} registros (teto ${MAX_ESPERADO}). ` +
          'Isso é a consulta pública, não as licitações da empresa — token provavelmente inválido. Sync abortado.',
      );
    }

    const daEmpresa = (i: AuctionNotice) =>
      filtro === 'proposal' ? i.hasProposal : i.isFavorite;

    const intruso = itens.find((i) => !daEmpresa(i));
    if (intruso) {
      throw new Error(
        `LicitarDigital: item ${intruso.id} não pertence ao filtro "${filtro}" ` +
          '(flag da empresa ausente). Resposta não escopada. Sync abortado.',
      );
    }
  }

  private montarOrgao(item: AuctionNotice): string {
    const partes = [item.organizationName, item.organizationUnitName]
      .map((p) => p?.trim())
      .filter((p): p is string => Boolean(p));
    // Unidade repetida no nome do órgão vira ruído no card.
    const unicas = [...new Set(partes)];
    return unicas.join(' – ') || 'Órgão não informado';
  }

  private montarObjeto(item: AuctionNotice): string {
    const descricao = item.simpleDescription?.trim().replace(/\s+/g, ' ');
    const numero = item.auctionNumber?.trim();
    if (descricao && numero) return `Processo nº ${numero} – ${descricao}`;
    return descricao || (numero ? `Processo nº ${numero}` : `Processo ${item.id}`);
  }
}
