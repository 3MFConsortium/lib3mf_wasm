// Usage: node examples/convert.js path/to/model.3mf
// or:    node examples/convert.js path/to/model.stl

import fs from 'fs';
// When you run this, Node.js sees it's an ES module (`"type": "module"`)
// and correctly loads `@3mfconsortium/lib3mf` using the `index.js` entry point.
import lib3mf from '@3mfconsortium/lib3mf';

const inputFileName = process.argv[2];

if (!inputFileName || !fs.existsSync(inputFileName)) {
  console.log("Usage:");
  console.log("  node examples/convert.js <path_to_file>");
  console.log("\nError: Please provide a valid input file path.");
  process.exit(1);
}

function findExtension(filename) {
  const idx = filename.lastIndexOf('.');
  return idx !== -1 ? filename.substring(idx).toLowerCase() : "";
}

try {
  // 1. Initialize the Wasm Module
  // This is the main call to your library. It asynchronously loads and compiles the Wasm.
  const lib = await lib3mf();
  console.log("✅ lib3mf WASM module initialized.");

  const wrapper = new lib.CWrapper();
  const libVersion = wrapper.GetLibraryVersion();
  console.log(`✅ lib3mf Version: ${libVersion.Major}.${libVersion.Minor}.${libVersion.Micro}`);

  // 2. Determine file conversion direction
  const extension = findExtension(inputFileName);
  let readerName = "";
  let writerName = "";
  let newExtension = "";

  if (extension === ".stl") {
    readerName = "stl";
    writerName = "3mf";
    newExtension = ".3mf";
  } else if (extension === ".3mf") {
    readerName = "3mf";
    writerName = "stl";
    newExtension = ".stl";
  } else {
    console.log(`Unknown input file extension: ${extension}`);
    process.exit(1);
  }

  const outputFileName = inputFileName.substring(0, inputFileName.length - extension.length) + newExtension;

  // 3. Use the Emscripten Virtual File System
  // Read the file from the real file system into a buffer.
  console.log(`✅ Reading ${inputFileName}...`);
  const inputBuffer = fs.readFileSync(inputFileName);

  // Write that buffer to the Wasm module's virtual memory file system.
  // The C++ code inside the Wasm can only see this virtual FS.
  const virtualInputPath = `/input${extension}`;
  lib.FS.writeFile(virtualInputPath, inputBuffer);

  // 4. Perform the conversion using lib3mf APIs
  const model = wrapper.CreateModel();
  const reader = model.QueryReader(readerName);
  reader.ReadFromFile(virtualInputPath); // Read from the virtual path

  const writer = model.QueryWriter(writerName);
  const virtualOutputPath = `/output${newExtension}`;
  writer.WriteToFile(virtualOutputPath); // Write to the virtual path
  console.log(`✅ Writing ${outputFileName}...`);

  // 5. Retrieve the result
  // Read the output file from the virtual file system back into a Node.js buffer.
  const outputBuffer = lib.FS.readFile(virtualOutputPath);

  // Write the resulting buffer to the real file system.
  fs.writeFileSync(outputFileName, outputBuffer);

  console.log("🎉 Conversion complete!");

} catch (err) {
  console.error("An error occurred during conversion:", err);
  process.exit(1);
}
