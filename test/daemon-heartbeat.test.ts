import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DaemonHeartbeat } from '../src/core/daemon-heartbeat.js';
import { writeJsonAtomic } from '../src/core/json-store.js';
import { getAppPaths } from '../src/core/paths.js';

const directories: string[] = [];
const originalDataDirectory = process.env.BITTORRENT_CLI_DATA_DIR;

afterEach(async () => {
  if (originalDataDirectory === undefined) delete process.env.BITTORRENT_CLI_DATA_DIR;
  else process.env.BITTORRENT_CLI_DATA_DIR = originalDataDirectory;
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('daemon heartbeat', () => {
  it('reports an unclean previous exit and removes its own heartbeat on stop', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'bittorrent-cli-heartbeat-'));
    directories.push(directory);
    process.env.BITTORRENT_CLI_DATA_DIR = directory;
    const paths = getAppPaths();
    await writeJsonAtomic(paths.heartbeatFile, {
      pid: 1234,
      startedAt: '2026-08-05T10:00:00.000Z',
      timestamp: '2026-08-05T10:00:05.000Z',
      version: '0.1.1',
    });

    const heartbeat = new DaemonHeartbeat();
    await heartbeat.start('2026-08-05T11:00:00.000Z');
    expect(await readFile(paths.logFile, 'utf8')).toContain(
      'Previous daemon pid 1234 stopped without a clean shutdown',
    );
    expect(JSON.parse(await readFile(paths.heartbeatFile, 'utf8'))).toMatchObject({
      pid: process.pid,
      version: '0.1.2',
    });

    await heartbeat.stop();
    await expect(access(paths.heartbeatFile)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
