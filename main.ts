import { FileView, Notice, Plugin, TFile, WorkspaceLeaf, normalizePath } from "obsidian";
import { createElement, useEffect, useState, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  Excalidraw,
  serializeAsJSON,
  THEME
} from "@excalidraw/excalidraw";
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

type StoredScene = ExcalidrawInitialDataState & {
  files?: BinaryFiles;
};

type ExcalidrawCanvasProps = ComponentProps<typeof Excalidraw>;

function emptyScene(): StoredScene {
  return { elements: [], appState: {}, files: {} };
}

function isStoredScene(value: unknown): value is StoredScene {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const scene = value as Record<string, unknown>;
  return Array.isArray(scene.elements) && typeof scene.appState === "object" && scene.appState !== null &&
    (scene.files === undefined || (typeof scene.files === "object" && scene.files !== null));
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
  const [theme, setTheme] = useState<typeof THEME.LIGHT | typeof THEME.DARK>(THEME.LIGHT);

  useEffect(() => {
    const updateTheme = (): void => setTheme(document.body.classList.contains("theme-dark") ? THEME.DARK : THEME.LIGHT);
    updateTheme();
    const observer = new MutationObserver(updateTheme);
    observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return createElement(Excalidraw, {
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
  async onload(): Promise<void> {
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
}

class ExcalidrawView extends FileView {
  private root: Root | null = null;
  private autosaveTimer: number | null = null;
  private latestSnapshot: SceneSnapshot | null = null;
  private writing = false;
  private externalChangeDetected = false;
  private saveInProgress: Promise<void> | null = null;

  constructor(leaf: WorkspaceLeaf, private readonly plugin: JustSimpleExcalidrawPlugin) {
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
      if (file === this.file && !this.writing) {
        this.stopForExternalChange();
      }
    }));
  }

  async onLoadFile(file: TFile): Promise<void> {
    try {
      const parsed = JSON.parse(await this.app.vault.cachedRead(file)) as unknown;
      if (!isStoredScene(parsed)) {
        throw new Error("El archivo no contiene una escena Excalidraw válida.");
      }
      this.renderCanvas(parsed);
    } catch (error) {
      this.renderCorruptFileError(error instanceof Error ? error.message : "JSON inválido.");
    }
  }

  async onUnloadFile(): Promise<void> {
    await this.flushSave();
    this.clearRecovery();
  }

  async onClose(): Promise<void> {
    await this.flushSave();
    this.root?.unmount();
    this.root = null;
  }

  private renderCanvas(scene: StoredScene): void {
    if (!this.root) {
      return;
    }

    this.root.render(createElement(ExcalidrawCanvas, {
      initialData: scene,
      theme: document.body.classList.contains("theme-dark") ? THEME.DARK : THEME.LIGHT,
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
        this.queueSave({ elements, appState, files });
      }
    }));
  }

  private renderCorruptFileError(message: string): void {
    this.root?.unmount();
    this.root = null;
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

  private queueSave(snapshot: SceneSnapshot): void {
    if (this.externalChangeDetected) {
      return;
    }

    const oversized = Object.values(snapshot.files).find((file) => imageByteLength(file.dataURL) > MAX_IMAGE_BYTES);
    if (oversized) {
      new Notice(`La imagen «${oversized.id}» supera el límite de ${MAX_IMAGE_BYTES / 1024 / 1024} MB. El dibujo no se guardará hasta retirarla.`);
      return;
    }

    this.latestSnapshot = snapshot;
    this.writeRecovery(snapshot);
    if (this.autosaveTimer !== null) {
      window.clearTimeout(this.autosaveTimer);
    }
    this.autosaveTimer = window.setTimeout(() => void this.flushSave(), AUTOSAVE_DELAY_MS);
  }

  private async flushSave(): Promise<void> {
    if (this.autosaveTimer !== null) {
      window.clearTimeout(this.autosaveTimer);
      this.autosaveTimer = null;
    }
    if (!this.latestSnapshot || !this.file || this.externalChangeDetected) {
      return;
    }

    const snapshot = this.latestSnapshot;
    this.latestSnapshot = null;
    this.saveInProgress = this.save(snapshot);
    await this.saveInProgress;
    this.saveInProgress = null;
  }

  private async save(snapshot: SceneSnapshot): Promise<void> {
    if (!this.file) {
      return;
    }
    this.writing = true;
    try {
      const document = serializeAsJSON(snapshot.elements, snapshot.appState, snapshot.files, "local");
      await this.app.vault.modify(this.file, document);
      this.clearRecovery();
    } catch (error) {
      this.latestSnapshot = snapshot;
      new Notice(`No se pudo guardar el dibujo: ${error instanceof Error ? error.message : "error desconocido"}`);
    } finally {
      this.writing = false;
    }
  }

  private stopForExternalChange(): void {
    if (this.externalChangeDetected) {
      return;
    }
    this.externalChangeDetected = true;
    if (this.autosaveTimer !== null) {
      window.clearTimeout(this.autosaveTimer);
      this.autosaveTimer = null;
    }
    new Notice("El archivo cambió fuera de esta vista. El autoguardado se ha detenido; cierra y vuelve a abrir la pestaña para cargar la versión nueva.", 0);
  }

  private recoveryKey(): string | null {
    return this.file ? `${this.plugin.manifest.id}:recovery:${this.file.path}` : null;
  }

  private writeRecovery(snapshot: SceneSnapshot): void {
    const key = this.recoveryKey();
    if (!key) {
      return;
    }
    try {
      window.localStorage.setItem(key, serializeAsJSON(snapshot.elements, snapshot.appState, snapshot.files, "local"));
    } catch {
      // Recovery is best effort. Vault persistence remains the source of truth.
    }
  }

  private clearRecovery(): void {
    const key = this.recoveryKey();
    if (key) {
      window.localStorage.removeItem(key);
    }
  }
}
