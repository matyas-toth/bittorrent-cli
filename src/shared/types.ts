export type TorrentStatus =
  | 'metadata'
  | 'checking'
  | 'downloading'
  | 'stalled'
  | 'paused'
  | 'seeding'
  | 'completed'
  | 'error';

export interface FileSnapshot {
  index: number;
  name: string;
  path: string;
  length: number;
  downloaded: number;
  progress: number;
  selected: boolean;
  priority: number;
}

export interface PeerSnapshot {
  address: string;
  client: string;
  progress: number;
  downloadSpeed: number;
  uploadSpeed: number;
  interested: boolean;
  choked: boolean;
}

export interface TrackerSnapshot {
  url: string;
  status: 'working' | 'updating' | 'idle' | 'error';
}

export interface TorrentSnapshot {
  id: string;
  infoHash: string;
  name: string;
  status: TorrentStatus;
  error?: string;
  path: string;
  length: number;
  downloaded: number;
  uploaded: number;
  downloadSpeed: number;
  uploadSpeed: number;
  progress: number;
  ratio: number;
  eta: number | null;
  peers: number;
  seeds: number;
  addedAt: string;
  completedAt?: string;
  category: string;
  tags: string[];
  sequential: boolean;
  files: FileSnapshot[];
  peerDetails: PeerSnapshot[];
  trackers: TrackerSnapshot[];
}

export interface ClientSettings {
  downloadPath: string;
  maxConnections: number;
  downloadLimit: number;
  uploadLimit: number;
  dht: boolean;
  pex: boolean;
  lsd: boolean;
  upnp: boolean;
  natPmp: boolean;
  utp: boolean;
  autoStart: boolean;
  seedRatioLimit: number;
  seedTimeLimitMinutes: number;
  theme: 'dark' | 'light';
  refreshIntervalMs: number;
}

export interface ClientSnapshot {
  daemon: {
    pid: number;
    startedAt: string;
    version: string;
  };
  global: {
    downloadSpeed: number;
    uploadSpeed: number;
    downloaded: number;
    uploaded: number;
    progress: number;
    ratio: number;
    peers: number;
  };
  settings: ClientSettings;
  torrents: TorrentSnapshot[];
  alerts: AlertSnapshot[];
}

export interface AlertSnapshot {
  id: string;
  level: 'info' | 'success' | 'warning' | 'error';
  message: string;
  timestamp: string;
}

export interface AddTorrentRequest {
  source: string;
  path?: string;
  paused?: boolean;
  sequential?: boolean;
  category?: string;
  tags?: string[];
}

export interface SeedRequest {
  sourcePath: string;
  announce?: string[];
  comment?: string;
  private?: boolean;
  outputPath?: string;
}

export interface PersistedTorrent {
  id: string;
  kind: 'download' | 'seed';
  source: string;
  magnetUri?: string | undefined;
  torrentFileBase64?: string | undefined;
  path: string;
  paused: boolean;
  sequential: boolean;
  category: string;
  tags: string[];
  selectedFiles?: number[] | undefined;
  addedAt: string;
  completedAt?: string | undefined;
}

export interface SessionData {
  version: 1;
  torrents: PersistedTorrent[];
}

export type TorrentAction = 'pause' | 'resume' | 'recheck' | 'sequential' | 'rarest';
