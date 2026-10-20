#!/usr/bin/env node
/**
 * Install official Three.js r169 postprocessing modules and their relative dependencies.
 * Run from any working directory: node scripts/install-three-postprocessing.mjs
 * No viewer files, camera controls, or GLB assets are modified.
 */
import {mkdir, writeFile, readFile} from 'node:fs/promises';
import {resolve, dirname, relative, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const dest=resolve(root,'viewer/v88.8/vendor/three/examples/jsm');
const version='0.169.0';
const base='https://cdn.jsdelivr.net/npm/three@'+version+'/examples/jsm/';
const queue=['postprocessing/EffectComposer.js','postprocessing/RenderPass.js','postprocessing/UnrealBloomPass.js','postprocessing/OutputPass.js'];
const seen=new Set();
const saved=[];
while(queue.length){
  const path=queue.shift();
  if(seen.has(path))continue;
  seen.add(path);
  const url=base+path;
  const response=await fetch(url);
  if(!response.ok)throw new Error('Download failed: '+response.status+' '+url);
  const source=await response.text();
  if(!source.includes('three') && source.length<100)throw new Error('Unexpected response: '+url);
  const imports=Array.from(source.matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g),m=>m[1]);
  for(const imp of imports){
    if(!imp.startsWith('.'))continue;
    const dependency=relative(dest,resolve(dest,dirname(path),imp)).split(sep).join('/');
    if(dependency.startsWith('..')||dependency.startsWith('/'))throw new Error('Unexpected import outside add-ons: '+imp);
    queue.push(dependency);
  }
  const target=resolve(dest,path);
  await mkdir(dirname(target),{recursive:true});
  await writeFile(target,source,'utf8');
  saved.push(path);
  console.log('Installed',path);
}
for(const name of ['postprocessing/EffectComposer.js','postprocessing/RenderPass.js','postprocessing/UnrealBloomPass.js','postprocessing/OutputPass.js']){
  if(!(await readFile(resolve(dest,name),'utf8')).length)throw new Error('Missing '+name);
}
console.log('Three.js '+version+' postprocessing modules installed ('+saved.length+' files).');
