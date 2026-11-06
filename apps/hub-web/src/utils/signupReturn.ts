import type { Location } from 'react-router-dom';

const ALLOWED = new Set(['/', '/planos', '/login']);

export function signupLinkState(location: Pick<Location, 'pathname' | 'search' | 'hash'>) {
  return { from: `${location.pathname}${location.search}${location.hash}` };
}

/** Destino do “voltar” no cadastro. Só aceita páginas públicas conhecidas. */
export function signupBackTarget(from: unknown): { to: string; label: string } {
  const home = { to: '/', label: '← Voltar' };
  if (typeof from !== 'string' || !from.startsWith('/') || from.startsWith('//')) return home;
  const pathname = from.split(/[?#]/)[0];
  if (!ALLOWED.has(pathname)) return home;
  if (pathname === '/login') return { to: from, label: '← Voltar ao login' };
  return { to: from, label: '← Voltar' };
}
