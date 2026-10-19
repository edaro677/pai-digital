import type { UtcInstant } from '../../domain/types.js';

/** Síncrono e inyectable; no se implementa un reloj de sistema ni se consulta Date.now. */
export interface Clock {
  now(): UtcInstant;
}
