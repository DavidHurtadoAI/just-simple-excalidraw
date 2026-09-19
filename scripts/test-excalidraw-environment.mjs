import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { removeUnusedFirebaseConfig, assertNoFirebaseCredentials } from "./excalidraw-environment.mjs";

const directory = new URL("../node_modules/@excalidraw/excalidraw/dist/prod/", import.meta.url);
const files = (await readdir(directory)).filter((file) => file.endsWith(".js"));
const sources = await Promise.all(files.map((file) => readFile(new URL(file, directory), "utf8")));
const configurations = sources.filter((source) => source.includes("VITE_APP_FIREBASE_CONFIG"));
assert.equal(configurations.length, 1, "Firebase configuration must have no consumers in the editor package");
const originalSource = configurations[0];
assert.equal((originalSource.match(/VITE_APP_FIREBASE_CONFIG/g) ?? []).length, 1);
const cleanedSource = removeUnusedFirebaseConfig(originalSource);
const evaluate = async (source) => Object.values(await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`))[0];
const original = await evaluate(originalSource);
const cleaned = await evaluate(cleanedSource);
const { VITE_APP_FIREBASE_CONFIG: removed, ...expected } = original;
assert.equal(typeof removed, "string");
assert.deepEqual(cleaned, expected, "All other upstream environment settings must be preserved");
assertNoFirebaseCredentials(cleanedSource);
assert.throws(() => assertNoFirebaseCredentials(originalSource));
// Construct a synthetic pattern rather than committing a scanner-triggering key.
assert.throws(() => assertNoFirebaseCredentials("AI" + "za" + "x".repeat(35)));
assert.throws(() => removeUnusedFirebaseConfig("const environment = {};"));
assert.throws(() => removeUnusedFirebaseConfig(originalSource + originalSource));
console.log("Excalidraw environment tests passed: unused field removed, remaining settings preserved, credential regression checks enforced.");
