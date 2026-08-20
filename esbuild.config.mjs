import esbuild from "esbuild";
import process from "node:process";
import path from "node:path";
import { builtinModules } from "node:module";
import { fileURLToPath } from "node:url";
import { readFile, writeFile } from "node:fs/promises";

const production = process.argv[2] === "production";
const projectDirectory = path.dirname(fileURLToPath(import.meta.url));
const excalidrawProductionEntry = path.join(projectDirectory, "node_modules", "@excalidraw", "excalidraw", "dist", "prod", "index.js");
const dynamicErrorConstructor = `function fA(A,g){return A=VA(A),new Function("body",\`return function \${A}() {
    "use strict";    return body.apply(this, arguments);
};
\`)(g)}`;
const staticErrorConstructor = "function fA(A,g){return A=VA(A),function(...C){return g.apply(this,C)}}";
const dynamicDynCallInvoker = /function C\(B\)\{let E=\[\];[\s\S]*?new Function\("dynCall","rawFunction",D\)\(B,g\)\}/;
const staticDynCallInvoker = "function C(B){return(...E)=>B(g,...E)}";

const context = await esbuild.context({
  absWorkingDir: projectDirectory,
  entryPoints: [path.join(projectDirectory, "main.ts")],
  bundle: true,
  alias: {
    "@excalidraw/excalidraw": excalidrawProductionEntry,
    "@excalidraw/mermaid-to-excalidraw": path.join(projectDirectory, "src", "mermaid-disabled.ts")
  },
  plugins: [{
    name: "remove-excalidraw-dynamic-error-constructor",
    setup(build) {
      build.onLoad({ filter: /chunk-EIO257PC\.js$/ }, async (args) => {
        const contents = await readFile(args.path, "utf8");
        if (!contents.includes(dynamicErrorConstructor) || !dynamicDynCallInvoker.test(contents)) {
          throw new Error("An expected Excalidraw dynamic constructor was not found.");
        }
        return {
          contents: contents
            .replace(dynamicErrorConstructor, staticErrorConstructor)
            .replace(dynamicDynCallInvoker, staticDynCallInvoker),
          loader: "js"
        };
      });
    }
  }],
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
