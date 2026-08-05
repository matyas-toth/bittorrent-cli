import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { TorrentEngine } from '../src/core/torrent-engine.js';
import { defaultSettings, saveSettings } from '../src/core/settings-store.js';

const directories: string[] = [];

afterEach(async () => {
  delete process.env.BITTORRENT_CLI_DATA_DIR;
  delete process.env.BITTORRENT_CLI_CONFIG_DIR;
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('TorrentEngine lifecycle', () => {
  it('creates a torrent, persists the session, and restores a seed', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'bittorrent-cli-engine-'));
    directories.push(root);
    process.env.BITTORRENT_CLI_DATA_DIR = path.join(root, 'data');
    process.env.BITTORRENT_CLI_CONFIG_DIR = path.join(root, 'config');
    await mkdir(path.join(root, 'payload'));
    const payload = path.join(root, 'payload', 'hello.txt');
    const torrentFile = path.join(root, 'hello.torrent');
    await writeFile(payload, 'hello from a synthetic, offline fixture\n');
    await saveSettings({
      ...defaultSettings,
      dht: false,
      pex: false,
      lsd: false,
      upnp: false,
      natPmp: false,
      utp: false,
    });

    const first = new TorrentEngine();
    await first.start();
    const created = await first.seed({
      sourcePath: payload,
      outputPath: torrentFile,
      announce: [],
      private: true,
    });
    expect(created.infoHash).toMatch(/^[a-f\d]{40}$/);
    expect(created.status).toMatch(/completed|seeding/);
    await first.close();

    const restored = new TorrentEngine();
    try {
      await restored.start();
      let snapshot = restored.snapshot();
      for (let attempt = 0; attempt < 20 && !snapshot.torrents[0]?.infoHash; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 25));
        snapshot = restored.snapshot();
      }
      expect(snapshot.torrents).toHaveLength(1);
      expect(snapshot.torrents[0]?.name).toBe('hello.txt');
      expect(snapshot.torrents[0]?.infoHash).toBe(created.infoHash);
    } finally {
      await restored.close();
    }
  });
});
