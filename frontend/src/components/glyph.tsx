import type { ReactNode } from 'react';

import { RoleText } from '#components/role-text';
import { useSpinner } from '#hooks/use-spinner';
import { useTheme } from '#hooks/use-theme';
import type { Role } from '#theme/roles';
import { type GlyphName, type SymbolName, symbolOf } from '#theme/symbols';

interface GlyphProps {
  readonly name: GlyphName;
  readonly role?: Role;
}

function Spinner({ role }: { readonly role: Role }): ReactNode {
  return <RoleText role={role}>{useSpinner()}</RoleText>;
}

function SymbolGlyph({
  name,
  role,
}: {
  readonly name: SymbolName;
  readonly role: Role;
}): ReactNode {
  return <RoleText role={role}>{symbolOf(name, useTheme())}</RoleText>;
}

/** One symbol of the theme, or the spinner, in the style of a role. */
export function Glyph({ name, role = 'primary' }: GlyphProps): ReactNode {
  return name === 'spinner' ? (
    <Spinner role={role} />
  ) : (
    <SymbolGlyph name={name} role={role} />
  );
}
