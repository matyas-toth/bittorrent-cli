import React from 'react';
import { Badge } from '@inkjs/ui';
import type { TorrentStatus } from '../../shared/types.js';

const colors: Record<TorrentStatus, string> = {
  metadata: 'yellow',
  checking: 'cyan',
  downloading: 'green',
  stalled: 'yellow',
  paused: 'orange',
  seeding: 'blue',
  completed: 'magenta',
  error: 'red',
};

export function StatusBadge({ status }: { status: TorrentStatus }) {
  return <Badge color={colors[status]}>{status.toUpperCase()}</Badge>;
}
