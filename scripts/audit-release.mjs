import { access, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDirectory = path.join(projectDirectory, "dist");
const requiredFiles = ["main.js", "manifest.json", "styles.css", "LICENSE", "THIRD_PARTY_NOTICES.md"];

for (const file of requiredFiles) {
  await access(path.join(distDirectory, file));
}

const [main, styles, manifestText, source] = await Promise.all([
  readFile(path.join(distDirectory, "main.js"), "utf8"),
  readFile(path.join(distDirectory, "styles.css"), "utf8"),
  readFile(path.join(distDirectory, "manifest.json"), "utf8"),
  readFile(path.join(projectDirectory, "main.ts"), "utf8")
]);
const manifest = JSON.parse(manifestText);
if (manifest.id !== "just-simple-excalidraw" || !manifest.version || !manifest.minAppVersion) {
  throw new Error("El manifest de distribución no contiene los metadatos mínimos esperados.");
}
if (main.includes("./fonts/") || styles.includes("./fonts/") || source.includes("EXCALIDRAW_ASSET_PATH")) {
  throw new Error("La distribución conserva una ruta de fuente local en vez de un recurso integrado.");
}
const javascriptFonts = (main.match(/data:font\/woff2;base64,/g) ?? []).length;
const cssFonts = (styles.match(/data:font\/woff2;base64,/g) ?? []).length;
if (javascriptFonts < 200 || cssFonts < 4) {
  throw new Error(`Faltan fuentes integradas (JavaScript: ${javascriptFonts}; CSS: ${cssFonts}).`);
}
if (/\b(fetch|XMLHttpRequest|WebSocket)\b/.test(source)) {
  throw new Error("El código fuente contiene una API de red que contradice la promesa de funcionamiento local.");
}
const contents = await readdir(distDirectory, { withFileTypes: true });
if (contents.some((entry) => entry.name === "fonts" || entry.name === "THIRD_PARTY_LICENSES")) {
  throw new Error("La distribución conserva activos auxiliares que Obsidian Community Plugins no instala.");
}
const sizeMiB = (await stat(path.join(distDirectory, "main.js"))).size / 1024 / 1024;
console.log(`Auditoría de release superada. main.js: ${sizeMiB.toFixed(2)} MiB; fuentes: JS ${javascriptFonts}, CSS ${cssFonts}.`);
