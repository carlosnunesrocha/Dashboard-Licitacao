import { Navigate, Route, Routes } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { LicitacoesPage } from './pages/LicitacoesPage';
import { KanbanPage } from './pages/KanbanPage';
import { RelatoriosPage } from './pages/RelatoriosPage';
import { SettingsPage } from './pages/SettingsPage';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AppLayout } from './components/layout/AppLayout';

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      {/* A casca fica dentro do ProtectedRoute: sem sessão não se vê nem o
          menu, e as cinco páginas herdam a sidebar por serem filhas. */}
      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<DashboardPage />} />
        <Route path="/licitacoes" element={<LicitacoesPage />} />
        <Route path="/kanban" element={<KanbanPage />} />
        <Route path="/relatorios" element={<RelatoriosPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>

      {/* Rota desconhecida volta ao início em vez de deixar a tela em branco. */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;