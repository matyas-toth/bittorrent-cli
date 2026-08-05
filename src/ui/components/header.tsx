import React from 'react';
import { Box, Text } from 'ink';
import type { ClientSnapshot } from '../../shared/types.js';
import { formatSpeed } from '../format.js';
import { colors } from '../theme.js';

export function Header({ snapshot, width }: { snapshot: ClientSnapshot; width: number }) {
  const compact = width < 84;
  return (
    <Box paddingX={1} justifyContent="space-between">
      <Box gap={1}>
        <Text bold color={colors.accentStrong}>
          ◈ bittorrent-cli
        </Text>
        {!compact && <Text color={colors.muted}>swarm control</Text>}
      </Box>
      <Box gap={compact ? 1 : 2}>
        <Text color={colors.downloading}>↓ {formatSpeed(snapshot.global.downloadSpeed)}</Text>
        <Text color={colors.seeding}>↑ {formatSpeed(snapshot.global.uploadSpeed)}</Text>
        {!compact && <Text color={colors.muted}>{snapshot.global.peers} peers</Text>}
      </Box>
    </Box>
  );
}
