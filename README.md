# bittorrent-cli

A persistent, full-screen BitTorrent client for people who live in the terminal. It combines an
[Ink](https://github.com/vadimdemedes/ink) interface with a background
[WebTorrent](https://github.com/webtorrent/webtorrent) engine, so closing the UI does **not** stop
active transfers.

> **Project status:** `0.1.2` is a functional alpha. The core download, upload, persistence, TUI,
> and automation surfaces work. See [Scope](#scope-and-honest-limitations) before relying on it as
> a drop-in replacement for a mature native client.

## Highlights

- Full-screen alternate-buffer TUI—no scrolling wall of progress output
- Keyboard-only torrent list, filters, live rates, ETA, ratio, peers, files, and trackers
- Persistent background daemon with automatic startup and session restoration
- Magnet URIs, `.torrent` files, info hashes, HTTP(S) torrent URLs, and multi-file torrents
- TCP/uTP peers, DHT, PEX, local peer discovery, trackers, web seeds, and NAT traversal
- Pause/resume, forced recheck, sequential or rarest-first pieces, and per-file selection
- Global download/upload limits plus configurable ratio and seeding-time goals
- Create `.torrent` files and seed local files or directories
- Categories, tags, JSON output, and unambiguous ID/hash/name selectors
- Atomic settings/session persistence and an authenticated loopback control API
- Windows, macOS, and Linux CI on supported Node.js LTS releases

## Requirements

- Node.js 22.12 or newer
- A Unicode-capable interactive terminal for the TUI

## Install

During development:

```sh
git clone <your-repository-url>
cd bittorrent-cli
npm install
npm run build
npm link
```

After the package is published:

```sh
npm install --global bittorrent-cli
```

## Use

Open the client:

```sh
bittorrent-cli
```

Open a torrent directly. The TUI asks for a destination before adding it:

```sh
bittorrent-cli ./MyCustomFile.torrent
bittorrent-cli 'magnet:?xt=urn:btih:…'
```

Use headless commands in scripts or over SSH:

```sh
bittorrent-cli add ./example.torrent --path ~/Downloads --paused
bittorrent-cli list
bittorrent-cli list --json
bittorrent-cli info 4b13a8c2
bittorrent-cli pause 4b13a8c2
bittorrent-cli resume 4b13a8c2
bittorrent-cli files 4b13a8c2
bittorrent-cli files 4b13a8c2 --select 0,2,3
bittorrent-cli mode 4b13a8c2 sequential
bittorrent-cli remove 4b13a8c2
bittorrent-cli remove 4b13a8c2 --delete-data
```

Create and seed a torrent:

```sh
bittorrent-cli create ./public-domain-video --output ./video.torrent \
  --announce udp://tracker.example.org:6969/announce
```

Inspect diagnostics and stop all transfers cleanly:

```sh
bittorrent-cli doctor
bittorrent-cli shutdown
```

Run `bittorrent-cli --help` or `bittorrent-cli <command> --help` for the complete command surface.

## Keyboard map

| Key                    | Action                                            |
| ---------------------- | ------------------------------------------------- |
| `j` / `k`, `↑` / `↓`   | Move through torrents                             |
| `a`                    | Add torrent or magnet URI                         |
| `Ctrl+B` / `Shift+Tab` | Return to the source step in the Add dialog       |
| `Space`                | Pause or resume                                   |
| `d`                    | Remove torrent, keep data                         |
| `x`                    | Remove torrent and delete data after confirmation |
| `f`                    | Select files in a multi-file torrent              |
| `r`                    | Rescan and verify files                           |
| `t`                    | Toggle sequential / rarest-first selection        |
| `o`                    | Open the download directory                       |
| `[` / `]`              | Cycle status filters                              |
| `1`–`4`                | Overview, files, peers, and trackers              |
| `/`                    | Search names, hashes, categories, and tags        |
| `s`                    | Settings                                          |
| `?`                    | In-app keyboard reference                         |
| `q`                    | Detach the UI; transfers continue                 |

## Configuration

Settings live in the platform-standard application config directory. View them with:

```sh
bittorrent-cli config
bittorrent-cli config --json
```

Change a setting with a kebab-case key:

```sh
bittorrent-cli config download-path /mnt/torrents
bittorrent-cli config download-limit 10485760
bittorrent-cli config upload-limit 1048576
bittorrent-cli config seed-ratio-limit 2
```

Rate values are bytes per second; `-1` means unlimited. The TUI settings dialog accepts KiB/s and
uses `0` for unlimited. DHT, PEX, LSD, NAT, uTP, connection limits, refresh rate, and seed policies
are also represented in the config schema. Network-stack changes take effect after
`bittorrent-cli shutdown` and the next automatic daemon start; rate changes apply immediately.

To isolate a portable/test instance, set `BITTORRENT_CLI_DATA_DIR` and
`BITTORRENT_CLI_CONFIG_DIR`.

Run `bittorrent-cli doctor` to locate the active data, configuration, log, and crash-report paths.
The daemon writes a five-second heartbeat while running; a surviving heartbeat is reported in the
log on the next start as evidence that the previous process did not shut down cleanly. Node.js
diagnostic reports for fatal runtime failures are stored below the reported crash-report path.

## How it works

The first command starts a detached daemon. Clients discover it through a mode-0600 connection
file containing a random 256-bit token and a loopback-only port. The daemon owns WebTorrent and
publishes serializable snapshots; the Ink UI and headless commands use exactly the same control
surface.

WebTorrent implements the protocol-heavy layers: peer wire traffic, metadata exchange, piece
verification and storage, tracker/DHT/PEX/LSD discovery, web seeds, uTP, and NAT mapping. This
project owns persistence, transfer policies, file/category/tag management, the daemon, and the
terminal experience. See [the architecture document](docs/ARCHITECTURE.md) for the boundaries.

## Scope and honest limitations

The target is qBittorrent-class day-to-day torrent management, but `0.1.2` does not yet reproduce
every libtorrent/qBittorrent feature. In particular, there is currently no RSS downloader/search
plugin system, proxy/VPN-interface binding, encrypted peer-transport policy, torrent queue
scheduler, alternate-rate schedule, embedded tracker, remote Web UI, IP-filter updater, or
super-seeding mode. Per-torrent bandwidth limits are also not exposed by WebTorrent's public API.

Those are application features—not reasons to compromise the working core. The daemon/RPC
architecture intentionally leaves room for them without coupling new policy to the TUI. Native
libtorrent remains an option for a future optional engine adapter if strict qBittorrent protocol
parity becomes more important than the current zero-build-tool JavaScript install.

## Development

```sh
npm run dev          # run from TypeScript
npm run typecheck
npm run lint
npm test
npm run build
npm run validate     # all release checks
```

Manual legal-torrent testing instructions are in [docs/TESTING.md](docs/TESTING.md). The project
uses synthetic unit fixtures and never contacts a public swarm during automated tests.

## Security and responsible use

BitTorrent exposes your network address to peers by design. This client is not an anonymity tool.
Only download or share material you have the legal right to distribute. Be especially careful with
`remove --delete-data`, which permanently removes the torrent's content through the storage layer.

Please report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).
The current transitive npm advisory and its reachability analysis are documented in
[docs/DEPENDENCY-SECURITY.md](docs/DEPENDENCY-SECURITY.md).

## Contributing

Issues and focused pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md), follow the
[Code of Conduct](CODE_OF_CONDUCT.md), and run `npm run validate` before submitting changes.

## License

[MIT](LICENSE)
