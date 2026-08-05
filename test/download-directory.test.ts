import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ensureDownloadDirectory } from '../src/core/download-directory.js';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('download destination validation', () => {
  it('creates a missing destination directory', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'bittorrent-cli-destination-'));
    directories.push(root);
    const destination = path.join(root, 'nested', 'download');
    expect(await ensureDownloadDirectory(destination)).toBe(path.resolve(destination));
    expect((await stat(destination)).isDirectory()).toBe(true);
  });

  it('rejects an existing file with a clear user error', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'bittorrent-cli-destination-'));
    directories.push(root);
    const destination = path.join(root, 'not-a-folder');
    await writeFile(destination, 'file');
    await expect(ensureDownloadDirectory(destination)).rejects.toThrow(
      /Cannot use download destination|not a directory/i,
    );
  });
});
