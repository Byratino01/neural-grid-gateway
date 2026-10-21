import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const viewerPath=new URL('../viewer/v88.8/v70.html',import.meta.url);

test('fixture mode explicitly disables recurring and user-triggered local job polling',async()=>{
  const html=await readFile(viewerPath,'utf8');
  assert.match(html,/window\.ORBITAL_FIXTURE_MODE=new URLSearchParams\(location\.search\)\.get\('fixture'\)==='1'/);
  const guardedRefreshes=html.match(/async function refresh\(\)\{if\(window\.ORBITAL_FIXTURE_MODE\|\|/g)||[];
  assert.ok(guardedRefreshes.length>=7,'all backend refresh handlers must guard fixture mode');
  assert.equal((html.match(/if\(!window\.ORBITAL_FIXTURE_MODE\)/g)||[]).length,7,
    'every recurring backend poll remains enabled outside fixture mode');
});

test('production job polling remains enabled without fixture mode',async()=>{
  const html=await readFile(viewerPath,'utf8');
  assert.match(html,/if\(!window\.ORBITAL_FIXTURE_MODE\)\{setInterval\(refresh,1500\);refresh\(\)\}/);
  assert.match(html,/if\(!window\.ORBITAL_FIXTURE_MODE\)setInterval\(refresh,1200\)/);
});
