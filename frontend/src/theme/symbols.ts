import type { ThemeSettings } from '#theme/settings';

/** What a symbol means. A part names the meaning and never the glyph. */
export type SymbolName =
  | 'passed'
  | 'failed'
  | 'attention'
  | 'waiting'
  | 'notStarted'
  | 'on'
  | 'cancelled'
  | 'skipped'
  | 'selected'
  | 'result'
  | 'barFilled'
  | 'barEmpty'
  | 'threshold'
  | 'change'
  | 'separator'
  | 'cursor'
  | 'up'
  | 'down'
  | 'added';

/** A symbol and its ASCII replacement, each one terminal cell wide. */
export interface Glyphs {
  readonly unicode: string;
  readonly ascii: string;
}

export const SYMBOLS: Readonly<Record<SymbolName, Glyphs>> = {
  passed: { unicode: '✓', ascii: '+' },
  failed: { unicode: '✕', ascii: 'x' },
  attention: { unicode: '!', ascii: '!' },
  waiting: { unicode: '?', ascii: '?' },
  notStarted: { unicode: '○', ascii: 'o' },
  on: { unicode: '●', ascii: '*' },
  cancelled: { unicode: '■', ascii: '#' },
  skipped: { unicode: '–', ascii: '-' },
  selected: { unicode: '›', ascii: '>' },
  result: { unicode: '└', ascii: '\\' },
  barFilled: { unicode: '━', ascii: '=' },
  barEmpty: { unicode: '─', ascii: '-' },
  threshold: { unicode: '┼', ascii: '|' },
  change: { unicode: '→', ascii: '>' },
  separator: { unicode: '·', ascii: '.' },
  cursor: { unicode: '█', ascii: '_' },
  up: { unicode: '↑', ascii: '^' },
  down: { unicode: '↓', ascii: 'v' },
  added: { unicode: '+', ascii: '+' },
};

/** A symbol of the table, or the spinner, which moves. */
export type GlyphName = SymbolName | 'spinner';

/** Ten frames on one shared timer. Without Unicode it is a still star. */
export const SPINNER_FRAMES: Readonly<Record<keyof Glyphs, readonly string[]>> =
  {
    unicode: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
    ascii: ['*'],
  };

export const SPINNER_INTERVAL_MS = 80;

/** The glyphs that draw a frame: one of Ink's border styles, and its top. */
export interface FrameGlyphs {
  readonly box: 'round' | 'classic';
  readonly rule: 'single' | 'classic';
  readonly topLeft: string;
  readonly topRight: string;
  readonly line: string;
}

export const FRAMES: Readonly<Record<keyof Glyphs, FrameGlyphs>> = {
  unicode: {
    box: 'round',
    rule: 'single',
    topLeft: '╭',
    topRight: '╮',
    line: '─',
  },
  ascii: {
    box: 'classic',
    rule: 'classic',
    topLeft: '+',
    topRight: '+',
    line: '-',
  },
};

function charsetOf(settings: ThemeSettings): keyof Glyphs {
  return settings.unicode ? 'unicode' : 'ascii';
}

export function symbolOf(name: SymbolName, settings: ThemeSettings): string {
  return SYMBOLS[name][charsetOf(settings)];
}

/** With animation turned off the spinner is its first frame. */
export function spinnerFrameOf(frame: number, settings: ThemeSettings): string {
  const frames = SPINNER_FRAMES[charsetOf(settings)];
  const index = settings.animation ? frame % frames.length : 0;
  return frames[index] ?? '';
}

export function frameOf(settings: ThemeSettings): FrameGlyphs {
  return FRAMES[charsetOf(settings)];
}

/** Keys that are drawn as symbols. Any other key is drawn as it is named. */
const KEY_SYMBOLS = new Map<string, readonly SymbolName[]>([
  ['up-down', ['up', 'down']],
  ['right', ['change']],
]);

export function keyTextOf(key: string, settings: ThemeSettings): string {
  const symbols = KEY_SYMBOLS.get(key);
  return symbols === undefined
    ? key
    : symbols.map((name) => symbolOf(name, settings)).join('');
}
