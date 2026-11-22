import type {
  Improvement,
  ImprovementPatch,
} from '@coverage-autopilot/api-contracts/improvements';
import type { Repository } from '@coverage-autopilot/api-contracts/repositories';

import type { ServiceAnswer, ServiceApi } from '#api/service-api';

/** The improvement, the patch of its accepted attempt, and its repository. */
export interface LoadedPatch {
  readonly improvement: Improvement;
  readonly patch: ImprovementPatch;
  readonly repository: Repository;
}

/**
 * The improvement, its patch and its repository in one answer, so the
 * screen asks one request on its timer. A refusal of any is the answer.
 */
export async function loadPatch(
  api: ServiceApi,
  improvementId: string,
): Promise<ServiceAnswer<LoadedPatch>> {
  const improvement = await api.getImprovement(improvementId);
  if (improvement.outcome === 'refused') {
    return improvement;
  }
  const patch = await api.getImprovementPatch(improvementId);
  if (patch.outcome === 'refused') {
    return patch;
  }
  const repository = await api.getRepository(improvement.value.repositoryId);
  return repository.outcome === 'refused'
    ? repository
    : {
        ...patch,
        value: {
          improvement: improvement.value,
          patch: patch.value,
          repository: repository.value,
        },
      };
}

/** One file of a patch: its path, its added lines, and what it removes. */
export interface PatchFile {
  readonly path: string;
  /** A file the patch creates, rather than one it changes. */
  readonly created: boolean;
  readonly added: readonly string[];
  readonly removed: number;
}

const FILE_START = 'diff --git ';
const NEW_FILE = 'new file mode';
const NEW_PATH = '+++ ';
const OLD_PATH = '--- ';
/** The prefix git writes before the path of the new side of a file. */
const NEW_SIDE = 'b/';

/** A file while its lines are read: the lines are added in place. */
interface Reading {
  path: string;
  created: boolean;
  readonly added: string[];
  removed: number;
}

function startOf(line: string): Reading {
  const sides = line.slice(FILE_START.length);
  const at = sides.lastIndexOf(` ${NEW_SIDE}`);
  return {
    path: at === -1 ? sides : sides.slice(at + NEW_SIDE.length + 1),
    created: false,
    added: [],
    removed: 0,
  };
}

/** A line of the patch, read into the file it belongs to. */
function read(file: Reading, line: string): void {
  if (line.startsWith(NEW_PATH) || line.startsWith(OLD_PATH)) {
    return;
  }
  if (line.startsWith(NEW_FILE)) {
    file.created = true;
  } else if (line.startsWith('+')) {
    file.added.push(line.slice(1));
  } else if (line.startsWith('-')) {
    file.removed += 1;
  }
}

/**
 * The files of a unified diff, each with the lines it adds. The gate lets
 * only test files change, so the added lines are what a person reviews.
 */
export function patchFilesOf(patch: string): PatchFile[] {
  const files: Reading[] = [];
  for (const line of patch.split('\n')) {
    const file = files.at(-1);
    if (line.startsWith(FILE_START)) {
      files.push(startOf(line));
    } else if (file !== undefined) {
      read(file, line);
    }
  }
  return files;
}
