import { createHash, randomUUID } from 'node:crypto';
import type { ReportTools } from '../application/reports/service.js';
import { correlationId, entityId, requestFingerprint } from '../domain/types.js';

const tools: ReportTools = {
  id: kind => entityId(kind, randomUUID()),
  correlation: () => correlationId(randomUUID()),
  fingerprint: canonical => requestFingerprint(createHash('sha256').update(canonical, 'utf8').digest('hex')),
};
export const reportTools = Object.freeze(tools);
