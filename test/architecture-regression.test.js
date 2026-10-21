import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const html=await readFile(new URL("../viewer/v88.8/v70.html",import.meta.url),"utf8");
const monitor=await readFile(new URL("../viewer/v88.8/v71-monitor.js",import.meta.url),"utf8");
const catalog=await readFile(new URL("../viewer/v88.8/connector-catalog.js",import.meta.url),"utf8");

test("orbital scene initialization anchors remain in the established viewer",()=>{
  assert.match(html,/import \{OrbitControls\} from 'three\/addons\/controls\/OrbitControls\.js'/);
  assert.match(html,/import \{GLTFLoader\} from 'three\/addons\/loaders\/GLTFLoader\.js'/);
  assert.match(html,/new THREE\.PerspectiveCamera\(49,innerWidth\/innerHeight,\.1,1000\)/);
  assert.match(html,/camera\.position\.set\(0,25,42\)/);
  assert.match(html,/new THREE\.HemisphereLight\(0xaedbff,0x152134,1\.0\)/);
  assert.match(html,/controls\.dampingFactor=\.07/);
  assert.match(html,/const rollbackAsset=assetChoice==='rollback'\|\|assetChoice==='original'/);
  assert.match(html,/const bundledAsset=rollbackAsset\?'.\/orbital-nexus\.glb':'.\/candidates\/orbital-nexus-phase-4-5-candidate\.glb'/);
  assert.match(html,/fetch\(bundledAsset\)/);
  assert.match(html,/renderer\.setAnimationLoop\(frame\)/);
});

test("monitor consumes the shared catalog and preserves registry status semantics",()=>{
  assert.match(html,/\.\/connector-catalog\.js/);
  assert.match(catalog,/window\.__NG_CONNECTORS/);
  assert.match(monitor,/window\.__NG_CONNECTORS/);
  assert.match(monitor,/setRow\(id,c\.status === 'connected' && c\.connected !== true \? 'error' : c\.status\)/);
  assert.match(monitor,/\['unconnected','configured','connected','disconnected','error'\]/);
});
