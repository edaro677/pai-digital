import type { Activity, Ficha, Report } from '../../domain/entities.js';
import { AccessDeniedError, IncompatibleStateError } from '../../domain/errors.js';
import type { FichaId, PeriodKey } from '../../domain/types.js';
import type { AuthenticatedIdentity } from '../ports/identity.js';
import type { UnitOfWork } from '../ports/unitOfWork.js';
import type { FichaAuthorizationService } from '../authorization/service.js';

type ReportRead = Pick<Report, 'id' | 'activityId' | 'period' | 'quantity' | 'narrative' |
  'state' | 'version' | 'createdAt' | 'updatedAt'>;

export class ReadFichaQueries {
  constructor(
    private readonly work: UnitOfWork,
    private readonly authorization: FichaAuthorizationService,
  ) {}

  /** Discovery is scoped to the validated user's assignments. Each ficha is
   * authorized again in this same transaction; candidates never grant access. */
  async fichas(identity: AuthenticatedIdentity, candidates?: readonly FichaId[]): Promise<readonly Ficha[]> {
    return this.work.runAtomic(async context => {
      const user = await context.users.findByIdentity(identity.tenantId, identity.objectId);
      if (!user || !user.enabled || user.tenantId !== identity.tenantId || user.directoryObjectId !== identity.objectId) return [];
      const ids = candidates ?? (await context.assignments.listByUser(user.id)).map(assignment => {
        if (assignment.userId !== user.id) throw new IncompatibleStateError();
        return assignment.fichaId;
      });
      const result: Ficha[] = [];
      for (const id of new Set(ids)) {
        const decision = await this.authorization.decide(context, identity, id, 'poc:read');
        if (!decision.allowed) continue;
        const ficha = await context.fichas.findById(id);
        if (!ficha || ficha.id !== id) throw new IncompatibleStateError();
        result.push({ id: ficha.id, dependencyId: ficha.dependencyId,
          cycleLabel: ficha.cycleLabel, version: ficha.version });
      }
      return result;
    });
  }

  /** One atomic, authorized read; activity insertion order is retained. */
  async reportes(identity: AuthenticatedIdentity, id: FichaId, period: PeriodKey): Promise<readonly ReportRead[]> {
    return this.work.runAtomic(async context => {
      await this.authorization.requireAllowed(context, identity, id, 'poc:read');
      const activities = await context.activities.listByFicha(id);
      if (activities.some(activity => activity.fichaId !== id)) throw new IncompatibleStateError();
      const result: ReportRead[] = [];
      for (const activity of activities) {
        const report = await context.reports.findByActivityAndPeriod(activity.id, period);
        if (!report) continue;
        if (report.activityId !== activity.id || report.period !== period) throw new IncompatibleStateError();
        result.push({ id: report.id, activityId: report.activityId, period: report.period,
          quantity: report.quantity, narrative: report.narrative, state: report.state,
          version: report.version, createdAt: report.createdAt, updatedAt: report.updatedAt });
      }
      return result;
    });
  }

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
