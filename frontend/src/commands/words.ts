import type { CoverageCounter } from '@coverage-autopilot/api-contracts/coverage';

import type { CommandIo } from '#commands/command-io';
import { percentWords } from '#theme/counts';
import type { ThemeSettings } from '#theme/settings';
import type { StatusLook } from '#theme/status';
import {
  type GlyphName,
  spinnerFrameOf,
  type SymbolName,
  symbolOf,
} from '#theme/symbols';

/** The name a person types, which the help and every hint repeat. */
export const PROGRAM = 'coverage-autopilot';

/** Why a job failed or was skipped: a stable code and a sentence. */
interface Reason {
  readonly reason: string;
  readonly message: string;
}

/**
 * A command prints no colour and draws no animation: its output is for
 * scripts and pipes. Only the set of symbols follows the terminal.
 */
function themeOf(io: CommandIo): ThemeSettings {
  return { colour: false, unicode: io.unicode, animation: false };
}

/** One symbol of the theme, in Unicode or in ASCII as the terminal shows. */
export function symbolText(name: SymbolName, io: CommandIo): string {
  return symbolOf(name, themeOf(io));
}

/** A symbol of a status, and the spinner as its first frame. */
function glyphText(name: GlyphName, io: CommandIo): string {
  return name === 'spinner'
    ? spinnerFrameOf(0, themeOf(io))
    : symbolText(name, io);
}

/** A status as the tables of the document say it: `✓ DONE`. */
export function statusText(look: StatusLook, io: CommandIo): string {
  return `${glyphText(look.glyph, io)} ${look.word}`;
}

/**
 * The percentage of a counter, or nothing when its total is zero: the
 * service sends no percentage then, and no code is not 0%.
 */
export function percentText(counter: CoverageCounter): string {
  return counter.percentage === null ? '' : percentWords(counter.percentage);
}

/** A sentence first, and its stable code beside it for searching. */
export function reasonText(reason: Reason): string {
  return `${reason.message} (${reason.reason})`;
}
