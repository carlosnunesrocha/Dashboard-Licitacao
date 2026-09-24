import type { ReactNode } from 'react';

export function PageHeader({
  titulo,
  descricao,
  acoes,
}: {
  titulo: string;
  descricao?: string;
  acoes?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <h1>{titulo}</h1>
        {descricao && <p>{descricao}</p>}
      </div>
      {acoes && <div className="page-header-acoes">{acoes}</div>}
    </header>
  );
}

/**
 * Estado vazio honesto: diz que a página ainda não tem conteúdo, em vez de
 * simular um esqueleto que sugere que algo está carregando.
 */
export function EmConstrucao({ texto }: { texto: string }) {
  return (
    <div className="em-construcao">
      <span className="em-construcao-selo">Em construção</span>
      <p>{texto}</p>
    </div>
  );
}