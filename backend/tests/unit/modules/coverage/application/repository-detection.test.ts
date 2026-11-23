import { describe, expect, it } from 'vitest';

import { MissingRepositoryError } from '#coverage/application/errors/missing-repository.error';
import type { UnsupportedProject } from '#coverage/application/ports/project-detector.port';
import {
  coverageApplication,
  supportedProject,
} from '#tests/support/coverage-application';
import { acmeWidgets, loanOf } from '#tests/support/stand-in-repositories';

const LOAN = loanOf('scan:job-1');

const RUNS_CODE: UnsupportedProject = {
  outcome: 'unsupported',
  reason: 'install_runs_code',
  detail: 'yarn.lock takes a package from a git repository.',
};

describe('RepositoryDetection', () => {
  describe('detect', () => {
    it('should detect with the mode the repository has now', async () => {
      const { detection, detector, repositories } = coverageApplication();
      repositories.repository = {
        ...acmeWidgets(),
        install: { mode: 'trusted', isDefault: true },
      };

      const detected = await detection.detect(LOAN);

      expect(detected).toEqual(supportedProject());
      expect(detector.modes).toEqual(['trusted']);
    });

    it('should ask the repository again for each copy', async () => {
      const { detection, detector, repositories } = coverageApplication();
      await detection.detect(LOAN);
      repositories.repository = {
        ...acmeWidgets(),
        install: { mode: 'trusted', isDefault: false },
      };

      await detection.detect(LOAN);

      expect(detector.modes).toEqual(['sandboxed', 'trusted']);
    });

    describe('when a sandboxed install would run code', () => {
      it('should end the reason with how to trust the repository', async () => {
        const { detection, detector } = coverageApplication();
        detector.detection = RUNS_CODE;

        expect(await detection.detect(LOAN)).toEqual({
          ...RUNS_CODE,
          detail:
            'yarn.lock takes a package from a git repository. Trust the ' +
            'repository to install it as its developers do: repo trust ' +
            'acme/widgets trusted.',
        });
      });
    });

    describe('when the project is refused for what no trust changes', () => {
      it('should leave the reason as it is', async () => {
        const { detection, detector } = coverageApplication();
        const monorepo: UnsupportedProject = {
          outcome: 'unsupported',
          reason: 'monorepo',
          detail: 'The repository holds more than one package (lerna.json).',
        };
        detector.detection = monorepo;

        expect(await detection.detect(LOAN)).toEqual(monorepo);
      });
    });

    describe('when no repository has the id of the copy', () => {
      it('should throw MissingRepositoryError and detect nothing', async () => {
        const { detection, detector, repositories } = coverageApplication();
        repositories.repository = null;

        await expect(detection.detect(LOAN)).rejects.toThrow(
          MissingRepositoryError,
        );
        expect(detector.modes).toEqual([]);
      });
    });
  });
});
