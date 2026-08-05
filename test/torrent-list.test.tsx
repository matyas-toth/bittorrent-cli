import React from 'react';
import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';
import { TorrentList } from '../src/ui/components/torrent-list.js';
import type { TorrentSnapshot } from '../src/shared/types.js';

const torrent: TorrentSnapshot = {
  id: 'test-id',
  infoHash: 'a'.repeat(40),
  name: 'Public domain sample',
  status: 'downloading',
  path: '/tmp/sample',
  length: 1024,
  downloaded: 512,
  uploaded: 128,
  downloadSpeed: 1024,
  uploadSpeed: 256,
  progress: 0.5,
  ratio: 0.25,
  eta: 30_000,
  peers: 4,
  seeds: 2,
  addedAt: new Date(0).toISOString(),
  category: 'test',
  tags: [],
  sequential: false,
  files: [],
  peerDetails: [],
  trackers: [],
};

describe('TorrentList', () => {
  it('renders transfer telemetry and the empty state', () => {
    const populated = render(
      <TorrentList torrents={[torrent]} selectedIndex={0} width={100} height={5} />,
    );
    expect(populated.lastFrame()).toContain('Public domain sample');
    expect(populated.lastFrame()).toContain('50.0%');
    expect(populated.lastFrame()).toContain('1.0 KiB/s');

    const empty = render(<TorrentList torrents={[]} selectedIndex={0} width={80} height={5} />);
    expect(empty.lastFrame()).toContain('No torrents here.');
  });
});
