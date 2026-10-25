import { FileView, Notice, Plugin, PluginSettingTab, Setting, TFile, WorkspaceLeaf, arrayBufferToBase64, normalizePath } from "obsidian";
import { createElement, useEffect, useState, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { fontMime, setCustomFont } from "./src/custom-font";
// Initialize the library only after reading the optional vault font. Its font
// registry captures asset URIs on first initialization.
let drawingLibrary: typeof import("@excalidraw/excalidraw");
const THEME = { LIGHT: 'light', DARK: 'dark' } as const;
import type {
  AppState,
  BinaryFiles,
  ExcalidrawInitialDataState
} from "@excalidraw/excalidraw/types";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";

const VIEW_TYPE_EXCALIDRAW = "just-simple-excalidraw-view";
const AUTOSAVE_DELAY_MS = 750;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

type SceneSnapshot = {
  elements: readonly OrderedExcalidrawElement[];
  appState: AppState;
  files: BinaryFiles;
};

type PendingSave = {
  file: TFile;
  snapshot: SceneSnapshot;
};

type StoredScene = ExcalidrawInitialDataState & {
  files?: BinaryFiles;
};

type ExcalidrawCanvasProps = ComponentProps<typeof import("@excalidraw/excalidraw").Excalidraw>;

function emptyScene(): StoredScene {
  return { elements: [], appState: {}, files: {} };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStoredScene(value: unknown): value is StoredScene {
  if (!isRecord(value)) {
    return false;
  }

  const { elements, appState, files } = value;
  return Array.isArray(elements) && elements.every((element) =>
    isRecord(element) && typeof element.id === "string" && typeof element.type === "string"
  ) && isRecord(appState) && (files === undefined || (
    isRecord(files) && Object.values(files).every((file) =>
      isRecord(file) && typeof file.id === "string" && typeof file.mimeType === "string" && typeof file.dataURL === "string"
    )
  ));
}

function imageByteLength(dataURL: string): number {
  const commaIndex = dataURL.indexOf(",");
  const payloadLength = commaIndex === -1 ? dataURL.length : dataURL.length - commaIndex - 1;
  return Math.floor((payloadLength * 3) / 4);
}

function formatDrawingName(now: Date): string {
  const pad = (value: number): string => value.toString().padStart(2, "0");
  return `Drawing ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}.${pad(now.getMinutes())}.${pad(now.getSeconds())}`;
}

function ExcalidrawCanvas({ initialData, ...props }: ExcalidrawCanvasProps) {
  const [theme, setTheme] = useState<typeof THEME.LIGHT | typeof THEME.DARK>(() =>
    document.body.classList.contains("theme-dark") ? THEME.DARK : THEME.LIGHT
  );

  useEffect(() => {
    const updateTheme = (): void => setTheme(document.body.classList.contains("theme-dark") ? THEME.DARK : THEME.LIGHT);
    updateTheme();
    const observer = new MutationObserver(updateTheme);
    observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return createElement(drawingLibrary.Excalidraw, {
    initialData,
    theme,
    detectScroll: false,
    handleKeyboardGlobally: false,
    aiEnabled: false,
    validateEmbeddable: false,
    showDeprecatedFonts: false,
    UIOptions: {
      canvasActions: {
        clearCanvas: true,
        changeViewBackgroundColor: true,
        export: false,
        loadScene: false,
        saveToActiveFile: false,
        saveAsImage: false,
        toggleTheme: false
      },
      tools: { image: true }
    },
    generateIdForFile: (file: File): string => {
      if (file.size > MAX_IMAGE_BYTES) {
        throw new Error(`La imagen supera el límite de ${MAX_IMAGE_BYTES / 1024 / 1024} MB.`);
      }
      return crypto.randomUUID();
    },
    ...props
  });
}

export default class JustSimpleExcalidrawPlugin extends Plugin {
  private readonly fileOwners = new Map<TFile, ExcalidrawView>();
  fontPath = '';
  fontError = '';

  async onload(): Promise<void> {
    const saved: unknown = await this.loadData();
    this.fontPath = isRecord(saved) && typeof saved.fontPath === 'string' ? saved.fontPath : '';
    setCustomFont(undefined);
    if (this.fontPath) {
      try {
        const path = normalizePath(this.fontPath.trim());
        if (path.startsWith('/') || path.split('/').some(part => part === '..') || path.includes(':')) throw new Error('Use a font path relative to this vault.');
        // Plugin onload can precede the vault index. The adapter also supports
        // font extensions that Obsidian does not expose as TFiles.
        const stat = await this.app.vault.adapter.stat(path);
        if (stat?.type !== 'file' || stat.size > 2 * 1024 * 1024) throw new Error('Custom font not found in this vault, or larger than 2 MB.');
        const bytes = await this.app.vault.adapter.readBinary(path);
        const mime = fontMime(path, bytes);
        // A matching header is insufficient: let the browser validate the full
        // font before replacing the bundled face. Reuse the loaded face so the
        // native font cache cannot render the first frame with a fallback.
        const face = await new FontFace('Excalifont', bytes, { unicodeRange: 'U+0-10FFFF' }).load();
        setCustomFont(`data:${mime};base64,${arrayBufferToBase64(bytes)}`, face);
      } catch (error) {
        this.fontError = error instanceof Error ? error.message : String(error);
        new Notice(`Custom font could not be loaded; using Excalifont. ${this.fontError}`);
      }
    }
    drawingLibrary = await import("@excalidraw/excalidraw");
    this.addSettingTab(new ExcalidrawFontSettings(this.app, this));
    this.registerView(VIEW_TYPE_EXCALIDRAW, (leaf) => new ExcalidrawView(leaf, this));
    this.registerExtensions(["excalidraw"], VIEW_TYPE_EXCALIDRAW);

    this.addCommand({
      id: "new-excalidraw-drawing",
      name: "Create new Excalidraw drawing",
      callback: () => void this.createDrawing()
    });
    this.addRibbonIcon("pencil-ruler", "Create new Excalidraw drawing", () => void this.createDrawing());
  }

  async createDrawing(parentPath = ""): Promise<TFile> {
    const baseName = formatDrawingName(new Date());
    let sequence = 1;
    let path = normalizePath(`${parentPath ? `${parentPath}/` : ""}${baseName}.excalidraw`);

    while (this.app.vault.getAbstractFileByPath(path)) {
      sequence += 1;
      path = normalizePath(`${parentPath ? `${parentPath}/` : ""}${baseName} ${sequence}.excalidraw`);
    }

    const file = await this.app.vault.create(path, JSON.stringify({
      type: "excalidraw",
      version: 2,
      source: "just-simple-excalidraw",
      ...emptyScene()
    }, null, 2));
    await this.app.workspace.getLeaf("tab").openFile(file);
    return file;
  }

  claimFile(file: TFile, view: ExcalidrawView): boolean {
    const owner = this.fileOwners.get(file);
    if (owner && owner !== view) {
      return false;
    }
    this.fileOwners.set(file, view);
    return true;
  }

  getFileOwner(file: TFile): ExcalidrawView | null {
    return this.fileOwners.get(file) ?? null;
  }

  releaseFile(file: TFile, view: ExcalidrawView): void {
    if (this.fileOwners.get(file) === view) {
      this.fileOwners.delete(file);
    }
  }

  ownsFile(file: TFile, view: ExcalidrawView): boolean {
    return this.fileOwners.get(file) === view;
  }
}

class ExcalidrawFontSettings extends PluginSettingTab {
  constructor(app: Plugin['app'], private readonly plugin: JustSimpleExcalidrawPlugin) { super(app, plugin); }

  display(): void {
    this.containerEl.empty();
    new Setting(this.containerEl)
      .setName('Custom handwriting font')
      .setDesc('Optional path to a WOFF2, WOFF, TTF or OTF file in this vault (up to 2 MB). Replaces Excalifont. Restart Obsidian after changing it. Leave empty to restore Excalifont. Other users need the same font setting.')
      .addText(text => text.setPlaceholder('Fonts/My font.woff2').setValue(this.plugin.fontPath).onChange(async value => {
        this.plugin.fontPath = value.trim();
        const saved: unknown = await this.plugin.loadData();
        await this.plugin.saveData({ ...(isRecord(saved) ? saved : {}), fontPath: this.plugin.fontPath });
      }));
  }
}

class ExcalidrawView extends FileView {
  private root: Root | null = null;
  private autosaveTimer: number | null = null;
  private latestSnapshot: PendingSave | null = null;
  private activeFile: TFile | null = null;
  private ownsActiveFile = false;
  private loadGeneration = 0;
  private readonly writingFiles = new Set<TFile>();
  private externalChangeDetected = false;
  private readonly pendingSaves = new Set<Promise<void>>();

  constructor(readonly leaf: WorkspaceLeaf, private readonly plugin: JustSimpleExcalidrawPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_EXCALIDRAW;
  }

  getDisplayText(): string {
    return this.file?.basename ?? "Excalidraw";
  }

  async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass("just-simple-excalidraw-view");
    this.root = createRoot(this.contentEl);
    this.registerEvent(this.app.vault.on("modify", (file) => {
      if (file instanceof TFile && file === this.activeFile && !this.writingFiles.has(file)) {
        this.stopForExternalChange(file);
      }
    }));
  }

  async onLoadFile(file: TFile): Promise<void> {
    const loadGeneration = ++this.loadGeneration;
    const previousFile = this.activeFile;
    if (previousFile) {
      await this.flushSave(previousFile);
      if (previousFile !== file) {
        this.plugin.releaseFile(previousFile, this);
      }
    }

    const existingOwner = this.plugin.getFileOwner(file);
    if (existingOwner && existingOwner !== this) {
      this.activeFile = null;
      this.ownsActiveFile = false;
      this.externalChangeDetected = false;
      this.latestSnapshot = null;
      existingOwner.activate();
      this.leaf.detach();
      return;
    }

    this.activeFile = file;
    this.ownsActiveFile = this.plugin.claimFile(file, this);
    this.externalChangeDetected = false;
    this.latestSnapshot = null;
    this.recreateRoot();

    try {
      const parsed = JSON.parse(await this.app.vault.cachedRead(file)) as unknown;
      if (!this.isCurrentLoad(file, loadGeneration)) {
        return;
      }
      if (!isStoredScene(parsed)) {
        throw new Error("El archivo no contiene una escena Excalidraw válida.");
      }
      this.renderCanvas(file, parsed);
    } catch (error) {
      if (!this.isCurrentLoad(file, loadGeneration)) {
        return;
      }
      this.renderCorruptFileError(error instanceof Error ? error.message : "JSON inválido.");
    }
  }

  async onUnloadFile(file: TFile): Promise<void> {
    await this.flushSave(file);
    if (this.activeFile === file) {
      this.loadGeneration += 1;
      this.plugin.releaseFile(file, this);
      this.activeFile = null;
      this.ownsActiveFile = false;
      this.externalChangeDetected = false;
      this.unmountRoot();
    }
  }

  async onClose(): Promise<void> {
    await this.flushSave(this.activeFile);
    await Promise.all([...this.pendingSaves]);
    this.loadGeneration += 1;
    if (this.activeFile) {
      this.plugin.releaseFile(this.activeFile, this);
    }
    this.activeFile = null;
    this.ownsActiveFile = false;
    this.unmountRoot();
  }

  activate(): void {
    this.app.workspace.setActiveLeaf(this.leaf, { focus: true });
  }

  private isCurrentLoad(file: TFile, loadGeneration: number): boolean {
    return this.loadGeneration === loadGeneration && this.activeFile === file && this.file === file &&
      this.ownsActiveFile && this.plugin.ownsFile(file, this);
  }

  private recreateRoot(): void {
    this.unmountRoot();
    this.contentEl.empty();
    this.root = createRoot(this.contentEl);
  }

  private unmountRoot(): void {
    this.root?.unmount();
    this.root = null;
  }

  private renderCanvas(file: TFile, scene: StoredScene): void {
    if (!this.root) {
      return;
    }

    this.root.render(createElement(ExcalidrawCanvas, {
      key: file.path,
      initialData: scene,
      detectScroll: false,
      handleKeyboardGlobally: false,
      aiEnabled: false,
      UIOptions: {
        canvasActions: {
          clearCanvas: true,
          changeViewBackgroundColor: true,
          export: false,
          loadScene: false,
          saveToActiveFile: false,
          saveAsImage: false,
          toggleTheme: false
        },
        tools: { image: true }
      },
      generateIdForFile: (file: File): string => {
        if (file.size > MAX_IMAGE_BYTES) {
          throw new Error(`La imagen supera el límite de ${MAX_IMAGE_BYTES / 1024 / 1024} MB.`);
        }
        return crypto.randomUUID();
      },
      onPaste: (_data: unknown, event: ClipboardEvent | null): boolean => {
        const image = Array.from(event?.clipboardData?.files ?? []).find((file) => file.type.startsWith("image/"));
        if (image && image.size > MAX_IMAGE_BYTES) {
          new Notice(`La imagen supera el límite de ${MAX_IMAGE_BYTES / 1024 / 1024} MB y no se ha insertado.`);
          return true;
        }
        return false;
      },
      onChange: (elements: readonly OrderedExcalidrawElement[], appState: AppState, files: BinaryFiles): void => {
        this.queueSave(file, { elements, appState, files });
      }
    }));
  }

  private renderCorruptFileError(message: string): void {
    this.unmountRoot();
    this.contentEl.empty();
    const panel = this.contentEl.createDiv({ cls: "just-simple-excalidraw-error" });
    panel.createEl("h3", { text: "No se puede abrir este dibujo" });
    panel.createEl("p", { text: "El JSON parece estar dañado. El archivo original no se ha modificado." });
    panel.createEl("pre", { text: message });
    const button = panel.createEl("button", { text: "Crear un lienzo vacío aparte" });
    button.addEventListener("click", () => {
      void this.plugin.createDrawing(this.file?.parent?.path ?? "");
    });
  }

  private queueSave(file: TFile, snapshot: SceneSnapshot): void {
    if (this.externalChangeDetected || !this.ownsActiveFile || file !== this.activeFile || file !== this.file ||
      !this.plugin.ownsFile(file, this)) {
      return;
    }

    const oversized = Object.values(snapshot.files).find((file) => imageByteLength(file.dataURL) > MAX_IMAGE_BYTES);
    if (oversized) {
      new Notice(`La imagen «${oversized.id}» supera el límite de ${MAX_IMAGE_BYTES / 1024 / 1024} MB. El dibujo no se guardará hasta retirarla.`);
      return;
    }

    this.latestSnapshot = { file, snapshot };
    if (this.autosaveTimer !== null) {
      window.clearTimeout(this.autosaveTimer);
    }
    this.autosaveTimer = window.setTimeout(() => void this.flushSave(file), AUTOSAVE_DELAY_MS);
  }

  private async flushSave(file: TFile | null): Promise<void> {
    const pending = this.latestSnapshot;
    if (!file || !pending || pending.file !== file || (this.externalChangeDetected && file === this.activeFile)) {
      return;
    }

    if (this.autosaveTimer !== null) {
      window.clearTimeout(this.autosaveTimer);
      this.autosaveTimer = null;
    }
    this.latestSnapshot = null;
    const save = this.save(pending);
    this.pendingSaves.add(save);
    try {
      await save;
    } finally {
      this.pendingSaves.delete(save);
    }
  }

  private async save(pending: PendingSave): Promise<void> {
    this.writingFiles.add(pending.file);
    try {
      const document = drawingLibrary.serializeAsJSON(pending.snapshot.elements, pending.snapshot.appState, pending.snapshot.files, "local");
      await this.app.vault.modify(pending.file, document);
    } catch (error) {
      if (pending.file === this.activeFile && pending.file === this.file && !this.externalChangeDetected) {
        this.latestSnapshot = pending;
      }
      new Notice(`No se pudo guardar el dibujo: ${error instanceof Error ? error.message : "error desconocido"}`);
    } finally {
      this.writingFiles.delete(pending.file);
    }
  }

  private stopForExternalChange(file: TFile): void {
    if (this.externalChangeDetected || file !== this.activeFile) {
      return;
    }
    this.externalChangeDetected = true;
    if (this.autosaveTimer !== null) {
      window.clearTimeout(this.autosaveTimer);
      this.autosaveTimer = null;
    }
    new Notice("El archivo cambió fuera de esta vista. El autoguardado se ha detenido; cierra y vuelve a abrir la pestaña para cargar la versión nueva.", 0);
  }

}
