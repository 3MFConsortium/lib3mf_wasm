// @3mfconsortium/lib3mf — CommonJS entry point
// This file is loaded by `require()` statements.

const path = require('node:path');
const { pathToFileURL } = require('node:url');

// Import the factory function created by Emscripten using `require`.
//
// The Emscripten output is stored with a .cjs extension so Node treats it as
// CommonJS even though the package root is ESM (`"type": "module"`).
const factory = require('../build/lib3mf.cjs');

/**
 * Initializes the lib3mf WebAssembly module.
 * @param {object} [userOptions={}] - Optional Emscripten module options.
 * @returns {Promise<object>} A promise that resolves with the initialized lib3mf module.
 */
function lib3mf(userOptions = {}) {
  // In a CommonJS context, `import.meta.url` is not available.
  // We use the traditional `__dirname` to get the current directory
  // and construct an absolute file path to the .wasm file.
  const wasmPath = path.resolve(__dirname, '../build/lib3mf.wasm');

  // Emscripten's Node.js loader expects a URL, so we convert the file path.
  const wasmURL = pathToFileURL(wasmPath).toString();

  const locateFile = (p) => {
    if (p.endsWith('.wasm')) {
      return wasmURL;
    }
    return p;
  };

  // Merge options and call the factory.
  const options = {
    locateFile,
    ...userOptions,
  };

  if (typeof factory !== 'function') {
    throw new Error(
      '@3mfconsortium/lib3mf (CJS): build/lib3mf.js did not export a factory function.'
    );
  }

  return factory(options);
}

module.exports = lib3mf;
module.exports.default = lib3mf;
