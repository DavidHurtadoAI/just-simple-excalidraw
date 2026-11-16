import { Component, Notice, type App, type Plugin, type TFile } from "obsidian";
import type { StoredScene } from "../main";

type Library = typeof import("@excalidraw/excalidraw");
type EmbedContext = { containerEl: HTMLElement };
type EmbedFactory = (context: EmbedContext, file: TFile) => DrawingPreview;
// The native registry handles link resolution, Source mode and the lifetime of
// embeds in both Reading view and Live Preview. It is an internal Obsidian API.
type EmbedRegistry = {
  embedByExtension: Record<string, EmbedFactory | undefined>;
  registerExtensions(extensions: string[], factory: EmbedFactory): void;
  unregisterExtensions(extensions: string[]): void;
};
type RenderDrawing = (file: TFile, dark: boolean) => Promise<string | null>;

const MAX_PREVIEW_BYTES = 16 * 1024 * 1024;
const MAX_ELEMENTS = 5000;
const MAX_POINTS = 50_000;
const MAX_COORDINATE = 1_000_000;
const MAX_PREVIEW_SIDE = 4096;

export function registerDrawingPreviews(plugin: Plugin, library: Library, isStoredScene: (data: unknown) => data is StoredScene): void {
  const app = plugin.app;
  const registry = (app as App & { embedRegistry?: EmbedRegistry }).embedRegistry;
  if (!registry?.embedByExtension || typeof registry.registerExtensions !== "function" ||
      typeof registry.unregisterExtensions !== "function" || registry.embedByExtension.excalidraw) return;

  const previews = new Set<DrawingPreview>();
  const render: RenderDrawing = async (file, dark) => {
    if (file.stat.size > MAX_PREVIEW_BYTES) throw new Error("Drawing is too large to preview.");
    const data: unknown = JSON.parse(await app.vault.read(file));
    if (!isStoredScene(data)) throw new Error("Invalid drawing.");
    return renderScene(library, data, dark);
  };
  const factory: EmbedFactory = ({ containerEl }, file) => new DrawingPreview(app, containerEl, file, render, previews);
  registry.registerExtensions(["excalidraw"], factory);
  plugin.register(() => {
    if (registry.embedByExtension.excalidraw === factory) registry.unregisterExtensions(["excalidraw"]);
    for (const preview of previews) preview.unload();
  });
}

async function renderScene(library: Library, scene: StoredScene, dark: boolean): Promise<string | null> {
  const source = scene.elements ?? [];
  if (source.length > MAX_ELEMENTS) throw new Error("Drawing is too large to preview.");
  let points = 0;
  for (const element of source) {
    if (element && "points" in element && Array.isArray(element.points)) points += element.points.length;
  }
  if (points > MAX_POINTS) throw new Error("Drawing is too large to preview.");
  const elements = library.getNonDeletedElements(library.restoreElements(source, null));
  if (!elements.length) return null;
  if (elements.some(element => [element.x, element.y, element.width, element.height].some(n => !Number.isFinite(n) || Math.abs(n) > MAX_COORDINATE))) {
    throw new Error("Invalid drawing dimensions.");
  }
  // The export may decode images. Pass only embedded image data to keep the
  // preview local even when someone has manually edited or imported the JSON.
  const files = Object.fromEntries(Object.entries(scene.files ?? {}).filter(([, file]) =>
    /^data:image\/(?:png|jpeg|gif|webp|avif|svg\+xml);base64,/i.test(file.dataURL)));
  const svg = await library.exportToSvg({
    elements,
    appState: {
      viewBackgroundColor: scene.appState?.viewBackgroundColor ?? "#ffffff",
      exportBackground: false,
      exportEmbedScene: false,
      exportWithDarkMode: dark
    },
    files,
    renderEmbeddables: false
  });
  const width = Number(svg.getAttribute("width"));
  const height = Number(svg.getAttribute("height"));
  if (!Number.isFinite(width + height) || width <= 0 || height <= 0) throw new Error("Invalid preview dimensions.");
  const scale = Math.min(1, MAX_PREVIEW_SIDE / Math.max(width, height));
  svg.setAttribute("width", String(Math.max(1, Math.round(width * scale))));
  svg.setAttribute("height", String(Math.max(1, Math.round(height * scale))));
  return new XMLSerializer().serializeToString(svg);
}

class DrawingPreview extends Component {
  private button: HTMLButtonElement | null = null;
  private version = "";
  private generation = 0;
  private imageUrl: string | null = null;

  constructor(
    private readonly app: App,
    private readonly container: HTMLElement,
    private readonly file: TFile,
    private readonly render: RenderDrawing,
    private readonly previews: Set<DrawingPreview>
  ) { super(); }

  onload(): void {
    this.previews.add(this);
    this.container.addClass("jse-drawing-embed");
    this.button = this.container.createEl("button", { cls: "jse-drawing-preview", attr: { type: "button" } });
    this.registerDomEvent(this.button, "click", event => {
      event.preventDefault();
      event.stopPropagation();
      void this.app.workspace.getLeaf("tab").openFile(this.file).catch(() => new Notice("Could not open the drawing."));
    });
    this.registerEvent(this.app.vault.on("modify", file => {
      if (file === this.file) { this.version = ""; this.loadFile(); }
    }));
    this.registerEvent(this.app.vault.on("rename", file => {
      if (file === this.file) this.loadFile();
    }));
    this.registerEvent(this.app.vault.on("delete", file => {
      if (file !== this.file || !this.button) return;
      ++this.generation;
      this.revokeImage();
      this.button.disabled = true;
      this.button.setText("Drawing missing.");
    }));
    this.registerEvent(this.app.workspace.on("css-change", () => this.loadFile()));
    this.loadFile();
  }

  loadFile(): void {
    const button = this.button;
    if (!button || button.disabled) return;
    const dark = this.container.doc.body.classList.contains("theme-dark");
    const { path, stat } = this.file;
    const version = `${path}\0${stat.mtime}\0${stat.size}\0${dark}`;
    if (version === this.version) return;
    this.version = version;
    button.setAttribute("aria-label", `Open drawing: ${this.file.basename}`);
    if (!this.imageUrl) button.setText("Loading drawing…");
    const generation = ++this.generation;
    void this.render(this.file, dark).then(svg => {
      if (generation !== this.generation) return;
      this.revokeImage();
      button.empty();
      if (!svg) { button.setText("Empty drawing. Click to edit."); return; }
      const url = this.imageUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
      // Display the export in an image context, isolated from the note's DOM.
      const image = button.createEl("img", { attr: { alt: "", decoding: "async", draggable: "false" } });
      const width = Number(this.container.getAttribute("width"));
      if (width > 0 && width <= MAX_PREVIEW_SIDE) image.width = width;
      image.onerror = () => {
        if (this.imageUrl !== url) return;
        this.revokeImage();
        button.setText("Could not preview drawing. Click to edit.");
      };
      image.src = url;
    }).catch(() => {
      if (generation !== this.generation) return;
      this.revokeImage();
      button.setText("Could not preview drawing. Click to edit.");
    });
  }

  setSubpath(): void { this.loadFile(); }

  onunload(): void {
    ++this.generation;
    this.version = "";
    this.revokeImage();
    this.button?.remove();
    this.button = null;
    this.container.removeClass("jse-drawing-embed");
    this.previews.delete(this);
  }

  private revokeImage(): void {
    if (!this.imageUrl) return;
    URL.revokeObjectURL(this.imageUrl);
    this.imageUrl = null;
  }
}
