/** Excalidraw 0.18.1 has no public custom-font API. Keep this narrow hook
 * fail-closed when upgrading the pinned upstream bundle, like the other build
 * adapters. The callback replaces one registered family before it is loaded.
 */
export function patchCustomFontRegistry(source) {
  const getter = 'static get registered(){return ne._registered?ne._initialized||(ne._registered=new Map([...ne.init().entries(),...ne._registered.entries()])):ne._registered=ne.init(),ne._registered}';
  if (source.split(getter).length !== 2) throw new Error('Expected Excalidraw font registry getter not found exactly once.');
  return source.replace(getter, getter.replace(',ne._registered}', ',__JSE_APPLY_CUSTOM_FONT__(ne._registered),ne._registered}'));
}
