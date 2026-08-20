import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const releaseDirectory = path.join(projectDirectory, "dist");
const vaultPluginDirectory = path.resolve(projectDirectory, "..", "..", "@Nexus-dev", ".obsidian", "plugins", "just-simple-excalidraw");
const excalidrawDirectory = path.join(projectDirectory, "node_modules", "@excalidraw", "excalidraw", "dist", "prod");
const latinExcalifont = "Excalifont/Excalifont-Regular-a88b72a24fb54c9f94e3b5fdaa7481c9.woff2";

async function inlineSingleFont(content) {
  const pattern = /(["'])\.\/fonts\/([^"']+\.woff2)\1/g;
  const matches = [...content.matchAll(pattern)];
  if (matches.length === 0) {
    throw new Error("No se han encontrado referencias de fuentes de Excalidraw.");
  }

  const font = await readFile(path.join(excalidrawDirectory, "fonts", latinExcalifont));
  const dataUri = `data:font/woff2;base64,${font.toString("base64")}`;
  const compacted = content.replace(pattern, "__JSE_LATIN_FONT__");
  const strictDirective = '"use strict";';
  if (!compacted.startsWith(strictDirective)) {
    throw new Error("No se ha encontrado el encabezado esperado del bundle.");
  }
  const withFont = `${strictDirective}const __JSE_LATIN_FONT__=${JSON.stringify(dataUri)};${compacted.slice(strictDirective.length)}`;
  if (pattern.test(withFont)) {
    throw new Error("Quedan rutas de fuentes sin integrar.");
  }
  return { content: withFont, count: matches.length };
}

function removeCssFontFaces(content) {
  const pattern = /@font-face\s*\{[^{}]*\.\/fonts\/[^{}]*\}/g;
  const matches = [...content.matchAll(pattern)];
  if (matches.length === 0) {
    throw new Error("No se han encontrado reglas CSS de fuentes de Excalidraw.");
  }
  const compacted = content.replace(pattern, "");
  if (compacted.includes("./fonts/")) {
    throw new Error("Quedan rutas CSS de fuentes sin eliminar.");
  }
  return { content: compacted, count: matches.length };
}

async function removeDeprecatedArtifacts(targetDirectory) {
  await Promise.all([
    rm(path.join(targetDirectory, "fonts"), { recursive: true, force: true }),
    rm(path.join(targetDirectory, "LICENSE.md"), { force: true }),
    rm(path.join(targetDirectory, "THIRD_PARTY_LICENSES"), { recursive: true, force: true })
  ]);
}

async function buildDistribution(targetDirectory) {
  await mkdir(targetDirectory, { recursive: true });
  await removeDeprecatedArtifacts(targetDirectory);

  const bundledJavaScript = await readFile(path.join(projectDirectory, "main.js"), "utf8");
  const compactJavaScript = await inlineSingleFont(bundledJavaScript);
  await writeFile(path.join(targetDirectory, "main.js"), compactJavaScript.content, "utf8");
  await copyFile(path.join(projectDirectory, "manifest.json"), path.join(targetDirectory, "manifest.json"));
  await copyFile(path.join(projectDirectory, "LICENSE"), path.join(targetDirectory, "LICENSE"));
  await copyFile(path.join(projectDirectory, "THIRD_PARTY_NOTICES.md"), path.join(targetDirectory, "THIRD_PARTY_NOTICES.md"));

  const [excalidrawCss, localCss] = await Promise.all([
    readFile(path.join(excalidrawDirectory, "index.css"), "utf8"),
    readFile(path.join(projectDirectory, "src", "styles.css"), "utf8")
  ]);
  const compactStyles = removeCssFontFaces(excalidrawCss);
  await writeFile(path.join(targetDirectory, "styles.css"), `${compactStyles.content}\n\n${localCss}`, "utf8");
  console.log(`Bundle minimal: Mermaid excluido, ${compactJavaScript.count} referencias usan una fuente latina integrada y ${compactStyles.count} reglas CSS de fuente se han eliminado.`);
}

await buildDistribution(releaseDirectory);
await buildDistribution(vaultPluginDirectory);
