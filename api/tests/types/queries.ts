import { ReadFichaQueries } from '../../src/application/queries/readFicha.js';
import type { FichaAuthorizationService } from '../../src/application/authorization/service.js';
import type { UnitOfWork } from '../../src/application/ports/unitOfWork.js';
import type { AuthenticatedIdentity } from '../../src/application/ports/identity.js';
import type { Activity, Ficha } from '../../src/domain/entities.js';
import type { FichaId } from '../../src/domain/types.js';

declare const work: UnitOfWork;
declare const authorization: FichaAuthorizationService;
declare const principal: AuthenticatedIdentity;
declare const id: FichaId;
const queries = new ReadFichaQueries(work, authorization);
const ficha: Promise<Ficha> = queries.ficha(principal, id);
const activities: Promise<readonly Activity[]> = queries.actividades(principal, id);
void ficha;
void activities;
// @ts-expect-error La consulta no acepta un UserId o cuerpo HTTP como identidad.
void queries.ficha({ userId: 'other-user' }, id);
