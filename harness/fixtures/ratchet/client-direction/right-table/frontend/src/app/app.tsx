import { client } from '#api/client';
import { badge } from '#components/badge';
import { useKeys } from '#hooks/use-keys';
import { overview } from '#screens/overview/overview';
import { colors } from '#theme/colors';

export const app = [client, badge, useKeys, overview, colors];
