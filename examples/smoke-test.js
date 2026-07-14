import assert from "node:assert/strict";
import fs from "node:fs";

import createLib3mf from "../index.js";

const lib = await createLib3mf();
const wrapper = new lib.CWrapper();
const model = wrapper.CreateModel();
const reader = model.QueryReader("3mf");
const virtualPath = "/smoke-test.3mf";

try {
  lib.FS.writeFile(virtualPath, new Uint8Array(fs.readFileSync("examples/Helix.3mf")));
  reader.ReadFromFile(virtualPath);

  const version = wrapper.GetLibraryVersion();
  assert.equal(version.Major, 2);
  assert.equal(version.Minor, 6);

  const meshes = model.GetMeshObjects();
  try {
    assert.ok(meshes.Count() > 0, "Helix fixture must contain a mesh");
  } finally {
    meshes.delete();
  }

  console.log(`lib3mf ${version.Major}.${version.Minor}.${version.Micro}: smoke test passed`);
} finally {
  try {
    lib.FS.unlink(virtualPath);
  } catch {
    // The virtual file may not exist if setup failed.
  }
  reader.delete();
  model.delete();
  wrapper.delete();
}
