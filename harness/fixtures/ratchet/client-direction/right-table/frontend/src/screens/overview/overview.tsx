import { client } from '#api/client';
import { badge } from '#components/badge';
import { useKeys } from '#hooks/use-keys';
import { row } from '#screens/overview/row';
import { colors } from '#theme/colors';

export const overview = [client, badge, useKeys, row, colors];
