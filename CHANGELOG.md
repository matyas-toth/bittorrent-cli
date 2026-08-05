# Changelog

All notable changes to this project will be documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project follows
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.3] - 2026-08-05

### Changed

- Rework the README installation and first-use guide around non-technical end users.

### Fixed

- Extract clean torrent names from Windows and POSIX file paths on every supported platform.

## [0.1.2] - 2026-08-05

### Added

- Record daemon heartbeats and enable Node.js diagnostic reports for abrupt-exit investigation.
- Reconnect the full-screen UI automatically after losing its daemon connection.

### Changed

- Retry read-only daemon requests once with a longer timeout, and log tracker problems as warnings.
- Prefill Add dialog destinations from magnet display names or `.torrent` filenames.
- Use `Ctrl+B` or `Shift+Tab` to return to the source step without stealing arrow keys.

### Fixed

- Mount a fresh destination input so torrent sources cannot leak into the destination field.
- Validate and create download directories before starting a torrent.

## [0.1.1] - 2026-08-05

### Fixed

- Remove torrents by info hash instead of passing an incompatible runtime object to WebTorrent.
- Allow errored torrents to be removed after WebTorrent has already destroyed its internal torrent.

## [0.1.0] - 2026-08-05

### Added

- Initial full-screen BitTorrent client, background engine, headless commands, and tests.
