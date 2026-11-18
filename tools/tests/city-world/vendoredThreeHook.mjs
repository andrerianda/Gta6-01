// A module resolve hook for Node tests that build real meshes: the bare specifier 'three' (as the
// game imports it in the browser through its import map) resolves to the vendored build.
//   import { register } from 'node:module';
//   register('./vendoredThreeHook.mjs', import.meta.url);

export async function resolve(specifier, context, next) {
  if (specifier === 'three') return { url: new URL('../../../game/vendor/three/three.module.min.js', import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
}
