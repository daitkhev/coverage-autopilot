import { describe, expect, it } from 'vitest';

import { simpleCommandsOf } from '#harness/agents/shell-words';

describe('simpleCommandsOf', () => {
  it('should split a command into words at spaces and tabs', () => {
    expect(simpleCommandsOf('git  push\torigin dev ')).toEqual([
      ['git', 'push', 'origin', 'dev'],
    ]);
  });

  it('should give nothing for a text with no word', () => {
    expect(simpleCommandsOf('  ; \n ')).toEqual([]);
  });

  it.each([';', '&&', '||', '|', '&', '\n'])(
    'should start a new command after %j',
    (separator) => {
      expect(simpleCommandsOf(`cd a${separator}git push`)).toEqual([
        ['cd', 'a'],
        ['git', 'push'],
      ]);
    },
  );

  it('should read what stands in brackets and backticks as commands', () => {
    expect(simpleCommandsOf('echo $(git push) `gh pr merge`')).toEqual([
      ['echo', '$'],
      ['git', 'push'],
      ['gh', 'pr', 'merge'],
    ]);
  });

  it('should hold a quoted text together and leave the quotes out', () => {
    expect(simpleCommandsOf(`git commit -m "a -n; b" 'c && d'`)).toEqual([
      ['git', 'commit', '-m', 'a -n; b', 'c && d'],
    ]);
  });

  it('should keep an empty quoted text as a word', () => {
    expect(simpleCommandsOf(`git commit -m ''`)).toEqual([
      ['git', 'commit', '-m', ''],
    ]);
  });

  it('should join a quoted part to the word it touches', () => {
    expect(simpleCommandsOf(`git pu"sh" --for'ce'`)).toEqual([
      ['git', 'push', '--force'],
    ]);
  });

  it('should keep the other kind of quote inside a quoted text', () => {
    expect(simpleCommandsOf(`echo "it's" 'say "hi"'`)).toEqual([
      ['echo', "it's", 'say "hi"'],
    ]);
  });

  it('should take an escaped character as part of a word', () => {
    expect(simpleCommandsOf('echo a\\ b \\; "say \\"hi\\" -n"')).toEqual([
      ['echo', 'a b', ';', 'say "hi" -n'],
    ]);
  });

  it.each(["<<'EOF'", '<<EOF', '<<"EOF"', '<<-EOF', '<< EOF'])(
    'should leave out the lines of a here-document after %s',
    (mark) => {
      const text = `cat > a.md ${mark}\ngit push --force\n  EOF\ngit status`;

      const [first, ...rest] = simpleCommandsOf(text);

      expect(first?.slice(0, 2)).toEqual(['cat', '>']);
      expect(rest).toEqual([['git', 'status']]);
    },
  );

  it('should read on after one here-document to the next one', () => {
    const text = 'cat <<A\ngh pr merge\nA\ngit add .\ncat <<B\nA\nrm x\nB\nls';

    expect(simpleCommandsOf(text)).toEqual([
      ['cat', '<<A'],
      ['git', 'add', '.'],
      ['cat', '<<B'],
      ['ls'],
    ]);
  });

  it('should not take a here-string for a here-document', () => {
    expect(simpleCommandsOf('cat <<<word\ngit status')).toEqual([
      ['cat', '<<<word'],
      ['git', 'status'],
    ]);
  });

  it('should keep the escape as it is inside single quotes', () => {
    expect(simpleCommandsOf(`echo 'a\\' b`)).toEqual([['echo', 'a\\', 'b']]);
  });
});
