import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { TransactionContext, UnitOfWork } from '../../application/ports/unitOfWork.js';
import { IncompatibleStateError } from '../../domain/errors.js';
import { version } from '../../domain/types.js';
import { createState, copy } from './state.js';
import type { MemorySeed, MemoryState } from './state.js';
import { MemorySession } from './session.js';
import { createTransactionContext } from './repositories.js';

/** Una instancia = un estado volátil y una cola de exclusión mutua. Sin I/O. */
export class MemoryUnitOfWork implements UnitOfWork {
  #state: MemoryState;
  #tail: Promise<void> = Promise.resolve();
  #execution = new AsyncLocalStorage<boolean>();

  constructor(seed: MemorySeed = {}) { this.#state = createState(seed); }

  async runAtomic<Result>(work: (context: TransactionContext) => Promise<Result>): Promise<Result> {
    if (this.#execution.getStore()) throw new IncompatibleStateError();
    const previous = this.#tail;
    let release!: () => void;
    this.#tail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      const draft = copy(this.#state);
      const session = new MemorySession(draft, () => version(randomUUID()));
      return await this.#execution.run(true, async () => {
        try {
          const result = await work(createTransactionContext(session));
          await session.finish();
          this.#state = draft;
          return result;
        } finally {
          session.close();
        }
      });
    } finally {
      release();
    }
  }
}
