import { Activity, memo, type ReactNode } from 'react';

import type { ClientSession } from '#api/client-session';
import { type Journey, keptOf, type Move, type Place } from '#app/navigation';
import type { ShellFrame } from '#components/app-shell';
import { FilesScreen } from '#screens/files/files-screen';
import { ImprovementScreen } from '#screens/improvement/improvement-screen';
import { ImprovementsScreen } from '#screens/improvements/improvements-screen';
import { PatchScreen } from '#screens/patch/patch-screen';
import { RepositoriesScreen } from '#screens/repositories/repositories-screen';
import { ServiceScreen } from '#screens/service/service-screen';

interface ScreenProps {
  readonly session: ClientSession;
  readonly frame: ShellFrame;
  readonly move: (move: Move) => void;
}

/** The moves a screen asks for, as the callbacks the screens take. */
function waysOf(move: (move: Move) => void): {
  readonly onBack: () => void;
  readonly onOpenFiles: (repositoryId: string) => void;
  readonly onOpenImprovement: (improvementId: string) => void;
  readonly onOpenPatch: (improvementId: string) => void;
} {
  const open = (place: Place): void => {
    move({ kind: 'open', place });
  };
  return {
    onBack: () => {
      move({ kind: 'back' });
    },
    onOpenFiles: (repositoryId) => {
      open({ screen: 'files', repositoryId });
    },
    onOpenImprovement: (improvementId) => {
      open({ screen: 'improvement', improvementId });
    },
    onOpenPatch: (improvementId) => {
      open({ screen: 'patch', improvementId });
    },
  };
}

interface KeptProps extends ScreenProps {
  readonly place: Place;
  readonly shown: boolean;
}

/** The screen of a place, with the moves that lead on from it. */
function ScreenAt({ place, session, frame, move }: KeptProps): ReactNode {
  const shared = { session, frame };
  const { onBack, onOpenFiles, onOpenImprovement, onOpenPatch } = waysOf(move);
  switch (place.screen) {
    case 'repositories':
      return <RepositoriesScreen {...shared} onOpenFiles={onOpenFiles} />;
    case 'improvements':
      return (
        <ImprovementsScreen {...shared} onOpenImprovement={onOpenImprovement} />
      );
    case 'service':
      return <ServiceScreen {...shared} />;
    case 'files':
      return (
        <FilesScreen
          {...shared}
          repositoryId={place.repositoryId}
          onOpenImprovement={onOpenImprovement}
          onBack={onBack}
        />
      );
    case 'improvement':
      return (
        <ImprovementScreen
          {...shared}
          improvementId={place.improvementId}
          onOpenPatch={onOpenPatch}
          onBack={onBack}
        />
      );
    case 'patch':
      return (
        <PatchScreen
          {...shared}
          improvementId={place.improvementId}
          onBack={onBack}
        />
      );
  }
}

/**
 * A screen is not drawn again while it stays hidden: the frame it is
 * handed changes with every drawing of the app, and it shows none of it.
 */
const KeptScreen = memo(ScreenAt, (was, now) => !was.shown && !now.shown);

/**
 * The screen that shows, and every other screen of the trails kept as it
 * was left, hidden: its row, its scroll, its panel, its filter and its
 * last answer. A hidden screen draws nothing, and its effects rest, so it
 * takes no key and asks the service nothing; when it shows again it asks
 * at once.
 */
export function ShownScreen({
  journey,
  ...shared
}: ScreenProps & { readonly journey: Journey }): ReactNode {
  return keptOf(journey).map(({ key, place, shown }) => (
    <Activity key={key} mode={shown ? 'visible' : 'hidden'}>
      <KeptScreen place={place} shown={shown} {...shared} />
    </Activity>
  ));
}
