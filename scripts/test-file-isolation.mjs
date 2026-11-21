import assert from "node:assert/strict";
import { build } from "esbuild";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const mocks = {
  obsidian: `
    export class Component {}
    export class TFile {
      constructor(path) {
        this.path = path;
        this.name = path.split("/").pop();
        this.basename = this.name.replace(/\\.excalidraw$/, "");
      }
    }
    globalThis.__testTFile = TFile;
    export class FileView {
      constructor(leaf) {
        this.leaf = leaf;
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
      loadData() { return Promise.resolve(null); } addSettingTab() {} registerExtensions() {}
      addCommand() {}
      addRibbonIcon() {}
      registerEvent() {}
    }
    export class PluginSettingTab {} export class Setting {} export const arrayBufferToBase64 = () => ""; export class Notice {
      constructor() {}
    }
    export class WorkspaceLeaf {
      constructor() { this.detached = false; }
      detach() { this.detached = true; }
    }
    globalThis.__testWorkspaceLeaf = WorkspaceLeaf;
    export function normalizePath(path) { return path; }
  `,
  react: `
    export function createElement(type, props) { return { type, props: props ?? {} }; }
    export function useEffect(effect) { effect(); }
    export function useState(value) { return [typeof value === "function" ? value() : value, () => {}]; }
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
    export async function loadFromBlob(blob) {
      return JSON.parse(await blob.text());
    }
    export async function exportToBlob(options) {
      await globalThis.__delayImageExport;
      return new Blob([JSON.stringify(options)], { type: options.mimeType });
    }
  `
};

const mockedModules = new Set(Object.keys(mocks));
const bundle = await build({
  absWorkingDir: projectDirectory,
  entryPoints: [resolve(projectDirectory, "main.ts")],
  banner: { js: "let __JSE_APPLY_CUSTOM_FONT__ = () => {};" }, bundle: true,
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
  ["A.excalidraw", JSON.stringify({ elements: [{ id: "A-original", type: "rectangle" }], appState: {}, files: {} })],
  ["B.excalidraw", JSON.stringify({ elements: [{ id: "B-original", type: "rectangle" }], appState: {}, files: {} })],
  ["C.excalidraw", JSON.stringify({ elements: [{ id: "C-original", type: "rectangle" }], appState: {}, files: {} })],
  ["D.excalidraw", JSON.stringify({ elements: [{ id: "D-original", type: "rectangle" }], appState: {}, files: {} })],
  ["E.excalidraw", JSON.stringify({ elements: [{ id: "E-original", type: "rectangle" }], appState: {}, files: {} })],
  ["Malformed.excalidraw", JSON.stringify({ elements: [{ id: "missing-type" }], appState: {}, files: {} })]
]);
const writes = [];
const delayedReads = new Map();
const images = new Map();

globalThis.document = { body: { classList: { contains: () => false } } };
globalThis.window = globalThis;
globalThis.MutationObserver = class {
  observe() {}
  disconnect() {}
};
globalThis.__testContentEl = {
  empty() { this.saveButton = null; },
  addClass() {},
  querySelector() { return this.saveButton; },
  createDiv() {
    return {
      createDiv: () => this.createDiv(),
      createEl: (_tag, options) => {
        const element = { addEventListener(_type, listener) { this.click = listener; } };
        if (options?.text === "Save image") this.saveButton = element;
        return element;
      }
    };
  }
};
globalThis.__renderedCanvases = [];
globalThis.__testApp = {
  vault: {
    on() { return {}; },
    async cachedRead(file) { return delayedReads.get(file.path) ?? files.get(file.path); },
    async modify(file, document) {
      writes.push({ path: file.path, document });
      files.set(file.path, document);
    },
    async readBinary(file) { return images.get(file.path); },
    async modifyBinary(file, bytes) {
      writes.push({ path: file.path, bytes });
      images.set(file.path, bytes);
    }
  },
  workspace: {
    on(_name, listener) { this.fileMenu = listener; },
    getLeaf() { return { setViewState: async (state) => { this.openedState = state; } }; },
    setActiveLeaf(leaf, options) { globalThis.__activeLeaf = { leaf, options }; }
  }
};

const source = bundle.outputFiles[0].text;
const { default: JustSimpleExcalidrawPlugin } = await import(`data:text/javascript,${encodeURIComponent(source)}`);
const plugin = new JustSimpleExcalidrawPlugin();
await plugin.onload();

const view = globalThis.__testViewFactory(new (class {})());
await view.onOpen();

const fileA = new globalThis.__testTFile("A.excalidraw");
const fileB = new globalThis.__testTFile("B.excalidraw");
const fileC = new globalThis.__testTFile("C.excalidraw");
const fileD = new globalThis.__testTFile("D.excalidraw");
const fileE = new globalThis.__testTFile("E.excalidraw");
const malformedFile = new globalThis.__testTFile("Malformed.excalidraw");

view.file = fileA;
await view.onLoadFile(fileA);
const canvasA = globalThis.__renderedCanvases.at(-1);
canvasA.onChange([{ id: "A-edited", type: "rectangle" }], {}, {});

view.file = fileB;
await view.onLoadFile(fileB);
const canvasB = globalThis.__renderedCanvases.at(-1);

assert.notEqual(canvasA, canvasB, "Opening another file must mount a new Excalidraw canvas.");
assert.deepEqual(canvasB.initialData.elements, [{ id: "B-original", type: "rectangle" }], "The second file must not inherit the first scene.");
assert.deepEqual(JSON.parse(writes[0].document).elements, [{ id: "A-edited", type: "rectangle" }], "The pending save for A must write to A.");
assert.equal(writes[0].path, "A.excalidraw");

canvasA.onChange([{ id: "stale-A", type: "rectangle" }], {}, {});
assert.equal(writes.length, 1, "A stale callback must not queue a save for the active file.");

canvasB.onChange([{ id: "B-edited", type: "rectangle" }], {}, {});
await view.onUnloadFile(fileA);
await view.onUnloadFile(fileB);

assert.equal(writes.length, 2);
assert.equal(writes[1].path, "B.excalidraw");
assert.deepEqual(JSON.parse(writes[1].document).elements, [{ id: "B-edited", type: "rectangle" }]);

let resolveDelayedRead;
delayedReads.set("C.excalidraw", new Promise((resolve) => {
  resolveDelayedRead = resolve;
}));
view.file = fileC;
const delayedLoad = view.onLoadFile(fileC);

view.file = fileE;
await view.onLoadFile(fileE);
const canvasE = globalThis.__renderedCanvases.at(-1);
resolveDelayedRead(files.get("C.excalidraw"));
await delayedLoad;

assert.equal(globalThis.__renderedCanvases.at(-1), canvasE, "A stale read must not replace the current canvas.");
await view.onUnloadFile(fileE);

delayedReads.delete("C.excalidraw");
view.file = fileC;
await view.onLoadFile(fileC);
const canvasC = globalThis.__renderedCanvases.at(-1);
canvasC.onChange([{ id: "C-edited", type: "rectangle" }], {}, {});
await view.onLoadFile(fileC);

assert.equal(writes.at(-1).path, "C.excalidraw", "Reloading the same file must flush its pending snapshot.");
assert.deepEqual(JSON.parse(writes.at(-1).document).elements, [{ id: "C-edited", type: "rectangle" }]);
await view.onUnloadFile(fileC);

const ownerLeaf = new globalThis.__testWorkspaceLeaf();
const duplicateLeaf = new globalThis.__testWorkspaceLeaf();
const ownerView = globalThis.__testViewFactory(ownerLeaf);
const duplicateView = globalThis.__testViewFactory(duplicateLeaf);
await ownerView.onOpen();
await duplicateView.onOpen();
ownerView.file = fileD;
await ownerView.onLoadFile(fileD);
const canvasD = globalThis.__renderedCanvases.at(-1);
canvasD.onChange([{ id: "D-edited", type: "rectangle" }], {}, {});
const canvasesBeforeDuplicate = globalThis.__renderedCanvases.length;
duplicateView.file = fileD;
await duplicateView.onLoadFile(fileD);

assert.equal(globalThis.__renderedCanvases.length, canvasesBeforeDuplicate, "A second view of the same file must not become editable.");
assert.deepEqual(globalThis.__activeLeaf, { leaf: ownerLeaf, options: { focus: true } }, "Opening an already-open drawing must focus its existing tab.");
assert.equal(duplicateLeaf.detached, true, "The duplicate tab must be removed instead of showing a concurrent-editor error.");
await ownerView.onUnloadFile(fileD);
assert.equal(writes.at(-1).path, "D.excalidraw");
assert.deepEqual(JSON.parse(writes.at(-1).document).elements, [{ id: "D-edited", type: "rectangle" }]);
await duplicateView.onUnloadFile(fileD);

const canvasesBeforeMalformedFile = globalThis.__renderedCanvases.length;
view.file = malformedFile;
await view.onLoadFile(malformedFile);
assert.equal(globalThis.__renderedCanvases.length, canvasesBeforeMalformedFile, "Malformed scene data must not mount an editable canvas.");
await view.onUnloadFile(malformedFile);

const { workspace } = globalThis.__testApp;
const menuItems = [];
const menu = { addItem(configure) {
  configure({ setTitle(title) { this.title = title; return this; }, setIcon() { return this; }, onClick(open) { menuItems.push({ title: this.title, open }); } });
} };
const image = new globalThis.__testTFile("Image.EXCALIDRAW.PNG");
workspace.fileMenu(menu, new globalThis.__testTFile("plain.png"));
workspace.fileMenu(menu, image);
assert.deepEqual(menuItems.map(item => item.title), ["Open in Just Simple Excalidraw"]);
menuItems[0].open();
assert.deepEqual(workspace.openedState, { type: "just-simple-excalidraw-view", state: { file: image.path }, active: true });

const initialImage = new TextEncoder().encode(JSON.stringify({ elements: [], appState: {}, files: {} })).buffer;
images.set(image.path, initialImage);
view.file = image;
await view.onLoadFile(image);
const imageCanvas = globalThis.__renderedCanvases.at(-1);
const saveButton = globalThis.__testContentEl.saveButton;
imageCanvas.excalidrawAPI({
  getSceneElements: () => [{ id: "edited-image", type: "rectangle" }],
  getAppState: () => ({ viewBackgroundColor: "#ffffff" }),
  getFiles: () => ({})
});
assert.equal(imageCanvas.onChange, undefined, "Image editors must not autosave.");
assert.equal(images.get(image.path), initialImage);
saveButton.click();
await view.imageSave;
const savedImage = JSON.parse(new TextDecoder().decode(images.get(image.path)));
assert.equal(savedImage.elements[0].id, "edited-image");
assert.equal(savedImage.appState.exportEmbedScene, true);
assert.equal(savedImage.mimeType, "image/png");

let finishExport;
globalThis.__delayImageExport = new Promise(resolve => { finishExport = resolve; });
saveButton.click();
const previousWriteCount = writes.length;
images.set(image.path, initialImage);
finishExport();
await view.imageSave;
assert.equal(writes.length, previousWriteCount, "An image changed externally during export must not be overwritten.");
assert.equal(saveButton.disabled, true);
await view.onUnloadFile(image);

console.log("File isolation regression test passed.");
