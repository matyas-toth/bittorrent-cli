import type { ClientSnapshot, TorrentSnapshot } from '../shared/types.js';
import { formatBytes, formatEta, formatPercent, formatSpeed } from '../ui/format.js';

export function printTorrentList(snapshot: ClientSnapshot, json: boolean): void {
  if (json) {
    process.stdout.write(`${JSON.stringify(snapshot.torrents, null, 2)}\n`);
    return;
  }
  if (snapshot.torrents.length === 0) {
    process.stdout.write('No torrents. Add one with: bittorrent-cli add <torrent>\n');
    return;
  }
  const nameWidth = Math.min(
    42,
    Math.max(16, ...snapshot.torrents.map((torrent) => torrent.name.length)),
  );
  process.stdout.write(
    `${'ID'.padEnd(9)} ${'NAME'.padEnd(nameWidth)} ${'STATE'.padEnd(12)} ${'PROGRESS'.padStart(9)} ${'DOWN'.padStart(12)} ${'UP'.padStart(12)} ${'ETA'.padStart(8)}\n`,
  );
  for (const torrent of snapshot.torrents) {
    process.stdout.write(
      `${torrent.id.slice(0, 8).padEnd(9)} ${truncate(torrent.name, nameWidth).padEnd(nameWidth)} ${torrent.status.padEnd(12)} ${formatPercent(torrent.progress).padStart(9)} ${formatSpeed(torrent.downloadSpeed).padStart(12)} ${formatSpeed(torrent.uploadSpeed).padStart(12)} ${formatEta(torrent.eta).padStart(8)}\n`,
    );
  }
}

export function printTorrentInfo(torrent: TorrentSnapshot, json: boolean): void {
  if (json) {
    process.stdout.write(`${JSON.stringify(torrent, null, 2)}\n`);
    return;
  }
  const rows: [string, string][] = [
    ['Name', torrent.name],
    ['ID', torrent.id],
    ['Info hash', torrent.infoHash || 'fetching metadata'],
    ['Status', torrent.status],
    [
      'Progress',
      `${formatPercent(torrent.progress)} (${formatBytes(torrent.downloaded)} / ${formatBytes(torrent.length)})`,
    ],
    ['Transfer', `↓ ${formatSpeed(torrent.downloadSpeed)}  ↑ ${formatSpeed(torrent.uploadSpeed)}`],
    ['Swarm', `${torrent.seeds} seeds, ${torrent.peers} peers`],
    ['Ratio', torrent.ratio.toFixed(3)],
    ['ETA', formatEta(torrent.eta)],
    ['Location', torrent.path],
    ['Mode', torrent.sequential ? 'sequential' : 'rarest-first'],
    ['Files', String(torrent.files.length)],
    ['Trackers', String(torrent.trackers.length)],
  ];
  for (const [label, value] of rows) process.stdout.write(`${label.padEnd(12)} ${value}\n`);
}

export function resolveTorrent(snapshot: ClientSnapshot, selector: string): TorrentSnapshot {
  const normalized = selector.toLowerCase();
  const exact = snapshot.torrents.find(
    (torrent) => torrent.id === selector || torrent.infoHash.toLowerCase() === normalized,
  );
  if (exact) return exact;
  const matches = snapshot.torrents.filter(
    (torrent) =>
      torrent.id.startsWith(selector) ||
      torrent.infoHash.toLowerCase().startsWith(normalized) ||
      torrent.name.toLowerCase().includes(normalized),
  );
  if (matches.length === 0) throw new Error(`No torrent matches “${selector}”.`);
  if (matches.length > 1)
    throw new Error(`“${selector}” is ambiguous; use a longer ID or info hash.`);
  const match = matches[0];
  if (!match) throw new Error(`No torrent matches “${selector}”.`);
  return match;
}

function truncate(value: string, width: number): string {
  return value.length <= width ? value : `${value.slice(0, width - 1)}…`;
}
