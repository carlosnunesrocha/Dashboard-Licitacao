import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { ThemeToggle } from './ThemeToggle';

const STORAGE_KEY = 'licitacoes.sidebar-recolhida';

/**
 * Casca do app: sidebar + área de conteúdo.
 *
 * A sidebar é irmã no flex, não overlay fixo — as páginas usam
 * `height: 100%; overflow: hidden`, e um overlay criaria barra de rolagem
 * dupla.
 */
export function AppLayout() {
  const [recolhida, setRecolhida] = useState(
    () => localStorage.getItem(STORAGE_KEY) === '1',
  );

  function toggle() {
    setRecolhida((r) => {
      localStorage.setItem(STORAGE_KEY, r ? '0' : '1');
      return !r;
    });
  }

  return (
    <div className="app-shell">
      <Sidebar recolhida={recolhida} onToggle={toggle} />
      <div className="app-main">
        <header className="app-topbar">
          <ThemeToggle />
        </header>
        <div className="app-content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}