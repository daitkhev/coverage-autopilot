import { describe, expect, it } from 'vitest';

import { HELP_TEXT } from '#commands/command-grammar';

describe('HELP_TEXT', () => {
  it('should give the commands and the flags as the two tables of the document', () => {
    expect(HELP_TEXT).toMatchInlineSnapshot(`
      "Usage: coverage-autopilot [<command>] [<flags>]

      Without a command it opens the screens.

      Commands:
        repo add <url>                   Connects a repository
        repo list                        Lists repositories
        repo check <repo>                Runs the access check
        repo threshold <repo> <percent>  Sets the threshold of a repository
        scan <repo>                      Queues a scan
        files <repo>                     Lists files of the latest snapshot
        improve <repo> <file>            Requests an improvement
        list                             Lists improvements
        status <id>                      Shows one improvement
        patch <id>                       Shows the test patch
        approve <id> --hash <hash>       Approves publishing
        cancel <id>                      Cancels a scan or an improvement
        doctor                           Shows the state of the service

      A repository is named as owner/name.
      A threshold is a whole percent of lines, such as 90, or default to give
      a repository the threshold of the service back.

      Flags:
        --wait                                   Block until the work is final
        --isolated                               Use a private service for this one command
        --json                                   Print the result as JSON
        --no-color                               No colour. The NO_COLOR variable does the same
        --below <percent>, --metric <name>       For files: another threshold or counter
        --unmeasured                             For files: the files that could not be measured
        --review                                 For improve: wait for approval before publishing
        --attempts, --tokens, --minutes <count>  For improve: the budget
        --help                                   Print this help

      Exit codes:
        0  The command did what was asked. With --wait: completed or skipped
        1  The work failed or was cancelled, or the service could not be reached
        2  The command line was wrong"
    `);
  });
});
