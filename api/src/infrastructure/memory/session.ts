import { IncompatibleStateError, VersionConflictError } from '../../domain/errors.js';
import type { Version } from '../../domain/types.js';
import type { MemoryState } from './state.js';

/** Estado de vida transaccional interno; no es un puerto ni un commit público. */
export class MemorySession {
  #active = true;
  #failed = false;
  #failure: unknown;
  #pending: Promise<unknown>[] = [];

  constructor(readonly state: MemoryState, readonly nextVersion: () => Version) {}

  invoke<Value>(operation: () => Value): Promise<Value> {
    // El acceso al estado es síncrono; las interfaces siguen devolviendo Promise.
    // No se retienen inputs hasta otro tick ni se lanza I/O en segundo plano.
    let result: Promise<Value>;
    try {
      if (!this.#active) throw new IncompatibleStateError();
      result = Promise.resolve(operation());
    } catch (error) {
      if (this.#active && !this.#failed) {
        this.#failed = true;
        this.#failure = error;
      }
      result = Promise.reject(error);
    }
    if (this.#active) this.#pending.push(result);
    // Una llamada omitida por el consumidor no produce un rechazo global sin manejar;
    // su fallo igualmente impide el commit. La Promise devuelta conserva el rechazo.
    void result.catch(() => undefined);
    return result;
  }

  checkVersion(actual: Version, expected: Version): void {
    if (actual !== expected) throw new VersionConflictError();
  }

  close(): void { this.#active = false; }

  async finish(): Promise<void> {
    this.close();
    await Promise.allSettled(this.#pending);
    if (this.#failed) throw this.#failure;
  }
}
