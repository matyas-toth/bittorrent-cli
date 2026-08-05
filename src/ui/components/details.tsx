import React from 'react';
import { Box, Text } from 'ink';
import { ProgressBar } from '@inkjs/ui';
import type { TorrentSnapshot } from '../../shared/types.js';
import { formatBytes, formatPercent, formatSpeed, truncateMiddle } from '../format.js';
import { colors } from '../theme.js';
import { StatusBadge } from './status-badge.js';

export type DetailTab = 'overview' | 'files' | 'peers' | 'trackers';

const tabs: { key: DetailTab; label: string }[] = [
  { key: 'overview', label: '1 Overview' },
  { key: 'files', label: '2 Files' },
  { key: 'peers', label: '3 Peers' },
  { key: 'trackers', label: '4 Trackers' },
];

export function Details({
  torrent,
  tab,
  width,
}: {
  torrent?: TorrentSnapshot | undefined;
  tab: DetailTab;
  width: number;
}) {
  return (
    <Box
      height={9}
      borderStyle="single"
      borderColor={colors.subtle}
      flexDirection="column"
      paddingX={1}
    >
      <Box gap={2}>
        {tabs.map((item) => (
          <Text
            key={item.key}
            bold={tab === item.key}
            color={tab === item.key ? colors.accent : colors.muted}
          >
            {item.label}
          </Text>
        ))}
      </Box>
      {!torrent ? (
        <Text color={colors.muted}>Select a torrent to inspect it.</Text>
      ) : (
        <DetailBody torrent={torrent} tab={tab} width={width} />
      )}
    </Box>
  );
}

function DetailBody({
  torrent,
  tab,
  width,
}: {
  torrent: TorrentSnapshot;
  tab: DetailTab;
  width: number;
}) {
  if (tab === 'files') {
    return (
      <Box flexDirection="column">
        {torrent.files.slice(0, 5).map((file) => (
          <Box key={file.index}>
            <Text color={file.selected ? colors.downloading : colors.muted}>
              {file.selected ? '✓' : '–'}{' '}
            </Text>
            <Text>{truncateMiddle(file.path, Math.max(20, width - 32))}</Text>
            <Text color={colors.muted}>
              {' '}
              {formatPercent(file.progress).padStart(7)} {formatBytes(file.length).padStart(9)}
            </Text>
          </Box>
        ))}
        {torrent.files.length > 5 && (
          <Text color={colors.subtle}>
            … {torrent.files.length - 5} more · press f to select files
          </Text>
        )}
      </Box>
    );
  }
  if (tab === 'peers') {
    return (
      <Box flexDirection="column">
        {torrent.peerDetails.slice(0, 5).map((peer) => (
          <Text key={peer.address}>
            {truncateMiddle(peer.address, 24)} {truncateMiddle(peer.client, 18)}{' '}
            <Text color={colors.downloading}>↓ {formatSpeed(peer.downloadSpeed).padStart(10)}</Text>{' '}
            <Text color={colors.seeding}>↑ {formatSpeed(peer.uploadSpeed).padStart(10)}</Text>
          </Text>
        ))}
        {torrent.peerDetails.length === 0 && (
          <Text color={colors.muted}>No connected peers yet.</Text>
        )}
      </Box>
    );
  }
  if (tab === 'trackers') {
    return (
      <Box flexDirection="column">
        {torrent.trackers.slice(0, 5).map((tracker) => (
          <Text key={tracker.url} color={colors.muted}>
            · {truncateMiddle(tracker.url, Math.max(24, width - 8))}
          </Text>
        ))}
        {torrent.trackers.length === 0 && (
          <Text color={colors.muted}>Trackerless torrent · peer discovery uses DHT/PEX.</Text>
        )}
      </Box>
    );
  }
  return (
    <Box flexDirection="column">
      <Box gap={2}>
        <StatusBadge status={torrent.status} />
        <Text>
          {formatBytes(torrent.downloaded)} / {formatBytes(torrent.length)}
        </Text>
        <Text color={colors.muted}>ratio {torrent.ratio.toFixed(2)}</Text>
        <Text color={colors.muted}>
          {torrent.seeds} seeds · {torrent.peers} peers
        </Text>
      </Box>
      <Box width={Math.max(10, Math.min(72, width - 6))}>
        <ProgressBar value={torrent.progress * 100} />
      </Box>
      <Text color={colors.muted}>{truncateMiddle(torrent.path, Math.max(20, width - 4))}</Text>
      <Text color={colors.subtle}>hash {torrent.infoHash || 'fetching metadata…'}</Text>
    </Box>
  );
}
