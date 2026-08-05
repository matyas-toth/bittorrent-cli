import React from 'react';
import { Box, Text } from 'ink';
import type { TorrentSnapshot, TorrentStatus } from '../../shared/types.js';
import { colors } from '../theme.js';

export type Filter =
  'all' | 'active' | 'downloading' | 'seeding' | 'completed' | 'paused' | 'error';

const filterRows: { filter: Filter; label: string; statuses?: TorrentStatus[] }[] = [
  { filter: 'all', label: 'All' },
  { filter: 'active', label: 'Active', statuses: ['downloading', 'seeding'] },
  { filter: 'downloading', label: 'Downloading', statuses: ['downloading', 'stalled', 'metadata'] },
  { filter: 'seeding', label: 'Seeding', statuses: ['seeding'] },
  { filter: 'completed', label: 'Completed', statuses: ['completed'] },
  { filter: 'paused', label: 'Paused', statuses: ['paused'] },
  { filter: 'error', label: 'Errors', statuses: ['error'] },
];

export function matchesFilter(torrent: TorrentSnapshot, filter: Filter): boolean {
  if (filter === 'all') return true;
  const row = filterRows.find((item) => item.filter === filter);
  return row?.statuses?.includes(torrent.status) ?? false;
}

export function Sidebar({ torrents, selected }: { torrents: TorrentSnapshot[]; selected: Filter }) {
  return (
    <Box
      width={22}
      flexDirection="column"
      borderStyle="single"
      borderColor={colors.subtle}
      paddingX={1}
    >
      <Text bold color={colors.muted}>
        FILTERS
      </Text>
      <Box height={1} />
      {filterRows.map((row) => {
        const count = torrents.filter((torrent) => matchesFilter(torrent, row.filter)).length;
        const active = selected === row.filter;
        return (
          <Box key={row.filter} justifyContent="space-between">
            <Text bold={active} {...(active ? { color: colors.accent } : {})}>
              {active ? '› ' : '  '}
              {row.label}
            </Text>
            <Text color={colors.muted}>{count}</Text>
          </Box>
        );
      })}
      <Box height={1} />
      <Text bold color={colors.muted}>
        LABELS
      </Text>
      {[...new Set(torrents.map((torrent) => torrent.category).filter(Boolean))]
        .slice(0, 6)
        .map((category) => (
          <Text key={category} color={colors.muted}>
            · {category}
          </Text>
        ))}
    </Box>
  );
}
