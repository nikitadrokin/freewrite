# freewrite

A minimal macOS app for freewriting. Open it, start typing, and let the rest fade away.

Entries autosave locally. A built-in timer helps you commit to a short writing session. Browse past entries in history when you want to revisit what you wrote.

## Install

Download the latest `.dmg` from [GitHub Releases](https://github.com/nikitadrokin/freewrite/releases/latest), drag **freewrite** into Applications, and open it.

Because the app is distributed outside the Mac App Store, macOS may block it on first launch. If you see a warning that the app is damaged or cannot be opened, clear the quarantine flag:

```bash
xattr -cr /Applications/freewrite.app
```

If Gatekeeper still refuses to open the app, re-sign it locally with an ad-hoc signature:

```bash
codesign --force --deep --sign - /Applications/freewrite.app
```

Replace the path if you installed the app somewhere other than `/Applications`.

The app checks for updates automatically on launch. You can also check manually from the footer.

## Development

### Prerequisites

- [Bun](https://bun.sh)
- [Rust](https://www.rust-lang.org/tools/install)
- macOS system dependencies for [Tauri](https://v2.tauri.app/start/prerequisites/)

### Setup

```bash
bun install
```

### Run locally

```bash
bun tauri dev
```

### Build

```bash
bun tauri build
```

Release artifacts land in `src-tauri/target/release/bundle/`.

### Publish a release

```bash
bun run release:tauri
```

Pass `--dry-run` to build without publishing. The script bumps the patch version (optional), builds signed updater artifacts, and creates a GitHub release.

## Stack

- [Tauri 2](https://v2.tauri.app/) + Rust
- React 19 + TypeScript + Vite
- SQLite for local entry storage

## License

No license file is included yet. All rights reserved unless otherwise noted.
