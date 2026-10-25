# Changelog

All notable changes to this project are documented here.

## 0.1.11 - 2026-10-25

- Add an optional custom handwriting font loaded from a vault-relative WOFF2, WOFF, TTF or OTF file up to 2 MB. Restart Obsidian after changing the font setting.
- Validate the full font before use and fall back to bundled Excalifont for missing, invalid, oversized or outside-vault paths. Other devices need the same font file and setting; drawings remain standard Excalidraw JSON.
- Follow changes to Obsidian's light/dark theme without replacing the drawing.
- Update vulnerable sanitizer/source-map dependencies and compatible build/API dependencies while retaining the validated React 18 stack.
- Keep the release below 5 MB with one bundled Latin fallback, no Mermaid, no remote font loading and the existing file-isolation/save protections.

Validated with file-isolation and environment regressions, 124 theme assertions, 36 font startup/fallback checks, 19 font/build-adapter checks, release audit and real Obsidian drawing/font tests. No physical mobile device test was performed.

## 0.1.10 - 2026-09-19

- Removed the unused Firebase configuration and Google API key inherited from
  the upstream Excalidraw package, which could trigger corporate secret scanners.
- Added build regression tests and release checks to prevent Google API keys
  or the unused Firebase configuration from reappearing in published bundles.

## 0.1.9 - 2026-08-27

- Added support for Obsidian on phones and tablets.
- Added a release audit that rejects desktop-only manifests and runtime Node.js
  or Electron dependencies.

## 0.1.7 - 2026-08-22

- Prevented stale asynchronous file loads from replacing the current canvas.
- Prevented concurrent editing of the same drawing in multiple plugin tabs.
- Saved pending changes before reloading the same drawing and strengthened scene
  validation before an editor is mounted.

## 0.1.6 - 2026-08-22

- Fixed a critical data-loss bug that could overwrite a drawing with the scene
  from a previously opened file when switching files in the same tab.
- Added a regression test that verifies scenes and autosaves remain isolated
  to their own files.

## 0.1.3 - 2026-08-20

- Made npm and its committed `package-lock.json` the canonical reproducible
  build environment used both locally and in GitHub Actions.

## 0.1.2 - 2026-08-20

- Removed the redundant word “Obsidian” from the plugin manifest description.
- Added GitHub artifact attestations for `main.js` and `styles.css`.
- Removed unused web-storage recovery and Excalidraw's dynamic error-constructor helper.

## 0.1.1 - 2026-08-20

- Rebuilt the editor without Mermaid conversion and its dependency tree.
- Reduced the release `main.js` from 24.62 MB to under 5 MB for Obsidian Sync
  Standard compatibility.
- Replaced the full font collection with one embedded Excalifont subset for
  Latin characters.

## 0.1.0 - 2026-08-20

- First public release.
- Local Excalidraw editor for native `.excalidraw` files.
- Autosave, conflict protection, embedded images, local recovery and offline
  packaged font assets.
