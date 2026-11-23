/**
 * What the terminal can show. The client learns it once, at the start, from
 * `NO_COLOR`, `--no-color` and the terminal, and every part draws by it.
 */
export interface ThemeSettings {
  readonly colour: boolean;
  readonly unicode: boolean;
  readonly animation: boolean;
}

/** A terminal that shows colour, Unicode and a moving spinner. */
export const FULL_THEME: ThemeSettings = {
  colour: true,
  unicode: true,
  animation: true,
};
