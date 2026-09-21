import { apiRequest } from './client';
import type { AuthTokens, AuthUser } from '../types';

export function login(email: string, senha: string) {
  return apiRequest<AuthTokens>('/auth/login', { method: 'POST', body: { email, senha } });
}

export function me() {
  return apiRequest<AuthUser>('/auth/me', { method: 'POST' });
}