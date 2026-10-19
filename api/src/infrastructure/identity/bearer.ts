import { AuthenticationError } from './errors.js';

/** Rechaza listas, valores fusionados con coma, controles y formatos ambiguos. */
export function extractBearer(value: string | readonly string[] | null | undefined): string {
  if (typeof value !== 'string' || value.length > 32768) throw new AuthenticationError('INVALID_AUTHORIZATION');
  const match = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i.exec(value);
  if (!match || match[0] !== value) throw new AuthenticationError('INVALID_AUTHORIZATION');
  return match[1];
}
