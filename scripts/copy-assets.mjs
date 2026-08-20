import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const releaseDirectory = path.join(projectDirectory, "dist");
const vaultPluginDirectory = path.resolve(projectDirectory, "..", "..", "@Nexus-dev", ".obsidian", "plugins", "just-simple-excalidraw");
const excalidrawDirectory = path.join(projectDirectory, "node_modules", "@excalidraw", "excalidraw", "dist", "prod");
const fontCache = new Map();

function fontDataUri(fileName) {
  if (!fontCache.has(fileName)) {
    fontCache.set(
      fileName,
      readFile(path.join(excalidrawDirectory, "fonts", fileName)).then((content) =>
        `data:font/woff2;base64,${content.toString("base64")}`
      )
    );
  }
  return fontCache.get(fileName);
}

async function inlineFontUrls(content, extension) {
  const pattern = extension === "js"
    ? /(["'])\.\/fonts\/([^"']+\.woff2)\1/g
    : /url\((["']?)\.\/fonts\/([^)'"\s]+\.woff2)\1\)/g;
  const matches = [...content.matchAll(pattern)];
  if (matches.length === 0) {
    throw new Error(`No se han encontrado fuentes de Excalidraw para integrar en ${extension}.`);
  }

  let inlined = content;
  for (const match of matches) {
    const dataUri = await fontDataUri(match[2]);
    const replacement = extension === "js" ? JSON.stringify(dataUri) : `url("${dataUri}")`;
    inlined = inlined.replace(match[0], replacement);
  }

  if (pattern.test(inlined)) {
    throw new Error(`Quedan rutas de fuentes sin integrar en ${extension}.`);
  }
  return { content: inlined, count: matches.length };
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
  const inlinedJavaScript = await inlineFontUrls(bundledJavaScript, "js");
  await writeFile(path.join(targetDirectory, "main.js"), inlinedJavaScript.content, "utf8");
  await copyFile(path.join(projectDirectory, "manifest.json"), path.join(targetDirectory, "manifest.json"));
  await copyFile(path.join(projectDirectory, "LICENSE"), path.join(targetDirectory, "LICENSE"));
  await copyFile(path.join(projectDirectory, "THIRD_PARTY_NOTICES.md"), path.join(targetDirectory, "THIRD_PARTY_NOTICES.md"));

  const [excalidrawCss, localCss] = await Promise.all([
    readFile(path.join(excalidrawDirectory, "index.css"), "utf8"),
    readFile(path.join(projectDirectory, "src", "styles.css"), "utf8")
  ]);
  const inlinedStyles = await inlineFontUrls(excalidrawCss, "css");
  await writeFile(path.join(targetDirectory, "styles.css"), `${inlinedStyles.content}\n\n${localCss}`, "utf8");
  console.log(`Fuentes integradas: ${inlinedJavaScript.count} en JavaScript y ${inlinedStyles.count} en CSS.`);
}

await buildDistribution(releaseDirectory);
await buildDistribution(vaultPluginDirectory);
