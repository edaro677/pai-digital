import { app } from '@azure/functions';
import { health } from '../http/health.js';
import { assertLocalEnvironment } from '../infrastructure/localOnly.js';

assertLocalEnvironment();

app.http('pocHealth', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'poc/health',
  handler: health,
});
