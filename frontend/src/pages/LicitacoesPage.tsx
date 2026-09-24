import { EmConstrucao, PageHeader } from '../components/layout/PageHeader';

export function LicitacoesPage() {
  return (
    <div className="page">
      <PageHeader
        titulo="Licitações"
        descricao="Oportunidades de pregões eletrônicos, identificadas pelo portal de origem."
      />
      <EmConstrucao texto="Ainda vamos definir como as oportunidades entram no sistema — hoje os portais integrados só trazem negociações que a empresa já iniciou." />
    </div>
  );
}