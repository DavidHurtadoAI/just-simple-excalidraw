import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { patchCustomFontRegistry } from './custom-font-registry.mjs';

const result = await build({ entryPoints: ['src/custom-font.ts'], bundle: true, format: 'esm', write: false });
const { fontMime, MAX_FONT_BYTES } = await import(`data:text/javascript,${encodeURIComponent(result.outputFiles[0].text)}`);
let checks = 0;
for (const [path, signature, mime] of [['Font.woff2','wOF2','font/woff2'],['font.WOFF','wOFF','font/woff'],['font.otf','OTTO','font/otf'],['font.ttf','\x00\x01\x00\x00','font/ttf']]) {
  const bytes = Uint8Array.from(signature, char => char.charCodeAt(0)).buffer;
  assert.equal(fontMime(path, bytes), mime); checks++;
  assert.throws(() => fontMime(path + '.txt', bytes)); checks++;
}
for (const bytes of [new ArrayBuffer(0),new ArrayBuffer(3),new ArrayBuffer(MAX_FONT_BYTES + 1),new Uint8Array([60,115,118,103]).buffer]) {
  assert.throws(() => fontMime('font.woff2', bytes)); checks++;
}
// Verify the actual production transform: only the handwriting family uses the
// optional font, its fallback stays embedded, and the library starts lazily.
const js = await readFile('main.js','utf8');
assert.match(js, /let __JSE_APPLY_CUSTOM_FONT__=/); checks++;
assert.match(js, /__JSE_APPLY_CUSTOM_FONT__\(/); checks++;
assert.equal((js.match(/data:font\/woff2;base64,[A-Za-z0-9+/]+=*"/g) ?? []).length, 1); checks++;
assert.ok(!js.includes('./fonts/')); checks++;
const upstream = await readFile('node_modules/@excalidraw/excalidraw/dist/prod/chunk-K2UTITRG.js','utf8');
assert.ok(patchCustomFontRegistry(upstream).includes('__JSE_APPLY_CUSTOM_FONT__')); checks++;
assert.throws(() => patchCustomFontRegistry('changed upstream')); checks++;
assert.throws(() => patchCustomFontRegistry(upstream + upstream)); checks++;
console.log(`Custom font validation checks passed: ${checks}.`);
