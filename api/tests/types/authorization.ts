import { FichaAuthorizationService } from '../../src/application/authorization/service.js';
import type { AssignmentValidityPolicy, AuthorizationDecision } from '../../src/application/authorization/service.js';
import type { AuthenticatedIdentity } from '../../src/application/ports/identity.js';
import type { Clock } from '../../src/application/ports/clock.js';
import type { TransactionContext } from '../../src/application/ports/unitOfWork.js';
import type { FichaId, TenantId, UserId } from '../../src/domain/types.js';

declare const tenant: TenantId;
declare const clock: Clock;
declare const validity: AssignmentValidityPolicy;
declare const context: TransactionContext;
declare const identity: AuthenticatedIdentity;
declare const ficha: FichaId;
declare const user: UserId;
const service = new FichaAuthorizationService(tenant, clock, validity);
const result: Promise<AuthorizationDecision> = service.decide(context, identity, ficha, 'poc:read');
void result;
// @ts-expect-error No usuario interno arbitrario en lugar de identidad verificada.
void service.decide(context, user, ficha, 'poc:read');
// @ts-expect-error No capacidades adicionales.
void service.decide(context, identity, ficha, 'poc:admin');
// @ts-expect-error La decisión requiere contexto transaccional.
void service.decide(identity, ficha, 'poc:read');
// @ts-expect-error No hay política temporal implícita.
new FichaAuthorizationService(tenant, clock);
