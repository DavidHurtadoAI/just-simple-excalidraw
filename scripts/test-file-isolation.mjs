import assert from "node:assert/strict";
import { build } from "esbuild";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const mocks = {
  obsidian: `
    export class TFile {
      constructor(path) {
        this.path = path;
        this.basename = path.split("/").pop().replace(/\\.excalidraw$/, "");
      }
    }
    globalThis.__testTFile = TFile;
    export class FileView {
      constructor() {
        this.file = null;
        this.app = globalThis.__testApp;
        this.contentEl = globalThis.__testContentEl;
      }
      registerEvent() {}
    }
    export class Plugin {
      constructor() {
        this.app = globalThis.__testApp;
      }
      registerView(_type, factory) {
        globalThis.__testViewFactory = factory;
      }
      registerExtensions() {}
      addCommand() {}
      addRibbonIcon() {}
    }
    export class Notice {
      constructor() {}
    }
    export class WorkspaceLeaf {}
    export function normalizePath(path) { return path; }
  `,
  react: `
    export function createElement(type, props) { return { type, props: props ?? {} }; }
    export function useEffect(effect) { effect(); }
    export function useState(value) { return [value, () => {}]; }
  `,
  "react-dom/client": `
    export function createRoot() {
      return {
        render(element) {
          let rendered = element;
          while (typeof rendered.type === "function" && !rendered.type.__testExcalidraw) {
            rendered = rendered.type(rendered.props);
          }
          if (rendered.type?.__testExcalidraw) {
            globalThis.__renderedCanvases.push(rendered.props);
          }
        },
        unmount() {}
      };
    }
  `,
  "@excalidraw/excalidraw": `
    export function Excalidraw() {}
    Excalidraw.__testExcalidraw = true;
    export const THEME = { LIGHT: "light", DARK: "dark" };
    export function serializeAsJSON(elements, appState, files) {
      return JSON.stringify({ elements, appState, files });
    }
  `
};

const mockedModules = new Set(Object.keys(mocks));
const bundle = await build({
  absWorkingDir: projectDirectory,
  entryPoints: [resolve(projectDirectory, "main.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
  plugins: [{
    name: "mock-plugin-runtime",
    setup(build) {
      build.onResolve({ filter: /.*/ }, (args) => {
        if (mockedModules.has(args.path)) {
          return { path: args.path, namespace: "mock" };
        }
        return undefined;
      });
      build.onLoad({ filter: /.*/, namespace: "mock" }, (args) => ({
        contents: mocks[args.path],
        loader: "js"
      }));
    }
  }]
});

const files = new Map([
  ["A.excalidraw", JSON.stringify({ elements: [{ id: "A-original" }], appState: {}, files: {} })],
  ["B.excalidraw", JSON.stringify({ elements: [{ id: "B-original" }], appState: {}, files: {} })]
]);
const writes = [];

globalThis.document = { body: { classList: { contains: () => false } } };
globalThis.window = globalThis;
globalThis.MutationObserver = class {
  observe() {}
  disconnect() {}
};
globalThis.__testContentEl = {
  empty() {},
  addClass() {},
  createDiv() {
    throw new Error("The regression test should not render an error panel.");
  }
};
globalThis.__renderedCanvases = [];
globalThis.__testApp = {
  vault: {
    on() { return {}; },
    async cachedRead(file) { return files.get(file.path); },
    async modify(file, document) {
      writes.push({ path: file.path, document });
      files.set(file.path, document);
    }
  },
  workspace: { getLeaf() { throw new Error("Not used by this test."); } }
};

const source = bundle.outputFiles[0].text;
const { default: JustSimpleExcalidrawPlugin } = await import(`data:text/javascript,${encodeURIComponent(source)}`);
const plugin = new JustSimpleExcalidrawPlugin();
await plugin.onload();

const view = globalThis.__testViewFactory(new (class {})());
await view.onOpen();

const fileA = new globalThis.__testTFile("A.excalidraw");
const fileB = new globalThis.__testTFile("B.excalidraw");

view.file = fileA;
await view.onLoadFile(fileA);
const canvasA = globalThis.__renderedCanvases.at(-1);
canvasA.onChange([{ id: "A-edited" }], {}, {});

view.file = fileB;
await view.onLoadFile(fileB);
const canvasB = globalThis.__renderedCanvases.at(-1);

assert.notEqual(canvasA, canvasB, "Opening another file must mount a new Excalidraw canvas.");
assert.deepEqual(canvasB.initialData.elements, [{ id: "B-original" }], "The second file must not inherit the first scene.");
assert.deepEqual(JSON.parse(writes[0].document).elements, [{ id: "A-edited" }], "The pending save for A must write to A.");
assert.equal(writes[0].path, "A.excalidraw");

canvasA.onChange([{ id: "stale-A" }], {}, {});
assert.equal(writes.length, 1, "A stale callback must not queue a save for the active file.");

canvasB.onChange([{ id: "B-edited" }], {}, {});
await view.onUnloadFile(fileA);
await view.onUnloadFile(fileB);

assert.equal(writes.length, 2);
assert.equal(writes[1].path, "B.excalidraw");
assert.deepEqual(JSON.parse(writes[1].document).elements, [{ id: "B-edited" }]);

console.log("File isolation regression test passed.");
