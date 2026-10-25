// Excalidraw 0.18.1 ships its web application's environment in the editor
// package. The local editor never reads the Firebase configuration.
export function removeUnusedFirebaseConfig(contents) {
  const field = /\bVITE_APP_FIREBASE_CONFIG\s*:\s*'(?:\\.|[^'\\])*'\s*,/g;
  if ([...contents.matchAll(field)].length !== 1) {
    throw new Error("Expected exactly one upstream Firebase configuration field; review the Excalidraw build.");
  }
  const cleaned = contents.replace(field, "");
  assertNoFirebaseCredentials(cleaned);
  return cleaned;
}

export function assertNoFirebaseCredentials(contents) {
  if (/VITE_APP_FIREBASE_CONFIG|AIza[0-9A-Za-z_-]{35}/.test(contents)) {
    throw new Error("The bundle contains an unused Firebase configuration or Google API key.");
  }
}
