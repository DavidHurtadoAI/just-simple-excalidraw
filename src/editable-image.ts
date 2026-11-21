import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { BinaryFiles } from "@excalidraw/excalidraw/types";

type Library = typeof import("@excalidraw/excalidraw");
type ImageMime = "image/svg+xml" | "image/png";

export type EditableImage = { mime: ImageMime; bytes: ArrayBuffer };

export function editableImageMime(name: string): ImageMime | null {
  const lowerName = name.toLowerCase();
  if (lowerName.endsWith(".excalidraw.svg")) return "image/svg+xml";
  if (lowerName.endsWith(".excalidraw.png")) return "image/png";
  return null;
}

export function requireEmbeddedFiles(files: BinaryFiles): void {
  for (const file of Object.values(files)) {
    if (!/^data:image\/(?:png|jpeg|gif|webp|avif|svg\+xml|bmp|x-icon);base64,/i.test(file.dataURL)) {
      throw new Error("La escena contiene una imagen que no está incrustada como datos locales.");
    }
  }
}

export async function exportEditableImage(library: Library, mime: ImageMime, scene: {
  elements: readonly ExcalidrawElement[];
  backgroundColor: string;
  files: BinaryFiles;
}): Promise<ArrayBuffer> {
  requireEmbeddedFiles(scene.files);
  const options = {
    elements: scene.elements,
    files: scene.files,
    appState: { viewBackgroundColor: scene.backgroundColor, exportEmbedScene: true }
  };
  let image: Blob;
  if (mime === "image/svg+xml") {
    const svg = await library.exportToSvg({ ...options, renderEmbeddables: false });
    image = new Blob([new XMLSerializer().serializeToString(svg)], { type: mime });
  } else {
    // Stay within the 16-megapixel canvas limit on mobile browsers.
    image = await library.exportToBlob({ ...options, mimeType: mime, maxWidthOrHeight: 4096 });
  }
  // Excalidraw can return an SVG even when writing its scene metadata fails.
  await library.loadFromBlob(image, null, null);
  return image.arrayBuffer();
}
