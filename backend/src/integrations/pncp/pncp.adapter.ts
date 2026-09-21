import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PortalAdapter, SyncResult } from '../types.js';
import { LicitacoesService } from '../../licitacoes/licitacoes.service.js';

interface PncpSearchItem {
  numero_controle_pncp: string;
  orgao_nome: string;
  title: string;
  description: string;
  modalidade_licitacao_nome?: string;
  valor_global?: number | null;
  data_publicacao_pncp?: string;
  data_fim_vigencia?: string;
  item_url?: string;
  cancelado?: boolean;
  data_assinatura?: string | null;
}

interface PncpSearchResponse {
  items: PncpSearchItem[];
  total?: number;
  offset?: number;
  limit?: number;
}

// ordenacao=data_publicacao_pncp é obrigatório: sem esse parâmetro a API
// retorna itens antigos (ex: 2021) primeiro, e o corte por janela de dias
// abaixo faria a paginação parar antes de alcançar qualquer item recente.
const SEARCH_URL =
  'https://pncp.gov.br/api/search/?q={q}&tipos_documento=edital&status=publicado&ordenacao=data_publicacao_pncp&offset={offset}&limit={limit}';

@Injectable()
export class PncpAdapter implements PortalAdapter {
  readonly id = 'pncp';
  readonly label = 'PNCP - Portal Nacional de Contratações Públicas';
  private readonly logger = new Logger(PncpAdapter.name);
  private readonly userAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

  constructor(
    private readonly config: ConfigService,
    private readonly licitacoes: LicitacoesService,
  ) {}

  async sync(): Promise<SyncResult> {
    const query = this.config.get<string>('PNCP_SEARCH_QUERY') ?? '';
    const windowDays = Number(this.config.get<string>('PNCP_SYNC_WINDOW_DAYS') ?? '30');
    const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
    const maxItems = Number(this.config.get<string>('PNCP_MAX_ITEMS') ?? '500');

    const limit = 50;
    const offsetEnd = maxItems;
    let imported = 0;
    let updated = 0;

    this.logger.log(`Iniciando sync PNCP (janela=${windowDays}d, máx=${maxItems})`);

    for (let offset = 0; offset < offsetEnd; offset += limit) {
      const url = SEARCH_URL.replace('{q}', encodeURIComponent(query))
        .replace('{offset}', String(offset))
        .replace('{limit}', String(limit));

      const res = await fetch(url, {
        headers: { 'User-Agent': this.userAgent, Accept: 'application/json' },
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) {
        throw new Error(`PNCP respondeu HTTP ${res.status}: ${await res.text()}`);
      }

      const body = (await res.json()) as PncpSearchResponse;
      const items = body.items ?? [];
      if (items.length === 0) break;

      let oldEnough = true;
      for (const item of items) {
        const publishedAt = item.data_publicacao_pncp
          ? new Date(item.data_publicacao_pncp)
          : null;
        if (publishedAt && publishedAt < cutoff) {
          oldEnough = false;
          continue;
        }
        if (item.cancelado) continue;
        if (item.data_assinatura) continue; // licitação já assinada/encerrada não entra

        const { isNew } = await this.upsertItem(item);
        if (isNew) imported++;
        else updated++;
      }

      if (!oldEnough) break; // chegou ao limite da janela; para de paginar
    }

    this.logger.log(`PNCP concluído: ${imported} importadas, ${updated} atualizadas`);
    return { portalId: this.id, imported, updated };
  }

  private async upsertItem(item: PncpSearchItem): Promise<{ isNew: boolean }> {
    const externalId = item.numero_controle_pncp;
    const existed = await this.licitacoes.isPortalItemRegistered(this.id, externalId);

    await this.licitacoes.upsertFromIntegration(this.id, {
      externalId,
      orgao: (item.orgao_nome ?? 'Órgão não informado').trim(),
      objeto: (item.description || item.title || 'Sem descrição').trim(),
      modalidade: item.modalidade_licitacao_nome?.trim() ?? undefined,
      valorEstimado: item.valor_global ?? undefined,
      dataAbertura: item.data_publicacao_pncp,
      dataLimite: item.data_fim_vigencia,
      urlOriginal: item.item_url
        ? `https://pncp.gov.br${item.item_url}`
        : undefined,
    });

    return { isNew: !existed };
  }
}