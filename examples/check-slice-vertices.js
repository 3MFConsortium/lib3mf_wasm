import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import createLib3mf from "../index.js";

const inputPaths = process.argv.slice(2);
if (!inputPaths.length) {
  console.error("Usage: node examples/check-slice-vertices.js <file.3mf> [file.3mf ...]");
  process.exit(1);
}

const lib = await createLib3mf();

const safeDelete = (value) => {
  try {
    value?.delete?.();
  } catch {
    // Cleanup must not hide the assertion that caused a test failure.
  }
};

for (const inputPath of inputPaths) {
  const virtualPath = `/slice-vertex-${path.basename(inputPath)}`;
  const wrapper = new lib.CWrapper();
  const model = wrapper.CreateModel();
  const reader = model.QueryReader("3mf");
  let iterator;
  let stackCount = 0;
  let sliceCount = 0;
  let sampledVertexCount = 0;

  try {
    lib.FS.writeFile(virtualPath, new Uint8Array(fs.readFileSync(inputPath)));
    reader.ReadFromFile(virtualPath);
    iterator = model.GetSliceStacks();

    while (iterator.MoveNext()) {
      const stack = iterator.GetCurrentSliceStack();
      try {
        stackCount += 1;
        const count = Number(stack.GetSliceCount());
        for (let sliceIndex = 0; sliceIndex < count; sliceIndex += 1) {
          const slice = stack.GetSlice(sliceIndex);
          try {
            sliceCount += 1;
            const vertexCount = Number(slice.GetVertexCount());
            if (!vertexCount) continue;

            const sampleIndices = [...new Set([0, Math.floor(vertexCount / 2), vertexCount - 1])];
            for (const vertexIndex of sampleIndices) {
              const vertex = slice.GetVertex(vertexIndex);
              try {
                assert.ok(vertex, `Missing vertex ${vertexIndex} in slice ${sliceIndex}`);
                assert.ok(Number.isFinite(vertex.get_Coordinates0()), "Slice vertex X must be finite");
                assert.ok(Number.isFinite(vertex.get_Coordinates1()), "Slice vertex Y must be finite");
                sampledVertexCount += 1;
              } finally {
                safeDelete(vertex);
              }
            }
          } finally {
            safeDelete(slice);
          }
        }
      } finally {
        safeDelete(stack);
      }
    }

    assert.ok(stackCount > 0, `${inputPath} must contain a slice stack`);
    assert.ok(sliceCount > 0, `${inputPath} must contain slices`);
    assert.ok(sampledVertexCount > 0, `${inputPath} must expose indexed slice vertices`);
    console.log(`${path.basename(inputPath)}: ${stackCount} stacks, ${sliceCount} slices, ${sampledVertexCount} indexed vertices sampled`);
  } finally {
    try {
      lib.FS.unlink(virtualPath);
    } catch {
      // The virtual file may not exist if setup failed.
    }
    safeDelete(iterator);
    safeDelete(reader);
    safeDelete(model);
    safeDelete(wrapper);
  }
}
