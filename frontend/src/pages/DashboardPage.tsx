import { EmConstrucao, PageHeader } from '../components/layout/PageHeader';

export function DashboardPage() {
  return (
    <div className="page">
      <PageHeader
        titulo="Dashboard"
        descricao="Visão geral das negociações em andamento e dos resultados."
      />
      <EmConstrucao texto="Os indicadores serão definidos na próxima etapa: taxa de vitória, valor ganho e perdido, propostas em aberto e prazos." />
    </div>
  );
}