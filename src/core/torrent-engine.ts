import { randomUUID } from 'node:crypto';
import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import WebTorrent from 'webtorrent';
import type {
  AddTorrentRequest,
  AlertSnapshot,
  ClientSettings,
  ClientSnapshot,
  FileSnapshot,
  PeerSnapshot,
  PersistedTorrent,
  SeedRequest,
  SessionData,
  TorrentAction,
  TorrentSnapshot,
  TorrentStatus,
  TrackerSnapshot,
} from '../shared/types.js';
import { UserError, errorMessage } from '../shared/errors.js';
import { loadSession, saveSession } from './session-store.js';
import { loadSettings, saveSettings } from './settings-store.js';
import { log, logError } from './logger.js';
import { clientSettingsSchema } from '../shared/schemas.js';
import { VERSION } from '../shared/constants.js';
import { ensureDownloadDirectory } from './download-directory.js';

const MAX_ALERTS = 100;

interface ExtendedWire {
  remoteAddress?: string;
  remotePort?: number;
  peerId?: string;
  downloadSpeed?: () => number;
  uploadSpeed?: () => number;
  peerInterested?: boolean;
  peerChoking?: boolean;
  peerPieces?: { get?: (index: number) => boolean };
}

interface ExtendedTorrent extends WebTorrent.Torrent {
  wires?: ExtendedWire[];
  strategy?: 'sequential' | 'rarest';
  rescanFiles?: (callback?: (error?: Error) => void) => void;
}

interface RuntimeTorrent {
  record: PersistedTorrent;
  torrent: ExtendedTorrent;
  selectedFiles: Set<number>;
  error?: string;
  lastActivityAt: number;
}

export class TorrentEngine {
  readonly startedAt = new Date().toISOString();
  private client!: WebTorrent.Instance;
  private settings!: ClientSettings;
  private readonly runtimes = new Map<string, RuntimeTorrent>();
  private readonly alerts: AlertSnapshot[] = [];
  private policyTimer?: NodeJS.Timeout;
  private closing = false;
  private persistQueue: Promise<void> = Promise.resolve();

  async start(): Promise<void> {
    this.settings = await loadSettings();
    this.client = new WebTorrent({
      maxConns: this.settings.maxConnections,
      tracker: true,
      dht: this.settings.dht,
      lsd: this.settings.lsd,
      utPex: this.settings.pex,
      natUpnp: this.settings.upnp,
      natPmp: this.settings.natPmp,
      utp: this.settings.utp,
      downloadLimit: this.settings.downloadLimit,
      uploadLimit: this.settings.uploadLimit,
    } as WebTorrent.Options);
    this.client.on('error', (error) => {
      this.addAlert('error', `Engine error: ${errorMessage(error)}`);
      logError('WebTorrent client', error);
    });

    const session = await loadSession();
    for (const record of session.torrents) {
      try {
        await this.restore(record);
      } catch (error) {
        this.addAlert('error', `Could not restore torrent: ${errorMessage(error)}`);
        logError(`Restore ${record.id}`, error);
      }
    }

    this.policyTimer = setInterval(() => this.enforceSeedPolicies(), 15_000);
    this.policyTimer.unref();
    await log('INFO', `Daemon started with ${this.runtimes.size} restored torrents`);
  }

  snapshot(): ClientSnapshot {
    const torrents = [...this.runtimes.values()].map((runtime) => this.snapshotTorrent(runtime));
    return {
      daemon: { pid: process.pid, startedAt: this.startedAt, version: VERSION },
      global: {
        downloadSpeed: this.client.downloadSpeed,
        uploadSpeed: this.client.uploadSpeed,
        downloaded: torrents.reduce((sum, item) => sum + item.downloaded, 0),
        uploaded: torrents.reduce((sum, item) => sum + item.uploaded, 0),
        progress: this.client.progress || 0,
        ratio: this.client.ratio || 0,
        peers: torrents.reduce((sum, item) => sum + item.peers, 0),
      },
      settings: this.settings,
      torrents,
      alerts: this.alerts.slice(-MAX_ALERTS),
    };
  }

  async add(request: AddTorrentRequest): Promise<TorrentSnapshot> {
    const source = request.source.trim();
    if (!source) throw new UserError('A torrent file, URL, info hash, or magnet URI is required.');
    if (!isRemoteTorrentId(source)) await access(path.resolve(source));

    const duplicate = [...this.runtimes.values()].find(
      ({ record, torrent }) =>
        record.source === source || torrent.infoHash === source.toLowerCase(),
    );
    if (duplicate) throw new UserError(`Torrent is already present: ${duplicate.torrent.name}`);

    const destination = await ensureDownloadDirectory(request.path ?? this.settings.downloadPath);

    const record: PersistedTorrent = {
      id: randomUUID(),
      kind: 'download',
      source,
      path: destination,
      paused: request.paused ?? !this.settings.autoStart,
      sequential: request.sequential ?? false,
      category: request.category ?? '',
      tags: request.tags ?? [],
      addedAt: new Date().toISOString(),
    };

    const runtime = this.createRuntime(record);
    await this.persist();
    this.addAlert('success', `Added ${displaySource(source)}`);
    return this.snapshotTorrent(runtime);
  }

  async seed(request: SeedRequest): Promise<TorrentSnapshot> {
    const sourcePath = path.resolve(request.sourcePath);
    await access(sourcePath);
    const record: PersistedTorrent = {
      id: randomUUID(),
      kind: 'seed',
      source: sourcePath,
      path: path.dirname(sourcePath),
      paused: false,
      sequential: false,
      category: '',
      tags: ['created'],
      addedAt: new Date().toISOString(),
    };
    const torrent = this.client.seed(sourcePath, {
      path: record.path,
      announce: request.announce,
      comment: request.comment,
      private: request.private,
    } as WebTorrent.TorrentOptions) as ExtendedTorrent;
    const runtime = this.registerRuntime(record, torrent);
    if (request.outputPath) {
      await waitUntilReady(torrent);
      await mkdir(path.dirname(request.outputPath), { recursive: true });
      await writeFile(request.outputPath, torrent.torrentFile);
    }
    await this.persist();
    this.addAlert('success', `Creating and seeding ${path.basename(sourcePath)}`);
    return this.snapshotTorrent(runtime);
  }

  async action(id: string, action: TorrentAction): Promise<TorrentSnapshot> {
    const runtime = this.requireRuntime(id);
    switch (action) {
      case 'pause':
        runtime.torrent.pause();
        runtime.record.paused = true;
        break;
      case 'resume':
        runtime.torrent.resume();
        runtime.record.paused = false;
        break;
      case 'recheck':
        if (!runtime.torrent.rescanFiles) throw new UserError('File recheck is unavailable.');
        runtime.torrent.rescanFiles((error) => {
          if (error) this.addAlert('error', `Recheck failed: ${error.message}`);
          else this.addAlert('success', `Recheck finished: ${runtime.torrent.name}`);
        });
        this.addAlert('info', `Rechecking ${runtime.torrent.name}`);
        break;
      case 'sequential':
        this.setPieceStrategy(runtime, true);
        break;
      case 'rarest':
        this.setPieceStrategy(runtime, false);
        break;
    }
    await this.persist();
    return this.snapshotTorrent(runtime);
  }

  async remove(id: string, deleteData: boolean): Promise<void> {
    const runtime = this.requireRuntime(id);
    const name = runtime.torrent.name || runtime.record.source;
    if (this.client.torrents.includes(runtime.torrent)) {
      const torrentId = runtime.torrent.infoHash || runtime.torrent;
      try {
        await this.client.remove(torrentId, { destroyStore: deleteData });
      } catch (error) {
        // A fatal torrent error can remove it from WebTorrent while this request is in flight.
        // In that case the application/session cleanup below is still the correct outcome.
        if (this.client.torrents.includes(runtime.torrent)) throw error;
      }
    }
    this.runtimes.delete(id);
    await this.persist();
    this.addAlert('info', `${deleteData ? 'Deleted' : 'Removed'} ${name}`);
  }

  async selectFiles(id: string, indices: number[]): Promise<TorrentSnapshot> {
    const runtime = this.requireRuntime(id);
    const selected = new Set(indices);
    runtime.torrent.files.forEach((file, index) => {
      if (selected.has(index)) file.select();
      else file.deselect();
    });
    runtime.selectedFiles = selected;
    runtime.record.selectedFiles = [...selected].sort((left, right) => left - right);
    await this.persist();
    return this.snapshotTorrent(runtime);
  }

  async updateMetadata(
    id: string,
    update: { category?: string; tags?: string[] },
  ): Promise<TorrentSnapshot> {
    const runtime = this.requireRuntime(id);
    if (update.category !== undefined) runtime.record.category = update.category.trim();
    if (update.tags !== undefined) runtime.record.tags = uniqueTags(update.tags);
    await this.persist();
    return this.snapshotTorrent(runtime);
  }

  async updateSettings(update: Partial<ClientSettings>): Promise<ClientSettings> {
    this.settings = clientSettingsSchema.parse({ ...this.settings, ...update });
    await saveSettings(this.settings);
    this.client.throttleDownload(this.settings.downloadLimit);
    this.client.throttleUpload(this.settings.uploadLimit);
    this.addAlert('success', 'Settings saved');
    return this.settings;
  }

  dismissAlert(id: string): void {
    const index = this.alerts.findIndex((alert) => alert.id === id);
    if (index >= 0) this.alerts.splice(index, 1);
  }

  async close(): Promise<void> {
    if (this.closing) return;
    this.closing = true;
    if (this.policyTimer) clearInterval(this.policyTimer);
    await this.persist();
    await new Promise<void>((resolve) => this.client.destroy(() => resolve()));
    await log('INFO', 'Daemon stopped cleanly');
  }

  private createRuntime(record: PersistedTorrent): RuntimeTorrent {
    const options = {
      path: record.path,
      paused: record.paused,
      strategy: record.sequential ? 'sequential' : 'rarest',
    } as WebTorrent.TorrentOptions;
    const torrent = (
      record.torrentFileBase64
        ? this.client.add(Buffer.from(record.torrentFileBase64, 'base64'), options)
        : record.kind === 'seed'
          ? this.client.seed(record.source, options)
          : this.client.add(record.magnetUri ?? record.source, options)
    ) as ExtendedTorrent;
    return this.registerRuntime(record, torrent);
  }

  private registerRuntime(record: PersistedTorrent, torrent: ExtendedTorrent): RuntimeTorrent {
    const runtime: RuntimeTorrent = {
      record,
      torrent,
      selectedFiles: new Set(record.selectedFiles ?? []),
      lastActivityAt: Date.now(),
    };
    this.runtimes.set(record.id, runtime);
    torrent.on('download', () => (runtime.lastActivityAt = Date.now()));
    torrent.on('upload', () => (runtime.lastActivityAt = Date.now()));
    torrent.on('warning', (error) => {
      this.addAlert(
        'warning',
        `${torrent.name || displaySource(record.source)}: ${errorMessage(error)}`,
      );
      void log('WARN', `Torrent warning ${record.id}: ${errorMessage(error)}`);
    });
    torrent.on('error', (error) => {
      runtime.error = errorMessage(error);
      this.addAlert('error', `${torrent.name || displaySource(record.source)}: ${runtime.error}`);
      logError(`Torrent ${record.id}`, error);
    });
    torrent.on('ready', () => {
      record.magnetUri = torrent.magnetURI;
      record.torrentFileBase64 = Buffer.from(torrent.torrentFile).toString('base64');
      if (record.selectedFiles !== undefined) this.applyFileSelection(runtime);
      else runtime.selectedFiles = new Set(torrent.files.map((_, index) => index));
      if (record.paused) torrent.pause();
      if (!this.closing)
        void this.persist().catch((error: unknown) => logError('Persist ready torrent', error));
    });
    torrent.on('done', () => {
      record.completedAt = new Date().toISOString();
      this.addAlert('success', `Download complete: ${torrent.name}`);
      if (!this.closing)
        void this.persist().catch((error: unknown) => logError('Persist completed torrent', error));
    });
    return runtime;
  }

  private async restore(record: PersistedTorrent): Promise<void> {
    this.createRuntime(record);
  }

  private applyFileSelection(runtime: RuntimeTorrent): void {
    runtime.torrent.files.forEach((file, index) => {
      if (runtime.selectedFiles.has(index)) file.select();
      else file.deselect();
    });
  }

  private setPieceStrategy(runtime: RuntimeTorrent, sequential: boolean): void {
    const torrent = runtime.torrent;
    torrent.strategy = sequential ? 'sequential' : 'rarest';
    runtime.record.sequential = sequential;
    this.addAlert('info', `${torrent.name}: ${sequential ? 'sequential' : 'rarest-first'} mode`);
  }

  private snapshotTorrent(runtime: RuntimeTorrent): TorrentSnapshot {
    const { torrent, record } = runtime;
    const files: FileSnapshot[] = torrent.files.map((file, index) => ({
      index,
      name: file.name,
      path: file.path,
      length: file.length,
      downloaded: file.downloaded,
      progress: finite(file.progress),
      selected: record.selectedFiles === undefined || runtime.selectedFiles.has(index),
      priority: runtime.selectedFiles.has(index) ? 1 : 0,
    }));
    const peerDetails = this.snapshotPeers(torrent);
    const length =
      files.filter((file) => file.selected).reduce((sum, file) => sum + file.length, 0) ||
      torrent.length ||
      0;
    const downloaded =
      files.filter((file) => file.selected).reduce((sum, file) => sum + file.downloaded, 0) ||
      torrent.downloaded ||
      0;
    const progress = length > 0 ? Math.min(downloaded / length, 1) : finite(torrent.progress);

    const result: TorrentSnapshot = {
      id: record.id,
      infoHash: torrent.infoHash || '',
      name: torrent.name || displaySource(record.source),
      status: this.statusOf(runtime),
      path: record.path,
      length,
      downloaded,
      uploaded: torrent.uploaded || 0,
      downloadSpeed: torrent.downloadSpeed || 0,
      uploadSpeed: torrent.uploadSpeed || 0,
      progress,
      ratio: finite(torrent.ratio),
      eta: Number.isFinite(torrent.timeRemaining) ? torrent.timeRemaining : null,
      peers: torrent.numPeers || peerDetails.length,
      seeds: countSeeds(torrent, peerDetails.length),
      addedAt: record.addedAt,
      category: record.category,
      tags: record.tags,
      sequential: record.sequential,
      files,
      peerDetails,
      trackers: snapshotTrackers(torrent.announce),
    };
    if (runtime.error) result.error = runtime.error;
    if (record.completedAt) result.completedAt = record.completedAt;
    return result;
  }

  private snapshotPeers(torrent: ExtendedTorrent): PeerSnapshot[] {
    return (torrent.wires ?? []).map((wire, index) => ({
      address:
        wire.remoteAddress && wire.remotePort
          ? `${wire.remoteAddress}:${wire.remotePort}`
          : `peer-${index + 1}`,
      client: decodePeerClient(wire.peerId),
      progress: peerProgress(wire, torrent.pieces.length),
      downloadSpeed: wire.downloadSpeed?.() ?? 0,
      uploadSpeed: wire.uploadSpeed?.() ?? 0,
      interested: wire.peerInterested ?? false,
      choked: wire.peerChoking ?? false,
    }));
  }

  private statusOf(runtime: RuntimeTorrent): TorrentStatus {
    const { torrent, record, error } = runtime;
    if (error) return 'error';
    if (!torrent.ready) return 'metadata';
    if (record.paused || torrent.paused) return 'paused';
    if (torrent.done && torrent.uploadSpeed > 0) return 'seeding';
    if (torrent.done) return 'completed';
    if (torrent.downloadSpeed === 0 && Date.now() - runtime.lastActivityAt > 15_000)
      return 'stalled';
    return 'downloading';
  }

  private enforceSeedPolicies(): void {
    for (const runtime of this.runtimes.values()) {
      const { torrent, record } = runtime;
      if (!torrent.done || record.paused) continue;
      const ratioReached =
        this.settings.seedRatioLimit > 0 && torrent.ratio >= this.settings.seedRatioLimit;
      const minutes = record.completedAt
        ? (Date.now() - new Date(record.completedAt).getTime()) / 60_000
        : 0;
      const timeReached =
        this.settings.seedTimeLimitMinutes > 0 && minutes >= this.settings.seedTimeLimitMinutes;
      if (ratioReached || timeReached) {
        torrent.pause();
        record.paused = true;
        this.addAlert('info', `Seed goal reached: ${torrent.name}`);
        void this.persist().catch((error: unknown) => logError('Persist seed policy', error));
      }
    }
  }

  private requireRuntime(id: string): RuntimeTorrent {
    const runtime = this.runtimes.get(id);
    if (!runtime) throw new UserError(`Unknown torrent: ${id}`);
    return runtime;
  }

  private addAlert(level: AlertSnapshot['level'], message: string): void {
    this.alerts.push({ id: randomUUID(), level, message, timestamp: new Date().toISOString() });
    if (this.alerts.length > MAX_ALERTS) this.alerts.splice(0, this.alerts.length - MAX_ALERTS);
  }

  private persist(): Promise<void> {
    const session: SessionData = {
      version: 1,
      torrents: [...this.runtimes.values()].map(({ record }) => ({ ...record })),
    };
    this.persistQueue = this.persistQueue.then(() => saveSession(session));
    return this.persistQueue;
  }
}

function isRemoteTorrentId(source: string): boolean {
  return /^(magnet:|https?:\/\/)/i.test(source) || /^[a-f\d]{40}$/i.test(source);
}

function displaySource(source: string): string {
  if (source.startsWith('magnet:')) {
    const name = new URL(source).searchParams.get('dn');
    return name ?? 'magnet link';
  }
  return path.basename(source) || source;
}

function finite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function uniqueTags(tags: string[]): string[] {
  return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))].sort();
}

function snapshotTrackers(announce: string[] | undefined): TrackerSnapshot[] {
  return (announce ?? []).map((url) => ({ url, status: 'idle' }));
}

function decodePeerClient(peerId?: string): string {
  if (!peerId) return 'Unknown';
  const readable = peerId.replace(/[^\x20-\x7E]/g, '');
  return readable.slice(0, 20) || 'Unknown';
}

function peerProgress(wire: ExtendedWire, pieceCount: number): number {
  if (!wire.peerPieces?.get || pieceCount === 0) return 0;
  let available = 0;
  for (let index = 0; index < pieceCount; index += 1) {
    if (wire.peerPieces.get(index)) available += 1;
  }
  return available / pieceCount;
}

function countSeeds(torrent: ExtendedTorrent, fallback: number): number {
  if (!torrent.wires || torrent.pieces.length === 0) return 0;
  const count = torrent.wires.filter(
    (wire) => peerProgress(wire, torrent.pieces.length) >= 0.999,
  ).length;
  return Math.min(count, fallback);
}

async function waitUntilReady(torrent: ExtendedTorrent): Promise<void> {
  if (torrent.ready) return;
  await new Promise<void>((resolve, reject) => {
    torrent.once('ready', resolve);
    torrent.once('error', reject);
  });
}
