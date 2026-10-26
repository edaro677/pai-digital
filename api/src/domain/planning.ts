import { InvalidValueError } from './errors.js';

/** Institutional vocabulary only. These labels do not authorize transitions and
 * are not mapped onto the two technical PoC states stored by ReportRepository. */
export const planningStates = Object.freeze([
  'Abierto', 'Enviado', 'En revisión', 'Devuelto con observación',
  'Validado', 'Socializado', 'Cierre del informe',
] as const);
export type PlanningState = typeof planningStates[number];

export function planningState(value: string): PlanningState {
  if (!(planningStates as readonly string[]).includes(value)) throw new InvalidValueError();
  return value as PlanningState;
}

/** Necessary prerequisite for a future send operation, not proof of uploaded
 * evidence, permission to send, or an institutional state transition. */
export function requireSubmissionEvidence(scheduledAdvance: boolean, evidenceReferences: readonly string[]): void {
  if (typeof scheduledAdvance !== 'boolean' || !Array.isArray(evidenceReferences)
      || evidenceReferences.some(reference => typeof reference !== 'string' || reference.trim().length === 0
        || /[\u0000-\u001f\u007f]/.test(reference))
      || (scheduledAdvance && evidenceReferences.length === 0)) throw new InvalidValueError();
}
