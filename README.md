# Just Simple Excalidraw

An intentionally small, local-first [Excalidraw](https://excalidraw.com/) editor
for Obsidian. It edits portable `.excalidraw` JSON files directly in the vault.

## What it does

- Creates and opens native `.excalidraw` drawings from the command palette or
  the ribbon.
- Uses the official Excalidraw editor with its standard drawing tools.
- Saves automatically after a short pause and writes images into the drawing as
  embedded data, so a drawing stays self-contained.
- Stops autosave if its file changes outside the open editor, avoiding silent
  overwrites.
- Reports malformed drawings without changing the original file.
- Follows Obsidian's light and dark theme.

It deliberately does **not** add Markdown embedding, OCR, AI, collaboration,
cloud sync, a drawing library, an account, or an export workflow.

## Privacy and permissions

Just Simple Excalidraw is local-first by design.

- **Network:** it makes no runtime network requests and includes all required
  Excalidraw font assets in the release bundle.
- **Vault files:** it reads and writes only the `.excalidraw` file you open or
  create in the vault.
- **Files outside the vault:** only an image explicitly chosen or pasted by you
  can be read; it is embedded into the active drawing. Images over 10 MiB are
  rejected.
- **Local storage:** an unsaved recovery copy may be held in Obsidian's local
  storage and is cleared after a successful save. It never leaves the device.
- **Telemetry, ads, accounts and payments:** none.

## Installation

### Community Plugins

Once accepted into the Obsidian Community directory, install it from
**Settings → Community plugins** and enable it.

### Manual installation

Download `main.js`, `manifest.json`, and `styles.css` from the matching GitHub
release. Put those three files in:

```text
<vault>/.obsidian/plugins/just-simple-excalidraw/
```

Then enable **Just Simple Excalidraw** in Obsidian.

## Use

Run **Nuevo dibujo Excalidraw** from the command palette, or use the pencil
ruler icon in the ribbon. The new file is created in the vault root using a
timestamped `Drawing YYYY-MM-DD HH.MM.SS.excalidraw` name.

## Development

Requires Node.js 22.13 or later and Corepack.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm run check
```

`pnpm run check` type-checks the plugin, makes a production bundle, embeds all
required font files, installs the built plugin into the local development vault,
and verifies that the distributable has no external font dependency.

For an editable development build:

```bash
pnpm run dev
```

## Release

Create a Git tag that exactly matches `manifest.json`'s version (for example,
`0.1.0`). The release workflow builds and attaches exactly `main.js`,
`manifest.json`, and `styles.css` to the GitHub release.

## License and acknowledgements

This project is licensed under the [MIT License](LICENSE). It bundles
Excalidraw, React, and their production dependencies under their respective
licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Excalidraw is an independent open-source project. This plugin is not affiliated
with or endorsed by Excalidraw.
