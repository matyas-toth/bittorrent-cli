import { randomUUID } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import { getAppPaths } from '../core/paths.js';
import { UserError } from '../shared/errors.js';
import type {
  AddTorrentRequest,
  ClientSettings,
  ClientSnapshot,
  SeedRequest,
  TorrentAction,
  TorrentSnapshot,
} from '../shared/types.js';
import type { ConnectionInfo, RpcMethod, RpcResponse } from './protocol.js';

const CONNECT_TIMEOUT_MS = 3_000;
const START_TIMEOUT_MS = 15_000;

export class DaemonClient {
  constructor(private readonly connection: ConnectionInfo) {}

  ping(): Promise<{ pid: number; startedAt: string }> {
    return this.call('ping');
  }

  snapshot(): Promise<ClientSnapshot> {
    return this.call('snapshot');
  }

  add(request: AddTorrentRequest): Promise<TorrentSnapshot> {
    return this.call('add', request);
  }

  seed(request: SeedRequest): Promise<TorrentSnapshot> {
    return this.call('seed', request);
  }

  action(id: string, action: TorrentAction): Promise<TorrentSnapshot> {
    return this.call('action', { id, action });
  }

  remove(id: string, deleteData = false): Promise<void> {
    return this.call('remove', { id, deleteData });
  }

  selectFiles(id: string, indices: number[]): Promise<TorrentSnapshot> {
    return this.call('selectFiles', { id, indices });
  }

  updateMetadata(
    id: string,
    update: { category?: string; tags?: string[] },
  ): Promise<TorrentSnapshot> {
    return this.call('updateMetadata', { id, ...update });
  }

  updateSettings(update: Partial<ClientSettings>): Promise<ClientSettings> {
    return this.call('updateSettings', update);
  }

  dismissAlert(id: string): Promise<void> {
    return this.call('dismissAlert', { id });
  }

  shutdown(): Promise<void> {
    return this.call('shutdown');
  }

  private call<T>(method: RpcMethod, params?: unknown): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const socket = net.createConnection({
        host: this.connection.host,
        port: this.connection.port,
      });
      socket.setEncoding('utf8');
      socket.setTimeout(CONNECT_TIMEOUT_MS, () => socket.destroy(new Error('Daemon timed out.')));
      let buffer = '';
      socket.once('connect', () => {
        socket.write(
          `${JSON.stringify({ id: randomUUID(), token: this.connection.token, method, params })}\n`,
        );
      });
      socket.on('data', (chunk) => (buffer += String(chunk)));
      socket.once('error', (error) => reject(error));
      socket.once('end', () => {
        try {
          const response = JSON.parse(buffer.trim()) as RpcResponse;
          if (!response.ok) {
            const error = new UserError(response.error?.message ?? 'Daemon request failed.');
            error.name = response.error?.name ?? 'DaemonError';
            reject(error);
            return;
          }
          resolve(response.result as T);
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });
    });
  }
}

export async function connectToDaemon(options: { start?: boolean } = {}): Promise<DaemonClient> {
  const existing = await readConnection();
  if (existing) {
    const client = new DaemonClient(existing);
    try {
      await client.ping();
      return client;
    } catch {
      await rm(getAppPaths().connectionFile, { force: true });
    }
  }
  if (options.start === false) throw new UserError('The bittorrent-cli daemon is not running.');

  if (!(await daemonIsStarting())) startDetachedDaemon();
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const connection = await readConnection();
    if (!connection) continue;
    const client = new DaemonClient(connection);
    try {
      await client.ping();
      return client;
    } catch {
      // The daemon may still be binding its socket.
    }
  }
  throw new UserError(`The daemon did not start within ${START_TIMEOUT_MS / 1000} seconds.`);
}

async function readConnection(): Promise<ConnectionInfo | undefined> {
  try {
    return JSON.parse(await readFile(getAppPaths().connectionFile, 'utf8')) as ConnectionInfo;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    return undefined;
  }
}

async function daemonIsStarting(): Promise<boolean> {
  const { lockFile } = getAppPaths();
  try {
    const lock = JSON.parse(await readFile(lockFile, 'utf8')) as { pid?: number };
    if (!lock.pid) {
      await rm(lockFile, { force: true });
      return false;
    }
    try {
      process.kill(lock.pid, 0);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') return true;
      await rm(lockFile, { force: true });
      return false;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') await rm(lockFile, { force: true });
    return false;
  }
}

function startDetachedDaemon(): void {
  const compiledEntry = fileURLToPath(new URL('../cli.js', import.meta.url));
  const sourceEntry = fileURLToPath(new URL('../cli.tsx', import.meta.url));
  const runningFromSource = import.meta.url.endsWith('.ts');
  const entry = runningFromSource ? sourceEntry : compiledEntry;
  const args = runningFromSource
    ? ['--import', 'tsx', entry, 'daemon', '--foreground']
    : [entry, 'daemon', '--foreground'];
  const child = spawn(process.execPath, args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: { ...process.env, BITTORRENT_CLI_DAEMON: '1' },
  });
  child.unref();
}
