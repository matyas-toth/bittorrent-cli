#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { Argument, Command } from 'commander';
import open from 'open';
import { connectToDaemon } from './rpc/client.js';
import { runDaemon } from './daemon.js';
import { renderApp } from './ui/render.js';
import { errorMessage, UserError } from './shared/errors.js';
import type { ClientSettings, TorrentAction } from './shared/types.js';
import { getAppPaths } from './core/paths.js';
import { printTorrentInfo, printTorrentList, resolveTorrent } from './cli/output.js';
import { formatBytes, formatPercent } from './ui/format.js';
import { VERSION } from './shared/constants.js';

const program = new Command();

interface AddOptions {
  path?: string;
  paused?: boolean;
  sequential?: boolean;
  category?: string;
  tag?: string[];
  json?: boolean;
}

interface JsonOptions {
  json?: boolean;
}
interface RemoveOptions {
  deleteData?: boolean;
}
interface FilesOptions extends JsonOptions {
  select?: string;
}
interface CreateOptions extends JsonOptions {
  output?: string;
  announce?: string[];
  comment?: string;
  private?: boolean;
}
interface DaemonOptions {
  foreground?: boolean;
}

program
  .name('bittorrent-cli')
  .description('A full-screen, keyboard-first BitTorrent client for the terminal.')
  .version(VERSION)
  .argument('[torrent]', 'open a .torrent file, URL, info hash, or magnet link')
  .option('-p, --path <directory>', 'destination directory for a directly opened torrent')
  .action(async (torrent: string | undefined, options: { path?: string }) => {
    const client = await connectToDaemon();
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      if (torrent) {
        const added = await client.add({
          source: torrent,
          ...(options.path ? { path: options.path } : {}),
        });
        printTorrentInfo(added, false);
      } else {
        printTorrentList(await client.snapshot(), false);
      }
      return;
    }
    if (torrent && options.path) await client.add({ source: torrent, path: options.path });
    await renderApp(client, options.path ? undefined : torrent);
  });

program
  .command('add')
  .description('add a torrent without opening the TUI')
  .argument('<source>', '.torrent path, URL, info hash, or magnet URI')
  .option('-p, --path <directory>', 'destination directory')
  .option('--paused', 'add in a paused state')
  .option('--sequential', 'download pieces sequentially')
  .option('-c, --category <name>', 'category')
  .option('-t, --tag <tag...>', 'one or more tags')
  .option('--json', 'output machine-readable JSON')
  .action(async (source: string, options: AddOptions) => {
    const client = await connectToDaemon();
    const torrent = await client.add({
      source,
      ...(options.path ? { path: path.resolve(options.path) } : {}),
      paused: Boolean(options.paused),
      sequential: Boolean(options.sequential),
      ...(options.category ? { category: options.category } : {}),
      ...(options.tag ? { tags: options.tag } : {}),
    });
    printTorrentInfo(torrent, Boolean(options.json));
  });

program
  .command('list')
  .alias('ls')
  .description('list torrents')
  .option('--json', 'output machine-readable JSON')
  .action(async (options: JsonOptions) =>
    printTorrentList(await (await connectToDaemon()).snapshot(), Boolean(options.json)),
  );

program
  .command('info')
  .description('show detailed torrent information')
  .argument('<torrent>', 'ID, info hash, or unambiguous name')
  .option('--json', 'output machine-readable JSON')
  .action(async (selector: string, options: JsonOptions) => {
    const snapshot = await (await connectToDaemon()).snapshot();
    printTorrentInfo(resolveTorrent(snapshot, selector), Boolean(options.json));
  });

for (const action of ['pause', 'resume', 'recheck'] as const) {
  program
    .command(action)
    .description(`${action} one or more torrents`)
    .argument('<torrents...>', 'IDs, info hashes, or unambiguous names')
    .action(async (selectors: string[]) => runActions(action, selectors));
}

program
  .command('remove')
  .alias('rm')
  .description('remove one or more torrents')
  .argument('<torrents...>', 'IDs, info hashes, or unambiguous names')
  .option('--delete-data', 'also permanently delete downloaded files')
  .action(async (selectors: string[], options: RemoveOptions) => {
    const client = await connectToDaemon();
    const snapshot = await client.snapshot();
    for (const selector of selectors) {
      const torrent = resolveTorrent(snapshot, selector);
      await client.remove(torrent.id, options.deleteData ?? false);
      process.stdout.write(`${options.deleteData ? 'Deleted' : 'Removed'} ${torrent.name}\n`);
    }
  });

program
  .command('files')
  .description('list or select files in a torrent')
  .argument('<torrent>', 'ID, info hash, or unambiguous name')
  .option('--select <indices>', 'comma-separated zero-based file indices; empty selects none')
  .option('--json', 'output machine-readable JSON')
  .action(async (selector: string, options: FilesOptions) => {
    const client = await connectToDaemon();
    const torrent = resolveTorrent(await client.snapshot(), selector);
    let result = torrent;
    if (options.select !== undefined)
      result = await client.selectFiles(torrent.id, parseIndices(options.select));
    if (options.json) {
      process.stdout.write(`${JSON.stringify(result.files, null, 2)}\n`);
      return;
    }
    for (const file of result.files) {
      process.stdout.write(
        `${String(file.index).padStart(4)} ${file.selected ? '[x]' : '[ ]'} ${formatPercent(file.progress).padStart(8)} ${formatBytes(file.length).padStart(10)}  ${file.path}\n`,
      );
    }
  });

program
  .command('mode')
  .description('set piece-selection strategy')
  .argument('<torrent>', 'ID, info hash, or unambiguous name')
  .addArgument(new Argument('<mode>', 'selection mode').choices(['sequential', 'rarest']))
  .action(async (selector: string, mode: TorrentAction) => {
    const client = await connectToDaemon();
    const torrent = resolveTorrent(await client.snapshot(), selector);
    const result = await client.action(torrent.id, mode);
    process.stdout.write(`${result.name}: ${result.sequential ? 'sequential' : 'rarest-first'}\n`);
  });

program
  .command('create')
  .description('create a .torrent and begin seeding it')
  .argument('<path>', 'file or directory to seed')
  .option('-o, --output <file>', 'output .torrent file')
  .option('-a, --announce <url...>', 'tracker announce URLs')
  .option('--comment <text>', 'torrent comment')
  .option('--private', 'mark the torrent private')
  .option('--json', 'output machine-readable JSON')
  .action(async (source: string, options: CreateOptions) => {
    const absoluteSource = path.resolve(source);
    const outputPath = path.resolve(options.output ?? `${path.basename(absoluteSource)}.torrent`);
    const torrent = await (
      await connectToDaemon()
    ).seed({
      sourcePath: absoluteSource,
      outputPath,
      ...(options.announce ? { announce: options.announce } : {}),
      ...(options.comment ? { comment: options.comment } : {}),
      private: Boolean(options.private),
    });
    if (options.json)
      process.stdout.write(`${JSON.stringify({ ...torrent, torrentFile: outputPath }, null, 2)}\n`);
    else
      process.stdout.write(
        `Created ${outputPath}\nMagnet ${torrent.infoHash || 'metadata pending'}\n`,
      );
  });

program
  .command('open')
  .description('open a torrent download directory in the system file manager')
  .argument('<torrent>', 'ID, info hash, or unambiguous name')
  .action(async (selector: string) => {
    const torrent = resolveTorrent(await (await connectToDaemon()).snapshot(), selector);
    await open(torrent.path);
  });

program
  .command('config')
  .description('show or change configuration')
  .argument('[key]', 'setting name in kebab-case')
  .argument('[value]', 'new value')
  .option('--json', 'output machine-readable JSON')
  .action(async (key: string | undefined, value: string | undefined, options: JsonOptions) => {
    const client = await connectToDaemon();
    const settings = (await client.snapshot()).settings;
    if (!key) {
      process.stdout.write(
        options.json ? `${JSON.stringify(settings, null, 2)}\n` : formatSettings(settings),
      );
      return;
    }
    const property = kebabToCamel(key) as keyof ClientSettings;
    if (!(property in settings)) throw new UserError(`Unknown setting: ${key}`);
    if (value === undefined) {
      process.stdout.write(`${String(settings[property])}\n`);
      return;
    }
    const parsed = parseSettingValue(settings[property], value);
    const next = await client.updateSettings({ [property]: parsed });
    process.stdout.write(`${key} = ${String(next[property])}\n`);
  });

program
  .command('doctor')
  .description('show diagnostic information')
  .action(async () => {
    const paths = getAppPaths();
    let daemon = 'not running';
    try {
      const ping = await (await connectToDaemon({ start: false })).ping();
      daemon = `running (pid ${ping.pid}, since ${ping.startedAt})`;
    } catch {
      // A stopped daemon is a valid diagnostic state.
    }
    const interactive = Boolean(
      (process.stdin as { isTTY?: boolean }).isTTY && (process.stdout as { isTTY?: boolean }).isTTY,
    );
    process.stdout.write(
      `bittorrent-cli ${VERSION}\nNode             ${process.version}\nPlatform         ${process.platform} ${process.arch}\nInteractive TTY  ${interactive}\nDaemon           ${daemon}\nData             ${paths.data}\nConfig           ${paths.config}\nLogs             ${paths.logFile}\n`,
    );
  });

program
  .command('shutdown')
  .description('gracefully stop the background engine')
  .action(async () => {
    const client = await connectToDaemon({ start: false });
    await client.shutdown();
    process.stdout.write('Daemon is stopping.\n');
  });

const daemonCommand = new Command('daemon')
  .description('run the background engine')
  .option('--foreground', 'run in the current process')
  .action(async (options: DaemonOptions) => {
    if (!options.foreground)
      throw new UserError('Use “bittorrent-cli” to start the daemon automatically.');
    await runDaemon();
  });
program.addCommand(daemonCommand, { hidden: true });

program.showSuggestionAfterError().showHelpAfterError('(add --help for additional information)');

try {
  await program.parseAsync(process.argv);
} catch (error) {
  process.stderr.write(`bittorrent-cli: ${errorMessage(error)}\n`);
  process.exitCode = error instanceof UserError ? 2 : 1;
}

async function runActions(action: TorrentAction, selectors: string[]): Promise<void> {
  const client = await connectToDaemon();
  const snapshot = await client.snapshot();
  for (const selector of selectors) {
    const torrent = resolveTorrent(snapshot, selector);
    const updated = await client.action(torrent.id, action);
    process.stdout.write(`${updated.name}: ${updated.status}\n`);
  }
}

function parseIndices(input: string): number[] {
  if (!input.trim()) return [];
  const values = input.split(',').map((item) => Number(item.trim()));
  if (values.some((value) => !Number.isInteger(value) || value < 0)) {
    throw new UserError('File indices must be comma-separated non-negative integers.');
  }
  return [...new Set(values)];
}

function kebabToCamel(value: string): string {
  return value.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function parseSettingValue(current: ClientSettings[keyof ClientSettings], value: string) {
  if (typeof current === 'boolean') {
    if (!['true', 'false'].includes(value))
      throw new UserError('Boolean settings accept true or false.');
    return value === 'true';
  }
  if (typeof current === 'number') {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) throw new UserError('This setting requires a number.');
    return parsed;
  }
  return value;
}

function formatSettings(settings: ClientSettings): string {
  return `${Object.entries(settings)
    .map(
      ([key, value]) =>
        `${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`).padEnd(25)} ${String(value)}`,
    )
    .join('\n')}\n`;
}
