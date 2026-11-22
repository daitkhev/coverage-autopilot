import type { ReactNode } from 'react';

import { ErrorDetails } from '#components/error-details';
import type { StatusLook } from '#theme/status';

/** A refusal of the service: its stable code and its sentence. */
interface Refusal {
  readonly error: string;
  readonly message: string;
}

interface ProblemDetailsProps {
  /** What did not happen, such as "Not connected". */
  readonly headline: string;
  /** What the service refused with, which wins over a fault. */
  readonly refusal: Refusal | undefined;
  /** What a request threw, other than a service that does not answer. */
  readonly fault: unknown;
  readonly next: string;
}

interface Said {
  readonly code: string;
  readonly heading: string;
  readonly text: string;
}

const FAILED: StatusLook = { glyph: 'failed', word: 'failed', role: 'danger' };

function saidOf(refusal: Refusal | undefined, fault: unknown): Said {
  if (refusal !== undefined) {
    return {
      code: refusal.error,
      heading: 'THE SERVICE ANSWERED',
      text: refusal.message,
    };
  }
  return fault instanceof Error
    ? { code: fault.name, heading: 'THE CLIENT SAID', text: fault.message }
    : { code: 'fault', heading: 'THE CLIENT SAID', text: String(fault) };
}

/**
 * What went wrong with a request: what the service refused with, or the
 * fault it threw, never hidden. Nothing is drawn when neither happened.
 */
export function ProblemDetails({
  headline,
  refusal,
  fault,
  next,
}: ProblemDetailsProps): ReactNode {
  if (refusal === undefined && fault === undefined) {
    return null;
  }
  const said = saidOf(refusal, fault);
  return (
    <ErrorDetails
      look={FAILED}
      headline={headline}
      code={said.code}
      answer={{ heading: said.heading, text: said.text }}
      next={next}
    />
  );
}
