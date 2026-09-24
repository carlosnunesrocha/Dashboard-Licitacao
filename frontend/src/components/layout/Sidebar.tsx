import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ICON_MENU, ICON_SAIR, NAV_ICONS } from './icons';

/**
 * Rótulos diretos, nomeados pelo que contêm. "Dashboard" e "Relatórios" dizem
 * o que a pessoa vai encontrar; um "Início" genérico não diria.
 */
const NAV = [
  { to: '/', label: 'Dashboard', icon: NAV_ICONS.dashboard, end: true },
  { to: '/licitacoes', label: 'Licitações', icon: NAV_ICONS.licitacoes },
  { to: '/kanban', label: 'Kanban', icon: NAV_ICONS.kanban },
  { to: '/relatorios', label: 'Relatórios', icon: NAV_ICONS.relatorios },
  { to: '/settings', label: 'Configurações', icon: NAV_ICONS.settings },
];

export function Sidebar({
  recolhida,
  onToggle,
}: {
  recolhida: boolean;
  onToggle: () => void;
}) {
  const { user, logout } = useAuth();

  // Recolhida, o rótulo some e sobra o ícone — que sozinho não diz o que é.
  // O title serve o mouse; o aria-label, o leitor de tela.
  const rotulo = (label: string) => (recolhida ? label : undefined);

  const iniciais = (user?.nome ?? '?')
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();

  return (
    <aside className={`app-sidebar${recolhida ? ' is-collapsed' : ''}`}>
      <div className="sidebar-head">
        <button
          className="sidebar-toggle"
          onClick={onToggle}
          title={recolhida ? 'Expandir menu' : 'Recolher menu'}
          aria-label={recolhida ? 'Expandir menu' : 'Recolher menu'}
          aria-expanded={!recolhida}
        >
          {ICON_MENU}
        </button>
        <span className="sidebar-brand">
          Painel de <strong>Licitações</strong>
        </span>
      </div>

      <nav className="sidebar-nav">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `sidebar-item${isActive ? ' is-active' : ''}`}
            title={rotulo(item.label)}
            aria-label={rotulo(item.label)}
          >
            <span className="sidebar-item-icon">{item.icon}</span>
            <span className="sidebar-item-label">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-foot">
        <div className="sidebar-user">
          <span className="sidebar-avatar" aria-hidden="true">
            {iniciais}
          </span>
          <span className="sidebar-user-info">
            <strong>{user?.nome}</strong>
            <span>{user?.role === 'admin' ? 'Administrador' : 'Membro'}</span>
          </span>
        </div>
        <button
          className="sidebar-logout"
          onClick={logout}
          title={rotulo('Sair')}
          aria-label="Sair"
        >
          <span className="sidebar-item-icon">{ICON_SAIR}</span>
          <span className="sidebar-item-label">Sair</span>
        </button>
      </div>
    </aside>
  );
}