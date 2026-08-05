import React from 'react';
import { render } from 'ink';
import type { DaemonClient } from '../rpc/client.js';
import { App } from './app.js';

export async function renderApp(client: DaemonClient, initialSource?: string): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(
      'The full-screen interface requires an interactive terminal. Use list/add commands for scripts.',
    );
  }
  enterAlternateScreen();
  try {
    const instance = render(<App client={client} initialSource={initialSource} />, {
      exitOnCtrlC: false,
      patchConsole: false,
    });
    await instance.waitUntilExit();
  } finally {
    leaveAlternateScreen();
  }
}

function enterAlternateScreen(): void {
  process.stdout.write('\u001B[?1049h\u001B[2J\u001B[H\u001B[?25l');
}

function leaveAlternateScreen(): void {
  process.stdout.write('\u001B[?25h\u001B[?1049l');
}
