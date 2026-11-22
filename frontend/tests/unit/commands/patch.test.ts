import { describe, expect, it } from 'vitest';

import { patch } from '#commands/patch';
import { answered, refused } from '#tests/support/fake-service-api';
import { ACCEPTED_HASH } from '#tests/support/sample-attempts';
import { expectRefusal, recordingIo } from '#tests/support/sample-command-io';
import { PATCH_AWAITING_APPROVAL } from '#tests/support/sample-improvements';

const PATCH = { name: 'patch', id: 'improvement-sum' } as const;

describe('patch', () => {
  it('should print the hash, then every line of the diff', async () => {
    const io = recordingIo({
      getImprovementPatch: () =>
        Promise.resolve(answered(PATCH_AWAITING_APPROVAL)),
    });

    await expect(patch(PATCH, io)).resolves.toBe(0);

    expect(io.session.api.calls).toEqual([
      { method: 'getImprovementPatch', arguments: ['improvement-sum'] },
    ]);
    expect(io.printed).toEqual([
      `hash         ${ACCEPTED_HASH}`,
      'diff --git a/src/billing/sum.test.ts b/src/billing/sum.test.ts',
      'new file mode 100644',
      '--- /dev/null',
      '+++ b/src/billing/sum.test.ts',
      '@@ -0,0 +1,7 @@',
      "+import { sumTaxes } from './sum';",
      '+',
      "+describe('sumTaxes', () => {",
      "+  it('should add the tax of every line', () => {",
      '+    expect(sumTaxes([{ net: 100, rate: 0.2 }])).toBe(20);',
      '+  });',
      '+});',
    ]);
  });

  describe('when the result is asked for as JSON', () => {
    it('should print the patch of the contract as one document', async () => {
      const io = recordingIo(
        {
          getImprovementPatch: () =>
            Promise.resolve(answered(PATCH_AWAITING_APPROVAL)),
        },
        { json: true },
      );

      await expect(patch(PATCH, io)).resolves.toBe(0);

      expect(io.printed).toEqual([JSON.stringify(PATCH_AWAITING_APPROVAL)]);
    });
  });

  describe('when no attempt was accepted', () => {
    it('should say the refusal in its shape and end with 1', async () => {
      const conflict = {
        error: 'status_conflict',
        message: 'No attempt of this improvement was accepted.',
      } as const;
      const io = recordingIo({
        getImprovementPatch: () => Promise.resolve(refused(409, conflict)),
      });

      await expect(patch(PATCH, io)).resolves.toBe(1);

      expectRefusal(io, conflict);
    });
  });
});
