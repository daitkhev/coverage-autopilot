import type { GenerationRequest } from '#improvement/application/ports/test-generator.port';
import type {
  GeneratorSettings,
  ReadyGeneratorSettings,
} from '#improvement/infrastructure/generator/generator-settings';

/**
 * The sandbox has a read-only root and a writable `/tmp`, and the CLI
 * writes its own state where these point. Nothing of the host is there.
 */
const HOME = '/tmp';
const CONFIG_DIRECTORY = '/tmp/.claude';

/**
 * No hook of the repository runs, and no file outside the working copy is
 * read. A run without them started the hooks of a test repository.
 */
const PROTECTED_SETTINGS = JSON.stringify({
  disableAllHooks: true,
  permissions: { blockReadsOutsideWorkingDirectories: true },
});

function budgetArguments(request: GenerationRequest): string[] {
  const cost = request.limits.maxCostUsd;
  return cost === null ? [] : ['--max-budget-usd', String(cost)];
}

/**
 * The start that kept the configuration of a repository from running in
 * a measured run: no shell among the tools, edits taken without a prompt,
 * no tool server but those named here, which are none, and no session
 * kept. The prompt is one argument, never a line for a shell.
 */
export function claudeCodeArguments(
  settings: GeneratorSettings,
  request: GenerationRequest,
  prompt: string,
): string[] {
  return [
    ...settings.command,
    '--restricted',
    ...['--tools', settings.allowedTools.join(',')],
    ...['--permission-mode', 'acceptEdits'],
    ...['--permission-prompts', 'none'],
    '--strict-mcp-config',
    ...['--settings', PROTECTED_SETTINGS],
    '--no-session-persistence',
    ...['--model', request.generator.model],
    ...['--max-turns', String(request.limits.maxTurns)],
    ...budgetArguments(request),
    ...['--output-format', 'stream-json', '--verbose'],
    ...['-p', prompt],
  ];
}

/**
 * Exactly the variables of the CLI: the credential, a home and a folder of
 * its configuration in the scratch folder, no `CLAUDE.md` of the
 * repository, and what the settings add. The variables the adapter sets
 * come last, so the settings cannot replace one.
 */
export function claudeCodeEnvironment(
  settings: ReadyGeneratorSettings,
): Record<string, string> {
  return {
    ...settings.environment,
    [settings.credential.variable]: settings.credential.value,
    HOME,
    CLAUDE_CONFIG_DIR: CONFIG_DIRECTORY,
    CLAUDE_CODE_DISABLE_CLAUDE_MDS: '1',
  };
}
