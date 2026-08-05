# Changelog

All notable changes to this project will be documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project follows
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.1] - 2026-08-05

### Fixed

- Remove torrents by info hash instead of passing an incompatible runtime object to WebTorrent.
- Allow errored torrents to be removed after WebTorrent has already destroyed its internal torrent.

## [0.1.0] - 2026-08-05

### Added

- Initial full-screen BitTorrent client, background engine, headless commands, and tests.
