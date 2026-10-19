import type { Activity, Ficha } from '../../domain/entities.js';
import { AccessDeniedError, IncompatibleStateError } from '../../domain/errors.js';
import type { FichaId } from '../../domain/types.js';
import type { AuthenticatedIdentity } from '../ports/identity.js';
import type { UnitOfWork } from '../ports/unitOfWork.js';
import type { FichaAuthorizationService } from '../authorization/service.js';

export class ReadFichaQueries {
  constructor(
    private readonly work: UnitOfWork,
    private readonly authorization: FichaAuthorizationService,
  ) {}

  async ficha(identity: AuthenticatedIdentity, id: FichaId): Promise<Ficha> {
    return this.work.runAtomic(async context => {
      await this.authorization.requireAllowed(context, identity, id, 'poc:read');
      const ficha = await context.fichas.findById(id);
      if (!ficha) throw new AccessDeniedError();
      if (ficha.id !== id) throw new IncompatibleStateError();
      return { id: ficha.id, dependencyId: ficha.dependencyId,
        cycleLabel: ficha.cycleLabel, version: ficha.version };
    });
  }

  async actividades(identity: AuthenticatedIdentity, id: FichaId): Promise<readonly Activity[]> {
    return this.work.runAtomic(async context => {
      await this.authorization.requireAllowed(context, identity, id, 'poc:read');
      const activities = await context.activities.listByFicha(id);
      // Un adaptador incoherente falla cerrado; nunca devolver filas de otra ficha.
      if (activities.some(activity => activity.fichaId !== id)) throw new IncompatibleStateError();
      return activities.map(activity => ({ id: activity.id, fichaId: activity.fichaId,
        description: activity.description, version: activity.version }));
    });
  }
}
