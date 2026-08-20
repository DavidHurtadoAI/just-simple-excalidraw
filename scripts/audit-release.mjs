import { access, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDirectory = path.join(projectDirectory, "dist");
const requiredFiles = ["main.js", "manifest.json", "styles.css", "LICENSE", "THIRD_PARTY_NOTICES.md"];
const syncStandardFileLimit = 5_000_000;

for (const file of requiredFiles) {
  await access(path.join(distDirectory, file));
}

const [main, styles, manifestText, source, sourceStyles, metadataText] = await Promise.all([
  readFile(path.join(distDirectory, "main.js"), "utf8"),
  readFile(path.join(distDirectory, "styles.css"), "utf8"),
  readFile(path.join(distDirectory, "manifest.json"), "utf8"),
  readFile(path.join(projectDirectory, "main.ts"), "utf8"),
  readFile(path.join(projectDirectory, "src", "styles.css"), "utf8"),
  readFile(path.join(projectDirectory, "build-meta.json"), "utf8")
]);
const manifest = JSON.parse(manifestText);
if (manifest.id !== "just-simple-excalidraw" || !manifest.version || !manifest.minAppVersion) {
  throw new Error("El manifest de distribución no contiene los metadatos mínimos esperados.");
}
if (main.includes("./fonts/") || styles.includes("./fonts/") || source.includes("EXCALIDRAW_ASSET_PATH")) {
  throw new Error("La distribución conserva una ruta de fuente local en vez de un recurso integrado.");
}
const embeddedLatinFont = (main.match(/const __JSE_LATIN_FONT__=/g) ?? []).length;
if (embeddedLatinFont !== 1 || styles.includes("data:font/woff2;base64,")) {
  throw new Error("La distribución debe incluir exactamente una fuente latina integrada y ninguna fuente CSS adicional.");
}
if (sourceStyles.includes("!important")) {
  throw new Error("The plugin stylesheet must not use !important.");
}
if (/createElement\(\s*["']script["']/.test(main)) {
  throw new Error("The bundle must not create dynamic <script> elements.");
}
if (/\b(fetch|XMLHttpRequest|WebSocket)\b/.test(source)) {
  throw new Error("El código fuente contiene una API de red que contradice la promesa de funcionamiento local.");
}
if (/node_modules\/\.pnpm\/(?:mermaid@|@mermaid-js\+|cytoscape@|katex@)/.test(metadataText.replaceAll("\\", "/"))) {
  throw new Error("El bundle sigue incluyendo dependencias de Mermaid que esta edición mínima no ofrece.");
}
const contents = await readdir(distDirectory, { withFileTypes: true });
if (contents.some((entry) => entry.name === "fonts" || entry.name === "THIRD_PARTY_LICENSES")) {
  throw new Error("La distribución conserva activos auxiliares que Obsidian Community Plugins no instala.");
}
const mainSize = (await stat(path.join(distDirectory, "main.js"))).size;
if (mainSize >= syncStandardFileLimit) {
  throw new Error(`main.js supera el límite de ${syncStandardFileLimit.toLocaleString("en-US")} bytes de Obsidian Sync Standard.`);
}
console.log(`Auditoría de release superada. main.js: ${(mainSize / 1_000_000).toFixed(2)} MB; una fuente latina integrada; sin Mermaid.`);
