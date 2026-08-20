import esbuild from "esbuild";
import process from "node:process";
import path from "node:path";
import { builtinModules } from "node:module";
import { fileURLToPath } from "node:url";
import { writeFile } from "node:fs/promises";

const production = process.argv[2] === "production";
const projectDirectory = path.dirname(fileURLToPath(import.meta.url));
const excalidrawProductionEntry = path.join(projectDirectory, "node_modules", "@excalidraw", "excalidraw", "dist", "prod", "index.js");

const context = await esbuild.context({
  absWorkingDir: projectDirectory,
  entryPoints: [path.join(projectDirectory, "main.ts")],
  bundle: true,
  alias: {
    "@excalidraw/excalidraw": excalidrawProductionEntry,
    "@excalidraw/mermaid-to-excalidraw": path.join(projectDirectory, "src", "mermaid-disabled.ts")
  },
  external: ["obsidian", "electron", ...builtinModules],
  format: "cjs",
  target: "es2022",
  platform: "browser",
  minify: production,
  sourcemap: production ? false : "inline",
  treeShaking: true,
  metafile: production,
  outfile: path.join(projectDirectory, "main.js"),
  logLevel: "info"
});

if (production) {
  const result = await context.rebuild();
  await writeFile(path.join(projectDirectory, "build-meta.json"), JSON.stringify(result.metafile, null, 2));
  await context.dispose();
} else {
  await context.watch();
}
