  // @3mfconsortium/lib3mf — universal ESM entry point
  import factory from './build/lib3mf.cjs';

const wasmUrlPromise = (async () => {
  const isNode =
    typeof process !== 'undefined' &&
    process.versions?.node &&
    typeof window === 'undefined';

  if (isNode) {
    const { pathToFileURL, fileURLToPath } = await import('node:url');
    const path = await import('node:path');

    const baseDir = path.default.dirname(fileURLToPath(new URL(import.meta.url)));
    const wasmPath = path.default.resolve(baseDir, 'build/lib3mf.wasm');
    return pathToFileURL(wasmPath).toString();
  }

  try {
    const mod = await import('./build/lib3mf.wasm?url');
    return mod.default ?? mod;
  } catch (err) {
    console.warn('lib3mf: dynamic import of wasm failed, falling back to URL', err);
    return new URL('./build/lib3mf.wasm', import.meta.url).href;
  }
})();

export default async function lib3mf(userOptions = {}) {
  const wasmUrl = await wasmUrlPromise;
  const locateFile = (path) => (path.endsWith('.wasm') ? wasmUrl : path);
  const options = { locateFile, ...userOptions };

  if (typeof factory !== 'function') {
    throw new Error(
      '@3mfconsortium/lib3mf (ESM): The factory function could not be loaded from ./build/lib3mf.cjs. Make sure the file exists and exports a function.'
    );
  }

  return factory(options);
}
