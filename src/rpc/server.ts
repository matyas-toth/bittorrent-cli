import { randomBytes } from 'node:crypto';
import { rm } from 'node:fs/promises';
import net from 'node:net';
import type { TorrentEngine } from '../core/torrent-engine.js';
import { getAppPaths } from '../core/paths.js';
import { writeJsonAtomic } from '../core/json-store.js';
import { errorMessage } from '../shared/errors.js';
import type {
  AddTorrentRequest,
  ClientSettings,
  SeedRequest,
  TorrentAction,
} from '../shared/types.js';
import type { ConnectionInfo, RpcRequest, RpcResponse } from './protocol.js';

const MAX_REQUEST_BYTES = 1024 * 1024;

export class RpcServer {
  private readonly server = net.createServer((socket) => this.handleSocket(socket));
  private readonly token = randomBytes(32).toString('hex');
  private shuttingDown = false;

  constructor(
    private readonly engine: TorrentEngine,
    private readonly onShutdown: () => void,
  ) {}

  async listen(): Promise<ConnectionInfo> {
    await new Promise<void>((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(0, '127.0.0.1', () => resolve());
    });
    const address = this.server.address();
    if (!address || typeof address === 'string') throw new Error('Could not resolve daemon port.');
    const info: ConnectionInfo = {
      version: 1,
      host: '127.0.0.1',
      port: address.port,
      token: this.token,
      pid: process.pid,
      startedAt: this.engine.startedAt,
    };
    await writeJsonAtomic(getAppPaths().connectionFile, info);
    return info;
  }

  async close(): Promise<void> {
    if (this.shuttingDown) return;
    this.shuttingDown = true;
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
    await rm(getAppPaths().connectionFile, { force: true });
  }

  private handleSocket(socket: net.Socket): void {
    socket.setEncoding('utf8');
    socket.setTimeout(10_000, () => socket.destroy());
    let buffer = '';
    socket.on('data', (chunk) => {
      buffer += String(chunk);
      if (Buffer.byteLength(buffer) > MAX_REQUEST_BYTES) {
        socket.destroy(new Error('RPC request is too large.'));
        return;
      }
      const newline = buffer.indexOf('\n');
      if (newline < 0) return;
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      void this.respond(socket, line);
    });
  }

  private async respond(socket: net.Socket, line: string): Promise<void> {
    let id = 'unknown';
    try {
      const request = JSON.parse(line) as RpcRequest;
      id = request.id;
      if (request.token !== this.token) throw new Error('Unauthorized local client.');
      const result = await this.dispatch(request);
      this.send(socket, { id, ok: true, result });
      if (request.method === 'shutdown') setImmediate(this.onShutdown);
    } catch (error) {
      this.send(socket, {
        id,
        ok: false,
        error: {
          name: error instanceof Error ? error.name : 'Error',
          message: errorMessage(error),
        },
      });
    }
  }

  private dispatch(request: RpcRequest): unknown {
    const params = request.params as Record<string, unknown> | undefined;
    switch (request.method) {
      case 'ping':
        return { pid: process.pid, startedAt: this.engine.startedAt };
      case 'snapshot':
        return this.engine.snapshot();
      case 'add':
        return this.engine.add(request.params as AddTorrentRequest);
      case 'seed':
        return this.engine.seed(request.params as SeedRequest);
      case 'action':
        return this.engine.action(String(params?.id), params?.action as TorrentAction);
      case 'remove':
        return this.engine.remove(String(params?.id), Boolean(params?.deleteData));
      case 'selectFiles':
        return this.engine.selectFiles(String(params?.id), params?.indices as number[]);
      case 'updateMetadata':
        return this.engine.updateMetadata(String(params?.id), {
          ...(typeof params?.category === 'string' ? { category: params.category } : {}),
          ...(Array.isArray(params?.tags) ? { tags: params.tags as string[] } : {}),
        });
      case 'updateSettings':
        return this.engine.updateSettings(request.params as Partial<ClientSettings>);
      case 'dismissAlert':
        return this.engine.dismissAlert(String(params?.id));
      case 'shutdown':
        return { stopping: true };
    }
  }

  private send(socket: net.Socket, response: RpcResponse): void {
    socket.end(`${JSON.stringify(response)}\n`);
  }
}
