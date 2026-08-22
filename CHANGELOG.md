# Changelog

All notable changes to this project are documented here.

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
