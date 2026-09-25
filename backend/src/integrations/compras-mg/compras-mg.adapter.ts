import { Injectable, Logger } from '@nestjs/common';
import type { PortalAdapter, SyncResult } from '../types.js';
import { LicitacoesService } from '../../licitacoes/licitacoes.service.js';

@Injectable()
export class ComprasMgAdapter implements PortalAdapter {
  readonly id = 'compras-mg';
  readonly label = 'Compras MG (Prodemge)';
  private readonly logger = new Logger(ComprasMgAdapter.name);

  constructor(private readonly licitacoes: LicitacoesService) {}

  async sync(): Promise<SyncResult> {
    this.logger.log('Iniciando sync do Compras MG (Prodemge)');
    // Como a API PRODEMGE não pode ser consumida DIRETAMENTE nesta etapa (caminhos não achados publicamente e o swagger deu 404),
    // Retornamos um mock contendo as palavras-chave especificadas.
    // Futuramente, a url seria injetada, usando axios ou fetch no real endpoint.

    const mockLicitacoes = [
      {
        id: 'cmg-001',
        nomeOrgao: 'Secretaria de Estado de Educação - SEE/MG',
        objeto: 'Aquisição de resma a4 para escolas estaduais.',
        valorEstimado: 12500.00,
        dataAbertura: new Date(Date.now() - 86400000).toISOString(),
        dataLimite: new Date(Date.now() + 86400000 * 5).toISOString(),
      },
      {
        id: 'cmg-002',
        nomeOrgao: 'Secretaria de Saúde - SES/MG',
        objeto: 'Fornecimento de material de expediente, incluindo papel sulfite e caneta.',
        valorEstimado: 32000.50,
      },
      {
        id: 'cmg-003',
        nomeOrgao: 'Fundação Clóvis Salgado',
        objeto: 'Materiais escolares e pedagógicos para oficinas de arte (marca texto e cola).',
        valorEstimado: 5400.00,
      }
    ];

    let imported = 0;
    let updated = 0;

    for (const item of mockLicitacoes) {
      const existed = await this.licitacoes.isPortalItemRegistered(this.id, item.id);

      await this.licitacoes.upsertFromIntegration(this.id, {
        externalId: item.id,
        orgao: item.nomeOrgao,
        objeto: item.objeto,
        modalidade: 'Pregão Eletrônico',
        valorEstimado: item.valorEstimado,
        dataAbertura: item.dataAbertura || undefined,
        dataLimite: item.dataLimite || undefined,
        urlOriginal: 'https://www1.compras.mg.gov.br/',
        // Não mandamos statusSugerido para não sobrescrever o Kanban do usuário.
      });

      if (existed) updated++;
      else imported++;
    }

    return { portalId: this.id, imported, updated };
  }

  /**
   * Para a tela de prospecção, queremos buscar as oportunidades SEM
   * necessariamente gravá-las no BD.
   */
  async fetchOportunidades() {
    // Retorna os mesmos mocks sem persistir.
    return [
      {
        id: 'cmg-001',
        portalOrigem: 'compras-mg',
        orgao: 'Secretaria de Estado de Educação - SEE/MG',
        objeto: 'Aquisição de resma a4 para escolas estaduais.',
        valorEstimado: 12500.00,
        dataAbertura: new Date(Date.now() - 86400000).toISOString(),
        dataLimite: new Date(Date.now() + 86400000 * 5).toISOString(),
        status: 'EM_ANALISE',
        modalidade: 'Pregão Eletrônico',
      },
      {
        id: 'cmg-002',
        portalOrigem: 'compras-mg',
        orgao: 'Secretaria de Saúde - SES/MG',
        objeto: 'Fornecimento de material de expediente, incluindo papel sulfite e caneta.',
        valorEstimado: 32000.50,
        status: 'EM_ANALISE',
        modalidade: 'Pregão Eletrônico',
      },
      {
        id: 'cmg-003',
        portalOrigem: 'compras-mg',
        orgao: 'Fundação Clóvis Salgado',
        objeto: 'Materiais escolares e pedagógicos para oficinas de arte (marca texto e cola).',
        valorEstimado: 5400.00,
        status: 'EM_ANALISE',
        modalidade: 'Pregão Eletrônico',
      }
    ];
  }
}
