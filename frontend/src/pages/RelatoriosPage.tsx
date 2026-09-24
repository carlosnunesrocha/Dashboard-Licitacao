import { EmConstrucao, PageHeader } from '../components/layout/PageHeader';

export function RelatoriosPage() {
  return (
    <div className="page">
      <PageHeader
        titulo="Relatórios"
        descricao="Consultas de ganhos e perdas, com filtros, para diretoria e gerência."
      />
      <EmConstrucao texto="A pesquisa com filtros por período, portal, responsável e resultado será construída aqui." />
    </div>
  );
}