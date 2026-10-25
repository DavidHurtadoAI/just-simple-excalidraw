interface RegisteredFontFace {
  urls: (URL | string)[];
  fontFace: FontFace;
}
interface RegisteredFont { metadata: unknown; fontFaces: RegisteredFontFace[] }
/** Private bundle hook, inserted before any upstream module initialization. */
declare let __JSE_APPLY_CUSTOM_FONT__: (registry: Map<number, RegisteredFont>) => void;

export const MAX_FONT_BYTES = 2 * 1024 * 1024;

export function fontMime(path: string, bytes: ArrayBuffer): string {
  if (!bytes.byteLength || bytes.byteLength > MAX_FONT_BYTES) throw new Error("Custom fonts must be smaller than 2 MB.");
  const header = new Uint8Array(bytes, 0, Math.min(4, bytes.byteLength));
  const signature = String.fromCharCode(...header);
  const extension = path.split('.').pop()?.toLowerCase();
  if (extension === 'woff2' && signature === 'wOF2') return 'font/woff2';
  if (extension === 'woff' && signature === 'wOFF') return 'font/woff';
  if (extension === 'otf' && signature === 'OTTO') return 'font/otf';
  if (extension === 'ttf' && header.join(',') === '0,1,0,0') return 'font/ttf';
  throw new Error("Choose a valid WOFF2, WOFF, TTF or OTF font file inside this vault.");
}

export function setCustomFont(dataURI: string | undefined, loadedFace?: FontFace): void {
  __JSE_APPLY_CUSTOM_FONT__ = registry => {
    if (!dataURI) return;
    const current = registry.get(5);
    if (!current?.fontFaces.length || current.fontFaces[0].urls.includes(dataURI)) return;
    const Font = current.fontFaces[0].constructor as new (family: string, uri: string, descriptors: FontFaceDescriptors) => RegisteredFontFace;
    const replacement = new Font('Excalifont', dataURI, { unicodeRange: 'U+0-10FFFF' });
    for (const face of current.fontFaces) document.fonts.delete(face.fontFace);
    if (loadedFace) {
      replacement.fontFace = loadedFace;
      document.fonts.add(loadedFace);
    }
    registry.set(5, { ...current, fontFaces: [replacement] });
  };
}
