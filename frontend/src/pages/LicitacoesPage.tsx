import { useState, useEffect } from 'react';
import { PageHeader } from '../components/layout/PageHeader';
import { ExtendedLicitacaoCard } from '../components/ExtendedLicitacaoCard';
import type { Licitacao } from '../types';
import { apiRequest } from '../api/client';

export function LicitacoesPage() {
  const [licitacoes, setLicitacoes] = useState<Licitacao[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros em hardcode como requisitado na especificação para buscas ativas
  const keywordList = [
    'papel a4', 'papel a3', 'papel sulfite', 'papel alcalino', 'resma', 'resma a4',
    'resma a3', 'chamex', 'papel 75g', 'papel 90g', 'papelaria', 'material de expediente',
    'materiais de expediente', 'material de escritório', 'materiais de escritório',
    'artigos de escritório', 'suprimentos de escritório', 'material de papelaria',
    'materiais de papelaria', 'artigos de papelaria', 'material escolar', 'materiais escolares',
    'material pedagogico', 'kit escolar', 'kit material escolar', 'kit aluno', 'kit estudante',
    'material pedagógico', 'caderno', 'caneta', 'lápis', 'pasta', 'arquivo', 'arquivo morto',
    'caixa arquivo', 'envelope', 'cola', 'grampeador', 'grampo', 'clips', 'borracha', 'corretivo',
    'lapiseira', 'fichário', 'etiqueta adesiva', 'bloco de notas', 'marca texto', 'marcador permanente',
    'pincel atômico', 'quadro branco', 'calculadora', 'tesoura', 'estilete', 'régua', 'fita adesiva',
    'fita crepe', 'cartolina', 'agenda', 'livro ata', 'prancheta', 'giz', 'eva'
  ];

  useEffect(() => {
    async function fetchLicitacoes() {
      try {
        setLoading(true);
        // Temporário: chamando a listagem de nosso Backend que deve bater na integration 'compras-mg'
        const res = await apiRequest<{ data: Licitacao[] }>('/integrations/compras-mg/oportunidades');
        setLicitacoes(res.data);
      } catch (error) {
        console.error('Falha ao buscar oportunidades', error);
      } finally {
        setLoading(false);
      }
    }
    fetchLicitacoes();
  }, []);

  return (
    <div className="page">
      <PageHeader
        titulo="Oportunidades de Licitações (MG)"
        descricao="Busca de compras abertas ativamente nos portais de origem. Exibindo pregões apenas para o Estado de Minas Gerais."
      />

      <div className="filtros-licitacoes" style={{ margin: '16px 0', padding: '16px', background: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--border)' }}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: 'var(--text-muted)' }}>Filtros Ativos</h3>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
           <span style={{ fontSize: '12px', background: 'var(--btn-action)', color: 'white', padding: '4px 10px', borderRadius: '12px', fontWeight: 600 }}>Estado: MG</span>
           <span style={{ fontSize: '12px', background: 'var(--surface-sunken)', color: 'var(--text)', padding: '4px 10px', borderRadius: '12px', border: '1px solid var(--border)' }}>+ {keywordList.length} palavras-chave configuradas</span>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px' }}>Carregando oportunidades...</div>
      ) : licitacoes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
          Nenhuma oportunidade encontrada no momento para os filtros aplicados.
        </div>
      ) : (
        <div className="licitacao-list">
          {licitacoes.map(lic => (
            <ExtendedLicitacaoCard key={lic.id} licitacao={lic} onClick={() => alert('Abrir modal de detalhes para ' + lic.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
