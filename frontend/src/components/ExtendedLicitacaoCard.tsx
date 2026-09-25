import type { Licitacao } from '../types';
import { PORTAL_LABEL } from '../types';
import { valorParaInput } from '../utils/valor';
import './ExtendedLicitacaoCard.css';

export function ExtendedLicitacaoCard({
  licitacao,
  onClick,
}: {
  licitacao: Licitacao;
  onClick: () => void;
}) {
  return (
    <div className="extended-card" onClick={onClick}>
      <div className="extended-card-header">
        <div className="extended-card-title-group">
          <div className="extended-card-orgao">{licitacao.orgao}</div>
          <div className="extended-card-badges">
            <span className={`portal-badge portal-${licitacao.portalOrigem}`}>
              {PORTAL_LABEL[licitacao.portalOrigem]}
            </span>
            <span className="resultado-badge" style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
              {licitacao.status.replace(/_/g, ' ')}
            </span>
          </div>
        </div>
        <div className="extended-card-info-item" style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-h)' }}>
          {licitacao.valorEstimado
            ? `R$ ${valorParaInput(licitacao.valorEstimado)}`
            : 'S/ Valor Est.'}
        </div>
      </div>

      <div className="extended-card-body">
        {licitacao.objeto}
      </div>

      <div className="extended-card-footer">
        <div className="extended-card-info-item">
          <span aria-hidden="true">⚖</span>
          <span>{licitacao.modalidade || 'Licitação'}</span>
        </div>

        {(licitacao.dataAbertura || licitacao.dataLimite) && (
          <div className="extended-card-info-item">
            <span aria-hidden="true">📅</span>
            <span>
              {licitacao.dataAbertura && new Date(licitacao.dataAbertura).toLocaleDateString('pt-BR')}
              {licitacao.dataAbertura && licitacao.dataLimite && ' – '}
              {licitacao.dataLimite && new Date(licitacao.dataLimite).toLocaleDateString('pt-BR')}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
