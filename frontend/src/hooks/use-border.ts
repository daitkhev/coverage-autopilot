import { useBackdrop } from '#hooks/use-backdrop';
import { useTheme } from '#hooks/use-theme';
import { type BorderColour, borderColourOf, type Role } from '#theme/roles';

/** The colour of a border of a role. Behind a dialog it is drawn dim. */
export function useBorder(role: Role): BorderColour {
  const border = borderColourOf(role, useTheme());
  const behind = useBackdrop();
  return { ...border, borderDimColor: border.borderDimColor || behind };
}
