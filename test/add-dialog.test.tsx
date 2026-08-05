import path from 'node:path';
import React from 'react';
import { render } from 'ink-testing-library';
import { Box } from 'ink';
import { describe, expect, it, vi } from 'vitest';
import { suggestDestinationPath } from '../src/ui/add-destination.js';
import { AddDialog } from '../src/ui/components/dialogs.js';

const defaultPath = path.resolve('test-downloads');

describe('add torrent destination', () => {
  it('uses the magnet display name as a safe destination folder', () => {
    const magnet =
      'magnet:?xt=urn:btih:dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c&dn=Big%20Buck%20Bunny';
    expect(suggestDestinationPath(defaultPath, magnet)).toBe(
      path.join(defaultPath, 'Big Buck Bunny'),
    );
  });

  it('uses a torrent filename without its suffix', () => {
    expect(suggestDestinationPath(defaultPath, 'C:\\Torrents\\sample.release.torrent')).toBe(
      path.join(defaultPath, 'sample.release'),
    );
    expect(
      suggestDestinationPath(defaultPath, 'https://example.test/Public%20Domain.torrent'),
    ).toBe(path.join(defaultPath, 'Public Domain'));
  });

  it('falls back to the configured path when no name is available', () => {
    expect(suggestDestinationPath(defaultPath, 'a'.repeat(40))).toBe(defaultPath);
    expect(suggestDestinationPath(defaultPath, 'magnet:?xt=urn:btih:' + 'b'.repeat(40))).toBe(
      defaultPath,
    );
  });

  it('moves to a fresh destination input and preserves arrow-key editing', async () => {
    const magnet = `magnet:?xt=urn:btih:${'c'.repeat(40)}&dn=Sample`;
    const dialog = render(
      <Box width={120} height={20}>
        <AddDialog
          defaultPath={defaultPath}
          onCancel={vi.fn()}
          onSubmit={vi.fn().mockResolvedValue(undefined)}
        />
      </Box>,
    );

    await settle();
    dialog.stdin.write(magnet);
    await settle();
    dialog.stdin.write('\r');
    await settle();
    expect(dialog.lastFrame()).toContain(path.join(defaultPath, 'Sample'));
    expect(dialog.lastFrame()).not.toContain('magnet:?');

    dialog.stdin.write('\u001b[D');
    await settle();
    expect(dialog.lastFrame()).toContain('Save files to');

    dialog.stdin.write('\u0002');
    await settle();
    expect(dialog.lastFrame()).toContain('Torrent file, URL, info hash, or magnet URI');
  });
});

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 10));
}
