import assert from "node:assert/strict";
import { build } from "esbuild";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mocks = {
  obsidian: `
    export class TFile { constructor(path) { this.path = path; this.basename = path; } }
    globalThis.__themeTFile = TFile;
    export class FileView {
      constructor(leaf) { this.leaf = leaf; this.app = globalThis.__themeApp; this.contentEl = {empty(){},addClass(){}}; }
      registerEvent() {}
    }
    export class Plugin {
      registerView(type, factory) { globalThis.__themeViewFactory = factory; }
      loadData() { return Promise.resolve(null); } addSettingTab() {} registerExtensions() {} addCommand() {} addRibbonIcon() {}
    }
    export class PluginSettingTab {} export class Setting {} export const arrayBufferToBase64 = () => ""; export class Notice {} export class WorkspaceLeaf {}
    export const normalizePath = path => path;
  `,
  react: `
    export const createElement = (type, props) => ({type, props});
    export function useState(initial) {
      if (globalThis.__themeState === undefined) globalThis.__themeState = typeof initial === "function" ? initial() : initial;
      return [globalThis.__themeState, next => { globalThis.__themeState = next; }];
    }
    export function useEffect(effect) {
      if (!globalThis.__themeMounted) { globalThis.__themeMounted = true; globalThis.__themeCleanup = effect(); }
    }
  `,
  "react-dom/client": `
    export function createRoot() {
      return {
        render(element) { this.element = element; globalThis.__themeRoot = this; this.redraw(); },
        redraw() { globalThis.__themeProps = this.element.type(this.element.props).props; },
        unmount() { globalThis.__themeCleanup?.(); globalThis.__themeCleanup = undefined; }
      };
    }
  `,
  "@excalidraw/excalidraw": `
    export function Excalidraw() {}
    export const THEME = {LIGHT:"light",DARK:"dark"};
    export const serializeAsJSON = () => "";
  `
};
const bundle = await build({
  absWorkingDir: projectDirectory, entryPoints: [resolve(projectDirectory, "main.ts")],
  banner: { js: "let __JSE_APPLY_CUSTOM_FONT__ = () => {};" }, bundle: true, format: "esm", platform: "node", write: false,
  plugins: [{ name: "theme-runtime", setup(builder) {
    builder.onResolve({ filter: /.*/ }, args => args.path in mocks ? { path: args.path, namespace: "mock" } : undefined);
    builder.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ contents: mocks[args.path], loader: "js" }));
  } }]
});
globalThis.document = { body: { classList: { contains: name => name === "theme-dark" && globalThis.__themeDark } } };
globalThis.window = globalThis;
let connected = 0;
globalThis.MutationObserver = class {
  constructor(callback) { this.callback = callback; }
  observe() { connected++; globalThis.__themeObserver = this; }
  disconnect() { connected--; }
};
globalThis.__themeApp = { vault: { on() {}, async cachedRead() { return JSON.stringify({elements:[],appState:{},files:{}}); } } };
const { default: Plugin } = await import(`data:text/javascript,${encodeURIComponent(bundle.outputFiles[0].text)}`);
const plugin = new Plugin();
await plugin.onload();
let checks = 0;
for (const initialDark of [false, true]) {
  globalThis.__themeDark = initialDark;
  globalThis.__themeState = undefined;
  globalThis.__themeMounted = false;
  const view = globalThis.__themeViewFactory({});
  await view.onOpen();
  view.file = new globalThis.__themeTFile(`${initialDark}.excalidraw`);
  await view.onLoadFile(view.file);
  assert.equal(globalThis.__themeProps.theme, initialDark ? "dark" : "light", "The first paint must use the current host theme"); checks++;
  const initialData = globalThis.__themeProps.initialData;
  const onChange = globalThis.__themeProps.onChange;
  for (let index = 0; index < 20; index++) {
    globalThis.__themeDark = !globalThis.__themeDark;
    globalThis.__themeObserver.callback();
    globalThis.__themeRoot.redraw();
    assert.equal(globalThis.__themeProps.theme, globalThis.__themeDark ? "dark" : "light", "A host theme change must reach Excalidraw instead of being masked by stale props");
    assert.equal(globalThis.__themeProps.initialData, initialData, "A theme change must not replace the scene");
    assert.equal(globalThis.__themeProps.onChange, onChange, "A theme change must retain the file save callback");
    checks += 3;
  }
  await view.onClose();
  assert.equal(connected, 0, "Closing a view must disconnect its theme observer"); checks++;
}
console.log(`Theme regression checks passed: ${checks}.`);
