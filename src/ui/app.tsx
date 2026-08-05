import React, { useMemo, useState } from 'react';
import { Box, Text, useApp, useInput, useStdout } from 'ink';
import { Alert, Spinner, ThemeProvider } from '@inkjs/ui';
import open from 'open';
import type { DaemonClient } from '../rpc/client.js';
import { errorMessage } from '../shared/errors.js';
import { useSnapshot } from './hooks/use-snapshot.js';
import { Header } from './components/header.js';
import { Sidebar, matchesFilter, type Filter } from './components/sidebar.js';
import { TorrentList } from './components/torrent-list.js';
import { Details, type DetailTab } from './components/details.js';
import {
  AddDialog,
  FilesDialog,
  HelpDialog,
  RemoveDialog,
  SearchDialog,
  SettingsDialog,
} from './components/dialogs.js';
import { appTheme, colors } from './theme.js';
import { formatSpeed, sparkline } from './format.js';

type Modal = 'add' | 'remove' | 'delete' | 'files' | 'search' | 'settings' | 'help' | undefined;
const filters: Filter[] = [
  'all',
  'active',
  'downloading',
  'seeding',
  'completed',
  'paused',
  'error',
];

export function App({
  client,
  initialSource,
}: {
  client: DaemonClient;
  initialSource?: string | undefined;
}) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const width = stdout.columns || 100;
  const height = stdout.rows || 30;
  const {
    client: activeClient,
    snapshot,
    error,
    refresh,
    downloadHistory,
    uploadHistory,
  } = useSnapshot(client);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<DetailTab>('overview');
  const [modal, setModal] = useState<Modal>(initialSource ? 'add' : undefined);
  const [actionError, setActionError] = useState<string>();

  const torrents = useMemo(() => {
    if (!snapshot) return [];
    const needle = query.toLowerCase();
    return snapshot.torrents.filter(
      (torrent) =>
        matchesFilter(torrent, filter) &&
        (!needle ||
          torrent.name.toLowerCase().includes(needle) ||
          torrent.infoHash.toLowerCase().includes(needle) ||
          torrent.category.toLowerCase().includes(needle) ||
          torrent.tags.some((tag) => tag.toLowerCase().includes(needle))),
    );
  }, [filter, query, snapshot]);
  const safeSelectedIndex = Math.min(selectedIndex, Math.max(0, torrents.length - 1));
  const selected = torrents[safeSelectedIndex];

  const run = async (operation: () => Promise<unknown>, closeModal = false) => {
    setActionError(undefined);
    try {
      await operation();
      if (closeModal) setModal(undefined);
      await refresh();
    } catch (caught) {
      setActionError(errorMessage(caught));
    }
  };

  const cycleFilter = (direction: number) => {
    const index = filters.indexOf(filter);
    setFilter(filters[(index + direction + filters.length) % filters.length] ?? 'all');
    setSelectedIndex(0);
  };

  useInput((input, key) => {
    if (modal) return;
    if (input === 'q' || (key.ctrl && input === 'c')) exit();
    else if (input === 'j' || key.downArrow)
      setSelectedIndex(Math.min(safeSelectedIndex + 1, torrents.length - 1));
    else if (input === 'k' || key.upArrow) setSelectedIndex(Math.max(safeSelectedIndex - 1, 0));
    else if (input === 'a') setModal('add');
    else if (input === 'd' && selected) setModal('remove');
    else if (input === 'x' && selected) setModal('delete');
    else if (input === 'f' && selected?.files.length) setModal('files');
    else if (input === '/') setModal('search');
    else if (input === '?') setModal('help');
    else if (input === 's') setModal('settings');
    else if (input === '1') setTab('overview');
    else if (input === '2') setTab('files');
    else if (input === '3') setTab('peers');
    else if (input === '4') setTab('trackers');
    else if (input === '[') cycleFilter(-1);
    else if (input === ']') cycleFilter(1);
    else if (input === ' ' && selected)
      void run(() =>
        activeClient.action(selected.id, selected.status === 'paused' ? 'resume' : 'pause'),
      );
    else if (input === 'r' && selected) void run(() => activeClient.action(selected.id, 'recheck'));
    else if (input === 't' && selected)
      void run(() =>
        activeClient.action(selected.id, selected.sequential ? 'rarest' : 'sequential'),
      );
    else if (input === 'o' && selected) void open(selected.path);
  });

  if (!snapshot) {
    return (
      <ThemeProvider theme={appTheme}>
        <Box padding={1}>
          <Spinner label={error ? `Connecting: ${error}` : 'Starting BitTorrent engine…'} />
        </Box>
      </ThemeProvider>
    );
  }

  const listHeight = Math.max(4, height - 15);
  const wide = width >= 100;
  const latestAlert = snapshot.alerts.at(-1);
  return (
    <ThemeProvider theme={appTheme}>
      <Box width={width} height={height} flexDirection="column">
        <Header snapshot={snapshot} width={width} />
        <Box
          height={1}
          borderStyle="single"
          borderLeft={false}
          borderRight={false}
          borderColor={colors.subtle}
        >
          <Text color={colors.muted}>
            {' '}
            {filter.toUpperCase()}
            {query ? ` · “${query}”` : ''} · {torrents.length} torrents{' '}
          </Text>
        </Box>
        <Box flexGrow={1}>
          {wide && <Sidebar torrents={snapshot.torrents} selected={filter} />}
          <TorrentList
            torrents={torrents}
            selectedIndex={safeSelectedIndex}
            width={wide ? width - 22 : width}
            height={listHeight}
          />
        </Box>
        <Details torrent={selected} tab={tab} width={width} />
        <Box paddingX={1} justifyContent="space-between">
          <Text color={colors.muted}>
            a add · space pause · d remove · / filter · ? keys · q detach
          </Text>
          {width >= 110 && (
            <Text>
              <Text color={colors.downloading}>
                ↓{sparkline(downloadHistory, 12)} {formatSpeed(snapshot.global.downloadSpeed)}
              </Text>{' '}
              <Text color={colors.seeding}>
                ↑{sparkline(uploadHistory, 12)} {formatSpeed(snapshot.global.uploadSpeed)}
              </Text>
            </Text>
          )}
        </Box>
        {(actionError ?? error) && <Alert variant="error">{actionError ?? error}</Alert>}
        {!actionError && !error && latestAlert && (
          <Alert variant={latestAlert.level}>{latestAlert.message}</Alert>
        )}
        {modal === 'add' && (
          <AddDialog
            initialSource={initialSource}
            defaultPath={snapshot.settings.downloadPath}
            onCancel={() => setModal(undefined)}
            onSubmit={async (source, destination) => {
              await activeClient.add({ source, path: destination });
              setModal(undefined);
              await refresh();
            }}
          />
        )}
        {(modal === 'remove' || modal === 'delete') && selected && (
          <RemoveDialog
            torrent={selected}
            deleteData={modal === 'delete'}
            onCancel={() => setModal(undefined)}
            onConfirm={() =>
              void run(() => activeClient.remove(selected.id, modal === 'delete'), true)
            }
          />
        )}
        {modal === 'files' && selected && (
          <FilesDialog
            torrent={selected}
            onCancel={() => setModal(undefined)}
            onSubmit={async (indices) => {
              await activeClient.selectFiles(selected.id, indices);
              setModal(undefined);
              await refresh();
            }}
          />
        )}
        {modal === 'search' && (
          <SearchDialog onChange={setQuery} onClose={() => setModal(undefined)} />
        )}
        {modal === 'settings' && (
          <SettingsDialog
            settings={snapshot.settings}
            onCancel={() => setModal(undefined)}
            onSubmit={async (update) => {
              await activeClient.updateSettings(update);
              setModal(undefined);
              await refresh();
            }}
          />
        )}
        {modal === 'help' && <HelpDialog onClose={() => setModal(undefined)} />}
      </Box>
    </ThemeProvider>
  );
}
