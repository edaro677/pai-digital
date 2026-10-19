import { app } from '@azure/functions';
import { createLocalQueryHandlers } from '../composition/queries.js';
import { assertLocalEnvironment } from '../infrastructure/localOnly.js';

assertLocalEnvironment();
const handlers = createLocalQueryHandlers(process.env.PAI_API_IDENTITY_CONFIG);

// anonymous solo desactiva la clave Functions; el controlador exige JWT L4-A y acceso L4-B.
app.http('pocFicha', {
  methods: ['GET'], authLevel: 'anonymous', route: 'poc/fichas/{fichaId}', handler: handlers.ficha,
});
app.http('pocFichaActividades', {
  methods: ['GET'], authLevel: 'anonymous', route: 'poc/fichas/{fichaId}/actividades', handler: handlers.actividades,
});
app.http('pocReportCreate', {
  methods: ['POST'], authLevel: 'anonymous', route: 'poc/actividades/{activityId}/reportes', handler: handlers.createReport,
});
app.http('pocReportRead', {
  methods: ['GET'], authLevel: 'anonymous', route: 'poc/reportes/{reportId}', handler: handlers.getReport,
});
app.http('pocReportUpdate', {
  methods: ['PATCH'], authLevel: 'anonymous', route: 'poc/reportes/{reportId}', handler: handlers.updateReport,
});
