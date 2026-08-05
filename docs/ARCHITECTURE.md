# Architecture

`bittorrent-cli` separates the long-lived protocol engine from every user interface.

```text
Ink TUI ───────┐
headless CLI ──┼── authenticated loopback JSON-RPC ── daemon ── WebTorrent ── swarm
future API ────┘                                      │
                                                      ├── settings.json
                                                      └── session.json
```

## Boundaries

- `src/core` owns WebTorrent, transfer policy, settings, atomic session persistence, and snapshots.
- `src/rpc` owns the one-request-per-connection loopback protocol. A 256-bit token in a mode-0600
  connection file prevents unrelated local processes from casually controlling the daemon.
- `src/ui` contains React/Ink components. It never imports WebTorrent and can be tested against a
  fake client.
- `src/cli` contains plain-text and JSON output for scripts.

The UI detaches on exit; the daemon continues downloading. The next invocation validates the
connection file with `ping` and removes it only if the endpoint is stale. Session writes use a
same-directory temporary file followed by an atomic rename.

## Protocol engine

WebTorrent supplies TCP/uTP peer transport, HTTP/UDP/WebSocket trackers, DHT, PEX, local discovery,
magnet metadata exchange, web seeds, NAT traversal, piece verification, disk storage, and seeding.
Application code layers on torrent/file selection, labels, transfer policies, persistence, alerts,
and observability.

## Design rules

1. Domain snapshots are serializable and contain no WebTorrent objects.
2. UI actions go through the same RPC surface as headless commands.
3. Filesystem writes are atomic where replacement is expected.
4. The daemon listens only on IPv4 loopback and rejects an invalid token.
5. High-frequency transfer updates are polled without overlapping requests.
