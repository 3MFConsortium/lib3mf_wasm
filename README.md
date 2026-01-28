# @3mfconsortium/lib3mf

Thin JS wrapper around the Emscripten-built **lib3mf** WebAssembly module.  
Shipping targets both **Node.js** (ESM & CommonJS) and modern **browser bundlers** (Vite, Webpack, esbuild…).  
The default export is the async initializer returned by Emscripten's factory.

## Install

```bash
npm install @3mfconsortium/lib3mf
```

## Usage

### ESM (Node.js ≥ 18 & browsers)

```js
import lib3mf from '@3mfconsortium/lib3mf';

const Module = await lib3mf();
const wrapper = new Module.CWrapper();
console.log(wrapper.GetLibraryVersion());
```

The wrapper automatically locates the bundled `lib3mf.wasm` using `import.meta.url`, so no extra configuration is required when you run directly in Node.js or in evergreen browsers.

### CommonJS (Node.js)

```js
const lib3mf = require('@3mfconsortium/lib3mf');

lib3mf().then((Module) => {
  const wrapper = new Module.CWrapper();
  console.log(wrapper.GetLibraryVersion());
});
```

The CommonJS entry point sets up the correct `locateFile` option so the `.wasm` asset is loaded from the installed package.

### Browser bundlers / Vite

The package works out of the box with bundlers that support native ESM (Vite, Webpack 5, Rollup, esbuild).  
`new URL('./build/lib3mf.wasm', import.meta.url)` is statically analyzable, so bundlers copy the wasm next to your build and replace the URL automatically.

```js
import lib3mf from '@3mfconsortium/lib3mf';

export async function createWrapper() {
  const Module = await lib3mf();
  return new Module.CWrapper();
}
```

In Vite you can simply `import { createWrapper } from './lib3mf';` from your components—no plugin or manual asset handling is required.

If you need the resolved wasm URL (for example to preload it) you can import it explicitly thanks to the package export:

```js
import wasmURL from '@3mfconsortium/lib3mf/wasm' assert { type: 'url' };
```

### CLI example

See [`examples/convert.js`](examples/convert.js) for a minimal STL ⇄ 3MF conversion script that runs directly with `node`.
