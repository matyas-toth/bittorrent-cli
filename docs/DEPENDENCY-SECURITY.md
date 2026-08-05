# Dependency security notes

## 2026-08-05: `ip` / GHSA-2p57-rm9w-gvfp

`npm audit` reports four high-severity entries that all collapse to one transitive dependency path:

```text
webtorrent → torrent-discovery → bittorrent-tracker → ip@2.0.1
```

The advisory concerns incorrect SSRF-oriented classification in `ip.isPublic()`. In the installed
`bittorrent-tracker@11.2.3` source, the `ip` package is imported only by the tracker-server UDP
parser and only `ip.toString()` is called. `bittorrent-cli` is a tracker client and does not create
that tracker-server code path. The vulnerable classification functions are therefore not called by
this application.

npm currently offers no patched compatible version and suggests downgrading WebTorrent to 0.7.3,
which is not a security- or compatibility-responsible fix. The finding is accepted temporarily,
documented here, and should be re-evaluated whenever WebTorrent or bittorrent-tracker is updated.
Do not add code that calls `ip.isPublic()` or `ip.isPrivate()` through this dependency.
