# Testing with torrents

Unit tests never access the public BitTorrent network. For manual integration testing, create a
directory named `test-torrents/` in the repository root (it is intentionally git-ignored) and put
only legal, freely redistributable `.torrent` files there.

Recommended smoke test:

```sh
npm run build
npm link
bittorrent-cli test-torrents/example.torrent
```

Choose a temporary destination in the add dialog. Verify metadata, file selection, pause/resume,
recheck, restart restoration, download completion, and seeding. Then run:

```sh
bittorrent-cli list
bittorrent-cli info <id>
bittorrent-cli doctor
bittorrent-cli shutdown
```

Public-domain Linux distribution images are suitable test material. Do not add torrent payloads or
third-party `.torrent` files to git unless their redistribution terms explicitly permit it.
