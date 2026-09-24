import { useTheme } from '../../context/ThemeContext';
import { ICON_LUA, ICON_SOL } from './icons';

/**
 * Dois botões lado a lado em vez de um que alterna: o estado atual fica
 * visível sem precisar deduzir do ícone. `aria-pressed` conta qual está ativo
 * para quem usa leitor de tela.
 */
export function ThemeToggle() {
  const { theme, toggle } = useTheme();

  return (
    <div className="theme-toggle" role="group" aria-label="Aparência">
      <button
        className={`theme-option${theme === 'light' ? ' is-active' : ''}`}
        onClick={() => theme !== 'light' && toggle()}
        aria-pressed={theme === 'light'}
        title="Tema claro"
      >
        {ICON_SOL}
      </button>
      <button
        className={`theme-option${theme === 'dark' ? ' is-active' : ''}`}
        onClick={() => theme !== 'dark' && toggle()}
        aria-pressed={theme === 'dark'}
        title="Tema escuro"
      >
        {ICON_LUA}
      </button>
    </div>
  );
}