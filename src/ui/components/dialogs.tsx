import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Alert, ConfirmInput, MultiSelect, Spinner, TextInput } from '@inkjs/ui';
import type { ClientSettings, TorrentSnapshot } from '../../shared/types.js';
import { colors } from '../theme.js';
import { formatBytes } from '../format.js';
import { suggestDestinationPath } from '../add-destination.js';

function DialogFrame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box
      position="absolute"
      marginLeft={4}
      marginTop={2}
      width="80%"
      borderStyle="double"
      borderColor={colors.accentStrong}
      backgroundColor="#0b1020"
      paddingX={2}
      paddingY={1}
      flexDirection="column"
    >
      <Text bold color={colors.accent}>
        {title}
      </Text>
      <Box height={1} />
      {children}
    </Box>
  );
}

export function AddDialog({
  initialSource = '',
  defaultPath,
  onSubmit,
  onCancel,
}: {
  initialSource?: string | undefined;
  defaultPath: string;
  onSubmit: (source: string, destination: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [source, setSource] = useState(initialSource);
  const [destination, setDestination] = useState(() =>
    initialSource ? suggestDestinationPath(defaultPath, initialSource) : defaultPath,
  );
  const [step, setStep] = useState(initialSource ? 1 : 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  useInput((input, key) => {
    if (busy) return;
    const goBack =
      step === 1 && ((key.ctrl && input.toLowerCase() === 'b') || (key.shift && key.tab));
    if (goBack) {
      setStep(0);
      return;
    }
    if (key.escape) onCancel();
  });

  const submit = async () => {
    if (!source.trim() || !destination.trim()) return;
    setBusy(true);
    setError(undefined);
    try {
      await onSubmit(source.trim(), destination.trim());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setBusy(false);
    }
  };

  return (
    <DialogFrame title="Add torrent">
      {error && <Alert variant="error">{error}</Alert>}
      {step === 0 ? (
        <>
          <Text color={colors.muted}>Torrent file, URL, info hash, or magnet URI</Text>
          <TextInput
            key="source-input"
            defaultValue={source}
            placeholder="magnet:?xt=… or ./file.torrent"
            onChange={setSource}
            onSubmit={(value) => {
              const normalized = value.trim();
              if (normalized) {
                setSource(normalized);
                setDestination(suggestDestinationPath(defaultPath, normalized));
                setStep(1);
              }
            }}
          />
        </>
      ) : (
        <>
          <Text color={colors.muted}>Save files to</Text>
          <TextInput
            key="destination-input"
            defaultValue={destination}
            placeholder="Destination folder"
            onChange={setDestination}
            onSubmit={() => void submit()}
            isDisabled={busy}
          />
          {busy ? (
            <Spinner label="Adding torrent and fetching metadata…" />
          ) : (
            <Text color={colors.subtle}>Enter add · Ctrl+B / Shift+Tab back · Esc cancel</Text>
          )}
        </>
      )}
    </DialogFrame>
  );
}

export function RemoveDialog({
  torrent,
  deleteData,
  onConfirm,
  onCancel,
}: {
  torrent: TorrentSnapshot;
  deleteData: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useInput((_input, key) => {
    if (key.escape) onCancel();
  });
  return (
    <DialogFrame title={deleteData ? 'Delete torrent and data' : 'Remove torrent'}>
      <Text>
        {deleteData ? 'Permanently delete downloaded files for ' : 'Remove '}
        <Text bold>{torrent.name}</Text>?
      </Text>
      {deleteData && <Text color={colors.error}>This cannot be undone by bittorrent-cli.</Text>}
      <Box marginTop={1}>
        <ConfirmInput defaultChoice="cancel" onConfirm={onConfirm} onCancel={onCancel} />
      </Box>
    </DialogFrame>
  );
}

export function FilesDialog({
  torrent,
  onSubmit,
  onCancel,
}: {
  torrent: TorrentSnapshot;
  onSubmit: (indices: number[]) => Promise<void>;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false);
  useInput((_input, key) => {
    if (key.escape && !busy) onCancel();
  });
  const options = torrent.files.map((file) => ({
    label: `${file.path}  ${formatBytes(file.length)}`,
    value: String(file.index),
  }));
  return (
    <DialogFrame title={`Select files · ${torrent.name}`}>
      <Text color={colors.muted}>Space toggles · Enter applies · Esc cancels</Text>
      {busy ? (
        <Spinner label="Applying file selection…" />
      ) : (
        <MultiSelect
          options={options}
          defaultValue={torrent.files
            .filter((file) => file.selected)
            .map((file) => String(file.index))}
          visibleOptionCount={Math.min(12, Math.max(4, options.length))}
          onSubmit={(values) => {
            setBusy(true);
            void onSubmit(values.map(Number)).finally(() => setBusy(false));
          }}
        />
      )}
    </DialogFrame>
  );
}

export function SearchDialog({
  onChange,
  onClose,
}: {
  onChange: (value: string) => void;
  onClose: () => void;
}) {
  useInput((_input, key) => {
    if (key.escape) onClose();
  });
  return (
    <DialogFrame title="Filter torrents">
      <TextInput
        placeholder="Name, hash, category, or tag"
        onChange={onChange}
        onSubmit={onClose}
      />
      <Text color={colors.subtle}>Enter keeps filter · Esc closes</Text>
    </DialogFrame>
  );
}

export function SettingsDialog({
  settings,
  onSubmit,
  onCancel,
}: {
  settings: ClientSettings;
  onSubmit: (update: Partial<ClientSettings>) => Promise<void>;
  onCancel: () => void;
}) {
  const [field, setField] = useState<'path' | 'download' | 'upload'>('path');
  const [path, setPath] = useState(settings.downloadPath);
  const [download, setDownload] = useState(limitToText(settings.downloadLimit));
  const [upload, setUpload] = useState(limitToText(settings.uploadLimit));
  const [busy, setBusy] = useState(false);
  useInput((_input, key) => {
    if (key.escape && !busy) onCancel();
  });
  const advance = () => {
    if (field === 'path') setField('download');
    else if (field === 'download') setField('upload');
    else {
      setBusy(true);
      void onSubmit({
        downloadPath: path,
        downloadLimit: textToLimit(download),
        uploadLimit: textToLimit(upload),
      }).finally(() => setBusy(false));
    }
  };
  return (
    <DialogFrame title="Settings · paths and global rate limits">
      {busy ? (
        <Spinner label="Saving settings…" />
      ) : (
        <>
          <Text color={field === 'path' ? colors.accent : colors.muted}>Default download path</Text>
          <TextInput
            defaultValue={path}
            onChange={setPath}
            onSubmit={advance}
            isDisabled={field !== 'path'}
          />
          <Text color={field === 'download' ? colors.accent : colors.muted}>
            Download limit (KiB/s, 0 = unlimited)
          </Text>
          <TextInput
            defaultValue={download}
            onChange={setDownload}
            onSubmit={advance}
            isDisabled={field !== 'download'}
          />
          <Text color={field === 'upload' ? colors.accent : colors.muted}>
            Upload limit (KiB/s, 0 = unlimited)
          </Text>
          <TextInput
            defaultValue={upload}
            onChange={setUpload}
            onSubmit={advance}
            isDisabled={field !== 'upload'}
          />
          <Text color={colors.subtle}>
            Enter next/save · Esc cancel · advanced options: bittorrent-cli config
          </Text>
        </>
      )}
    </DialogFrame>
  );
}

export function HelpDialog({ onClose }: { onClose: () => void }) {
  useInput(() => onClose());
  const rows = [
    ['j/k · ↑/↓', 'Move selection'],
    ['a', 'Add torrent'],
    ['Space', 'Pause / resume'],
    ['d / x', 'Remove / delete with data'],
    ['f', 'Choose files'],
    ['r', 'Force file recheck'],
    ['t', 'Toggle sequential / rarest-first'],
    ['o', 'Open download directory'],
    ['[ / ]', 'Cycle filters'],
    ['1–4', 'Switch detail tab'],
    ['/', 'Search'],
    ['s', 'Settings'],
    ['q', 'Detach UI; downloads continue'],
  ];
  return (
    <DialogFrame title="Keyboard reference">
      {rows.map(([keys, action]) => (
        <Box key={keys}>
          <Text bold color={colors.accent}>
            {keys?.padEnd(15)}
          </Text>
          <Text>{action}</Text>
        </Box>
      ))}
      <Box height={1} />
      <Text color={colors.subtle}>Press any key to close</Text>
    </DialogFrame>
  );
}

function limitToText(limit: number): string {
  return limit < 0 ? '0' : String(Math.round(limit / 1024));
}

function textToLimit(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 1024) : -1;
}
