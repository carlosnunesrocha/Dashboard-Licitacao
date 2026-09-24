import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'licitacoes.theme';

interface ThemeContextValue {
  theme: Theme;
  toggle: () => void;
  /**
   * Suspende o tema escuro enquanto a tela montada preferir o claro.
   * Usado pelo login, que tem identidade visual própria (painel escuro de
   * marca ao lado de formulário claro) e ficaria sem contraste no escuro.
   */
  forcarClaro: (ativo: boolean) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

/**
 * Lê a preferência salva; se não houver, segue o sistema operacional.
 * Roda antes da primeira pintura (useState com inicializador) para não
 * piscar claro antes de aplicar o escuro.
 */
function temaInicial(): Theme {
  const salvo = localStorage.getItem(STORAGE_KEY);
  if (salvo === 'light' || salvo === 'dark') return salvo;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(temaInicial);
  const [claroForcado, setClaroForcado] = useState(false);

  // A preferência continua salva mesmo sob claro forçado: ao sair do login a
  // pessoa volta ao tema que escolheu, em vez de ser devolvida ao claro.
  useEffect(() => {
    document.documentElement.dataset.theme = claroForcado ? 'light' : theme;
  }, [theme, claroForcado]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  }, []);

  const forcarClaro = useCallback((ativo: boolean) => setClaroForcado(ativo), []);

  return (
    <ThemeContext.Provider value={{ theme, toggle, forcarClaro }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme deve ser usado dentro de ThemeProvider');
  return ctx;
}