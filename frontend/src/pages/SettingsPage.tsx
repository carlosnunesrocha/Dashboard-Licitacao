import { EmConstrucao, PageHeader } from '../components/layout/PageHeader';
import { useAuth } from '../context/AuthContext';

export function SettingsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  return (
    <div className="page">
      <PageHeader
        titulo="Configurações"
        descricao={
          isAdmin
            ? 'Preferências da sua conta e administração do painel.'
            : 'Preferências da sua conta.'
        }
      />
      <EmConstrucao
        texto={
          isAdmin
            ? 'Gestão de usuários, integrações e preferências do painel serão tratadas aqui.'
            : 'As opções de personalização da conta serão tratadas aqui.'
        }
      />
    </div>
  );
}