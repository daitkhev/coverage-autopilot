import type { ThemeSettings } from '#theme/settings';

/** What a piece of text means. A part names a role and never a colour. */
export type Role =
  | 'primary'
  | 'secondary'
  | 'emphasis'
  | 'accent'
  | 'success'
  | 'warning'
  | 'danger'
  | 'running'
  | 'border'
  | 'link';

/** The sixteen colours of the terminal, so the user's theme picks the shade. */
type TerminalColour = 'magenta' | 'green' | 'yellow' | 'red' | 'cyan' | 'gray';

interface RoleLook {
  readonly colour?: TerminalColour;
  readonly bold?: boolean;
  readonly dim?: boolean;
  readonly underline?: boolean;
}

const ROLE_LOOKS: Readonly<Record<Role, RoleLook>> = {
  primary: {},
  secondary: { dim: true },
  emphasis: { bold: true },
  accent: { colour: 'magenta' },
  success: { colour: 'green' },
  warning: { colour: 'yellow' },
  danger: { colour: 'red' },
  running: { colour: 'cyan' },
  border: { colour: 'gray' },
  link: { underline: true },
};

/** How the terminal draws a text of a role. */
export interface TextStyle {
  readonly color?: TerminalColour;
  readonly bold: boolean;
  readonly dimColor: boolean;
  readonly underline: boolean;
}

/**
 * Without colour a role keeps its bold, dim and underline, so the text
 * still reads the same.
 */
export function textStyleOf(role: Role, settings: ThemeSettings): TextStyle {
  const look = ROLE_LOOKS[role];
  const style = {
    bold: look.bold === true,
    dimColor: look.dim === true,
    underline: look.underline === true,
  };
  return settings.colour && look.colour !== undefined
    ? { ...style, color: look.colour }
    : style;
}

/** How the terminal draws a border of a role. */
export interface BorderColour {
  readonly borderColor?: TerminalColour;
  readonly borderDimColor: boolean;
}

export function borderColourOf(
  role: Role,
  settings: ThemeSettings,
): BorderColour {
  const { color, dimColor } = textStyleOf(role, settings);
  return color === undefined
    ? { borderDimColor: dimColor }
    : { borderColor: color, borderDimColor: dimColor };
}
