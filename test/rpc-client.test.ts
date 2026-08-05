import net from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { DaemonClient } from '../src/rpc/client.js';
import type { ConnectionInfo } from '../src/rpc/protocol.js';

let server: net.Server | undefined;

afterEach(async () => {
  if (!server) return;
  await new Promise<void>((resolve) => server?.close(() => resolve()));
  server = undefined;
});

describe('DaemonClient transport retries', () => {
  it('retries a read-only request after an invalid response', async () => {
    let requests = 0;
    const client = await createClient((socket) => {
      requests += 1;
      if (requests === 1) socket.end('invalid response\n');
      else
        socket.end(
          `${JSON.stringify({
            id: 'response',
            ok: true,
            result: { pid: 4321, startedAt: '2026-08-05T10:00:00.000Z' },
          })}\n`,
        );
    });

    await expect(client.ping()).resolves.toEqual({
      pid: 4321,
      startedAt: '2026-08-05T10:00:00.000Z',
    });
    expect(requests).toBe(2);
  });

  it('does not retry a daemon-reported application error', async () => {
    let requests = 0;
    const client = await createClient((socket) => {
      requests += 1;
      socket.end(
        `${JSON.stringify({
          id: 'response',
          ok: false,
          error: { name: 'UserError', message: 'Unknown torrent' },
        })}\n`,
      );
    });

    await expect(client.ping()).rejects.toThrow('Unknown torrent');
    expect(requests).toBe(1);
  });
});

async function createClient(onRequest: (socket: net.Socket) => void): Promise<DaemonClient> {
  server = net.createServer((socket) => {
    socket.once('data', () => onRequest(socket));
  });
  await new Promise<void>((resolve, reject) => {
    server?.once('error', reject);
    server?.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind a port.');
  const connection: ConnectionInfo = {
    version: 1,
    host: '127.0.0.1',
    port: address.port,
    token: 'test-token',
    pid: process.pid,
    startedAt: new Date(0).toISOString(),
  };
  return new DaemonClient(connection);
}
