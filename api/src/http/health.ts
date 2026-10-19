import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';

export function health(_request: HttpRequest, _context: InvocationContext): HttpResponseInit {
  return {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
    jsonBody: { status: 'ok', service: 'pai-api-poc', stage: 'L1', mode: 'local-only' },
  };
}
