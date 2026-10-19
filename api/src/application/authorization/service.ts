import type { AccessAssignment } from '../../domain/entities.js';
import { AccessDeniedError } from '../../domain/errors.js';
import type { Capability, FichaId, TenantId, UserId, UtcInstant } from '../../domain/types.js';
import type { Clock } from '../ports/clock.js';
import type { AuthenticatedIdentity } from '../ports/identity.js';
import type { TransactionContext } from '../ports/unitOfWork.js';

/** Política pura obligatoria: L2 no prescribe límites temporales inclusivos/exclusivos.
 * Solo código confiable puede componerla; nunca parámetros de una petición.
 * Sin política aplicable no se debe componer este servicio para uso operativo.
 */
export interface AssignmentValidityPolicy {
  isApplicable(assignment: Readonly<AccessAssignment>, at: UtcInstant): boolean;
}

export type AllowedDecision = Readonly<{
  allowed: true; userId: UserId; fichaId: FichaId; capability: Capability;
}>;
export type AuthorizationDecision = AllowedDecision | Readonly<{ allowed: false }>;

const denied: AuthorizationDecision = Object.freeze({ allowed: false });

/** No abre transacciones, autentica identidades, guarda decisiones ni concede roles.
 * El consumidor debe comprobar y operar sobre el recurso real en ESTE contexto.
 */
export class FichaAuthorizationService {
  readonly #tenantId: TenantId;
  readonly #clock: Clock;
  readonly #validity: AssignmentValidityPolicy;

  constructor(tenantId: TenantId, clock: Clock, validity: AssignmentValidityPolicy) {
    this.#tenantId = tenantId;
    this.#clock = clock;
    this.#validity = validity;
  }

  async decide(
    context: TransactionContext, identity: AuthenticatedIdentity,
    fichaId: FichaId, capability: Capability,
  ): Promise<AuthorizationDecision> {
    if (identity.tenantId !== this.#tenantId
        || (capability !== 'poc:read' && capability !== 'poc:edit-report')) return denied;

    const user = await context.users.findByIdentity(identity.tenantId, identity.objectId);
    if (!user || user.enabled !== true || user.tenantId !== identity.tenantId
        || user.directoryObjectId !== identity.objectId) return denied;
    const ficha = await context.fichas.findById(fichaId);
    if (!ficha || ficha.id !== fichaId) return denied;

    const assignments = await context.assignments.listByUserAndFicha(user.id, ficha.id);
    const at = this.#clock.now();
    const applicable = assignments.some(assignment =>
      assignment.userId === user.id && assignment.fichaId === ficha.id
      && assignment.enabled === true && assignment.capability === capability
      && this.#validity.isApplicable(assignment, at) === true);
    return applicable
      ? Object.freeze({ allowed: true, userId: user.id, fichaId: ficha.id, capability })
      : denied;
  }

  /** Lanzar hacia runAtomic: no capturar la denegación para continuar escribiendo. */
  async requireAllowed(
    context: TransactionContext, identity: AuthenticatedIdentity,
    fichaId: FichaId, capability: Capability,
  ): Promise<AllowedDecision> {
    const decision = await this.decide(context, identity, fichaId, capability);
    if (!decision.allowed) throw new AccessDeniedError();
    return decision;
  }
}
