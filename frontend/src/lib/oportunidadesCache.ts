/**
 * Cache de oportunidades no localStorage (24h).
 *
 * Usado como fallback para quando o backend não tem Redis — garante que as
 * oportunidades já carregadas não desapareçam ao navegar ou recarregar a página.
 * Quando o backend volta (com Redis ou com scraping rápido), o cache local
 * expira e recarrega do servidor.
 */
const CACHE_KEY = 'oportunidades.cache';
const TTL_MS = 24 * 60 * 60 * 1000; // 24h

interface CacheEntry {
  data: unknown[];
  savedAt: number;
}

export function getCacheOportunidades(): unknown[] | null {
  const raw = localStorage.getItem(CACHE_KEY);
  if (!raw) return null;
  try {
    const entry = JSON.parse(raw) as CacheEntry;
    if (Date.now() - entry.savedAt > TTL_MS) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

export function setCacheOportunidades(data: unknown[]): void {
  const entry: CacheEntry = { data, savedAt: Date.now() };
  localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
}

export function invalidateCacheOportunidades(): void {
  localStorage.removeItem(CACHE_KEY);
}
