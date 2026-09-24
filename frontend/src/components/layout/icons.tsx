/**
 * Ícones da navegação, no mesmo padrão já usado na LoginPage: SVG inline,
 * `viewBox="0 0 24 24"`, preenchidos com `currentColor`.
 *
 * São nove glifos — não justificam uma dependência de biblioteca de ícones,
 * que traria centenas junto.
 *
 * Preenchidos, não contorno: em tamanho pequeno o traço fino some contra o
 * fundo escuro da sidebar.
 */
import type { ReactNode } from 'react';

export const NAV_ICONS: Record<string, ReactNode> = {
  dashboard: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="3" y="3" width="8" height="8" rx="2" />
      <rect x="13" y="3" width="8" height="5" rx="2" />
      <rect x="3" y="13" width="8" height="8" rx="2" />
      <rect x="13" y="10" width="8" height="11" rx="2" />
    </svg>
  ),
  licitacoes: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M6 2h8l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm7 1.5V8h4.5L13 3.5z" />
      <path d="M7.5 12h9v1.6h-9zM7.5 15.4h9V17h-9z" fill="var(--sidebar-bg)" />
    </svg>
  ),
  kanban: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="3" y="4" width="5" height="16" rx="1.5" />
      <rect x="9.5" y="4" width="5" height="10" rx="1.5" />
      <rect x="16" y="4" width="5" height="13" rx="1.5" />
    </svg>
  ),
  relatorios: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M3 19h18v2H3zM5 12h3v5H5zM10.5 8h3v9h-3zM16 4h3v13h-3z" />
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zm0 5.5a2 2 0 1 1 0-4 2 2 0 0 1 0 4z" />
      <path d="m20.4 13.2.1-1.2-.1-1.2 1.8-1.4-1.9-3.3-2.2.7a7.7 7.7 0 0 0-2-1.2L15.7 3H8.3l-.4 2.6c-.7.3-1.4.7-2 1.2l-2.2-.7L1.8 9.4l1.8 1.4-.1 1.2.1 1.2-1.8 1.4 1.9 3.3 2.2-.7c.6.5 1.3.9 2 1.2l.4 2.6h7.4l.4-2.6c.7-.3 1.4-.7 2-1.2l2.2.7 1.9-3.3-1.8-1.4zM12 17a5 5 0 1 1 0-10 5 5 0 0 1 0 10z" />
    </svg>
  ),
};

export const ICON_MENU = (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M3.5 6h17v2h-17zM3.5 11h17v2h-17zM3.5 16h17v2h-17z" />
  </svg>
);

export const ICON_SOL = (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 17a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-2a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
    <path d="M11 1.5h2V5h-2zM11 19h2v3.5h-2zM1.5 11H5v2H1.5zM19 11h3.5v2H19zM4.2 5.6l1.4-1.4 2.5 2.5-1.4 1.4zM15.9 17.3l1.4-1.4 2.5 2.5-1.4 1.4zM4.2 18.4l2.5-2.5 1.4 1.4-2.5 2.5zM15.9 6.7l2.5-2.5 1.4 1.4-2.5 2.5z" />
  </svg>
);

export const ICON_LUA = (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M21 13.3A9 9 0 1 1 10.7 3a7 7 0 0 0 10.3 10.3z" />
  </svg>
);

export const ICON_SAIR = (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5v-2H5V5h5V3z" />
    <path d="m16.5 7.5-1.4 1.4L17.2 11H9v2h8.2l-2.1 2.1 1.4 1.4L21 12l-4.5-4.5z" />
  </svg>
);