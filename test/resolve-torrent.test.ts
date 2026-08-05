import { describe, expect, it } from 'vitest';
import { resolveTorrent } from '../src/cli/output.js';
import type { ClientSnapshot, TorrentSnapshot } from '../src/shared/types.js';

function torrent(id: string, name: string, infoHash: string): TorrentSnapshot {
  return {
    id,
    infoHash,
    name,
    status: 'paused',
    path: '/tmp',
    length: 0,
    downloaded: 0,
    uploaded: 0,
    downloadSpeed: 0,
    uploadSpeed: 0,
    progress: 0,
    ratio: 0,
    eta: null,
    peers: 0,
    seeds: 0,
    addedAt: new Date(0).toISOString(),
    category: '',
    tags: [],
    sequential: false,
    files: [],
    peerDetails: [],
    trackers: [],
  };
}

const snapshot = {
  torrents: [
    torrent('aaaaaaaa-1111', 'Ubuntu ISO', '1111111111111111111111111111111111111111'),
    torrent('bbbbbbbb-2222', 'Ubuntu Manual', '2222222222222222222222222222222222222222'),
  ],
} as ClientSnapshot;

describe('torrent selectors', () => {
  it('resolves ID prefixes and exact info hashes', () => {
    expect(resolveTorrent(snapshot, 'aaaaaaaa').name).toBe('Ubuntu ISO');
    expect(resolveTorrent(snapshot, '2222222222222222222222222222222222222222').name).toBe(
      'Ubuntu Manual',
    );
  });

  it('rejects ambiguous and missing selectors', () => {
    expect(() => resolveTorrent(snapshot, 'ubuntu')).toThrow(/ambiguous/i);
    expect(() => resolveTorrent(snapshot, 'debian')).toThrow(/no torrent/i);
  });
});
