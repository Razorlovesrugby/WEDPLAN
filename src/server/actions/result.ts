/**
 * What every server action returns.
 *
 * Actions never throw for expected problems — a validation failure is a thing
 * the form should render next to the field, not a 500. Unexpected failures
 * still throw and hit the error boundary.
 */
export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function fail(error: string, fieldErrors?: Record<string, string[]>): ActionResult<never> {
  return { ok: false, error, fieldErrors };
}
