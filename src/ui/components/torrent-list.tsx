import React from 'react';
import { Box, Text } from 'ink';
import type { TorrentSnapshot } from '../../shared/types.js';
import { formatEta, formatPercent, formatSpeed, truncateMiddle } from '../format.js';
import { colors } from '../theme.js';

function statusGlyph(torrent: TorrentSnapshot): { glyph: string; color: string } {
  switch (torrent.status) {
    case 'downloading':
      return { glyph: '↓', color: colors.downloading };
    case 'seeding':
      return { glyph: '↑', color: colors.seeding };
    case 'paused':
      return { glyph: 'Ⅱ', color: colors.paused };
    case 'error':
      return { glyph: '!', color: colors.error };
    case 'completed':
      return { glyph: '✓', color: colors.complete };
    case 'metadata':
    case 'checking':
      return { glyph: '◌', color: colors.accent };
    case 'stalled':
      return { glyph: '·', color: colors.muted };
  }
}

export function TorrentList({
  torrents,
  selectedIndex,
  width,
  height,
}: {
  torrents: TorrentSnapshot[];
  selectedIndex: number;
  width: number;
  height: number;
}) {
  const nameWidth = Math.max(16, width - 57);
  const start = Math.max(
    0,
    Math.min(selectedIndex - Math.floor(height / 2), torrents.length - height),
  );
  const visible = torrents.slice(start, start + Math.max(1, height));
  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box paddingX={1}>
        <Text bold color={colors.muted}>
          {'  NAME'.padEnd(nameWidth + 3)} {'PROGRESS'.padEnd(10)} {'DOWN'.padStart(11)}{' '}
          {'UP'.padStart(11)} {'PEERS'.padStart(5)} {'ETA'.padStart(8)}
        </Text>
      </Box>
      {visible.length === 0 ? (
        <Box padding={2} flexDirection="column" alignItems="center">
          <Text color={colors.muted}>No torrents here.</Text>
          <Text color={colors.subtle}>Press a to add a .torrent file or magnet link.</Text>
        </Box>
      ) : (
        visible.map((torrent, offset) => {
          const index = start + offset;
          const active = index === selectedIndex;
          const status = statusGlyph(torrent);
          return (
            <Box
              key={torrent.id}
              paddingX={1}
              backgroundColor={active ? colors.surface : undefined}
            >
              <Text color={status.color}>{status.glyph} </Text>
              <Text bold={active}>{truncateMiddle(torrent.name, nameWidth)}</Text>
              <Text color={torrent.progress >= 1 ? colors.complete : colors.accent}>
                {formatPercent(torrent.progress).padStart(9)}{' '}
              </Text>
              <Text color={colors.downloading}>
                {formatSpeed(torrent.downloadSpeed).padStart(11)}{' '}
              </Text>
              <Text color={colors.seeding}>{formatSpeed(torrent.uploadSpeed).padStart(11)} </Text>
              <Text>{String(torrent.peers).padStart(5)} </Text>
              <Text color={colors.muted}>{formatEta(torrent.eta).padStart(8)}</Text>
            </Box>
          );
        })
      )}
    </Box>
  );
}
