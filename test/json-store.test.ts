import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { readValidatedJson, writeJsonAtomic } from '../src/core/json-store.js';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('JSON persistence', () => {
  it('writes valid JSON atomically and creates parent directories', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'bittorrent-cli-test-'));
    directories.push(directory);
    const file = path.join(directory, 'nested', 'state.json');
    await writeJsonAtomic(file, { value: 42 });
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({ value: 42 });
  });

  it('returns a fallback for missing and schema-invalid files', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'bittorrent-cli-test-'));
    directories.push(directory);
    const file = path.join(directory, 'state.json');
    const schema = z.object({ value: z.number() });
    expect(await readValidatedJson(file, schema, { value: 7 })).toEqual({ value: 7 });
    await writeJsonAtomic(file, { value: 'wrong' });
    expect(await readValidatedJson(file, schema, { value: 7 })).toEqual({ value: 7 });
  });
});
