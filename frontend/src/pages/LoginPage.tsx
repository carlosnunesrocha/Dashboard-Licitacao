import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../api/client';

/**
 * Login em duas colunas: painel escuro de marca à esquerda, formulário à
 * direita. O painel some abaixo de 900px — em tela estreita ele empurraria o
 * formulário para baixo da dobra, que é o que a pessoa veio fazer aqui.
 */

/**
 * Ícones inline: quatro glifos não justificam uma dependência de ícones.
 * Preenchidos (não contorno), como os da referência — em tamanho pequeno o
 * traço fino some contra o fundo colorido.
 *
 * O viewBox de 24 é o que manda no tamanho de exibição: ver a nota em
 * `.login-feature-icon svg` no index.css sobre usar múltiplos limpos de 24.
 */
const ICONS = {
  kanban: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="3" y="4" width="5" height="16" rx="1.5" />
      <rect x="9.5" y="4" width="5" height="10" rx="1.5" />
      <rect x="16" y="4" width="5" height="13" rx="1.5" />
    </svg>
  ),
  sync: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 4a8 8 0 0 1 7.5 5.2l-1.9.7A6 6 0 0 0 12 6V4z" />
      <path d="M12 20a8 8 0 0 1-7.5-5.2l1.9-.7A6 6 0 0 0 12 18v2z" />
      <path d="M12 2.2 16 5l-4 2.8V2.2zM12 21.8 8 19l4-2.8v5.6z" />
      <path d="M4.3 9.8a8 8 0 0 0 0 4.4l1.9-.6a6 6 0 0 1 0-3.2l-1.9-.6z" />
    </svg>
  ),
  resultado: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M3 19h18v2H3zM5 12h3v5H5zM10.5 8h3v9h-3zM16 4h3v13h-3z" />
    </svg>
  ),
  prazo: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M9 2h6v2H9z" />
      <path d="M12 5a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm1 8.6 2.6 2-1.2 1.6L11 13.6V8.5h2v5.1z" />
    </svg>
  ),
};

const FEATURES = [
  {
    icon: ICONS.kanban,
    titulo: 'Kanban centralizado',
    texto: 'Todas as negociações em um só quadro, da análise ao resultado',
  },
  {
    icon: ICONS.sync,
    titulo: 'Sincronização automática',
    texto: 'Caixa Escolar e LicitarDigital atualizados a cada 6 horas',
  },
  {
    icon: ICONS.resultado,
    titulo: 'Resultados e histórico',
    texto: 'O que foi ganho, perdido e por qual valor',
  },
  {
    icon: ICONS.prazo,
    titulo: 'Propostas em aberto',
    texto: 'Acompanhe o que está em disputa sem abrir cada portal',
  },
];

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, senha);
      navigate('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao entrar. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-split">
      <aside className="login-brand">
        <div className="login-brand-logo">
          Painel de <strong>Licitações</strong>
        </div>

        <div className="login-brand-body">
          <h1 className="login-brand-headline">
            Suas licitações
            <br />
            <span>em um só lugar</span>
          </h1>
          <p className="login-brand-sub">
            Diretoria e gerência acompanham todas as negociações sem abrir um portal de cada vez.
          </p>

          <ul className="login-features">
            {FEATURES.map((f, i) => (
              // O atraso escalonado faz os cartões entrarem em sequência, não
              // em bloco — o olho acompanha a lista de cima para baixo.
              <li key={f.titulo} style={{ '--i': i } as React.CSSProperties}>
                <span className="login-feature-icon">{f.icon}</span>
                <div>
                  <strong>{f.titulo}</strong>
                  <span>{f.texto}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <footer className="login-brand-footer">
          Uso interno · <strong>Artefatos de Papel Lucri</strong>
        </footer>
      </aside>

      <main className="login-form-side">
        <form className="login-form" onSubmit={handleSubmit}>
          <div className="login-form-head">
            <h2>Bem-vindo de volta</h2>
            <p className="login-form-sub">Entre com sua conta para acessar o painel</p>
          </div>

          <label className="login-field" htmlFor="email">
            <span>E-mail</span>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              autoComplete="username"
              required
              autoFocus
            />
          </label>

          <label className="login-field" htmlFor="senha">
            <span>Senha</span>
            <input
              id="senha"
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </label>

          {/* aria-live: quem usa leitor de tela ouve o erro sem reencontrar o campo. */}
          <div className="login-error-slot" aria-live="polite">
            {error && <div className="form-error">{error}</div>}
          </div>

          <button type="submit" className="login-submit" disabled={submitting}>
            {submitting ? 'Entrando…' : 'Entrar'}
          </button>

          <p className="login-form-help">
            Esqueceu a senha? Fale com o administrador do painel.
          </p>
        </form>
      </main>
    </div>
  );
}
