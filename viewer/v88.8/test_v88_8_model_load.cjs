// Verify the checked-in Revision 32 GLB through the viewer's own Three.js loader.
// Uses an isolated same-origin HTTP server; no staging or external services.
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const fs=require('node:fs');
const http=require('node:http');
const net=require('node:net');
const path=require('node:path');
const {chromium}=require('playwright');

const root=__dirname;
const modelPath=path.join(root,'orbital-nexus.glb');
const expectedSha256='a64b5e8c90c42132cd3a12c9fa29d21d5803e64890443cfb8bf7ff1645961cf6';
const suppliedUrl=process.env.V88_MODEL_TEST_URL;
const gatewayMode=process.env.V88_MODEL_TEST_GATEWAY==='1';
const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.ico':'image/x-icon','.json':'application/json','.glb':'model/gltf-binary'};
const server=http.createServer((request,response)=>{
  const pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname);
  const file=path.resolve(root,'.'+pathname);
  if(!file.startsWith(root+path.sep)){response.writeHead(403);response.end();return;}
  fs.readFile(file,(error,body)=>{
    response.writeHead(error?404:200,{'Content-Type':error?'text/plain':mime[path.extname(file)]||'application/octet-stream'});
    response.end(error?'File not found':body);
  });
});
async function freePort(){
  const socket=net.createServer();socket.listen(0,'127.0.0.1');await once(socket,'listening');
  const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));return port;
}

(async()=>{
  assert.ok(fs.existsSync(modelPath),'approved GLB is present beside the viewer');
  const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROME_PATH?{executablePath:process.env.PLAYWRIGHT_CHROME_PATH}:{})});
  let gatewayChild=null,gatewayOrigin=null;
  if(gatewayMode&&!suppliedUrl){
    const port=await freePort();gatewayOrigin='http://127.0.0.1:'+port;
    gatewayChild=spawn(process.execPath,['server.js'],{cwd:path.resolve(root,'../..'),
      env:{...process.env,PORT:String(port),CORS_ORIGIN:gatewayOrigin,
        TELEMETRY_SESSION_ISSUER_KEY:'local-model-fixture-issuer',
        TELEMETRY_SESSION_SIGNING_KEY:'local-model-fixture-signing',
        GITHUB_WEBHOOK_SECRET:'local-model-fixture-webhook'},stdio:'ignore'});
    let ready=false;
    for(let i=0;i<80;i++){
      if(gatewayChild.exitCode!==null)throw Error('local gateway exited before becoming ready');
      try{const r=await fetch(gatewayOrigin+'/health');if(r.ok){ready=true;break;}}catch{}
      await new Promise(resolve=>setTimeout(resolve,50));
    }
    assert.ok(ready,'local gateway did not become ready');
  }
  if(!suppliedUrl&&!gatewayMode)await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const testUrl=suppliedUrl||(gatewayOrigin?gatewayOrigin+'/viewer/?fixture=1':'http://127.0.0.1:'+server.address().port+'/v70.html?fixture=1');
  const origin=new URL(testUrl).origin;
  const errors=[],failedResponses=[],glbResponses=[],external=[];
  try{
    const page=await browser.newPage({viewport:{width:1366,height:768},deviceScaleFactor:1});
    page.on('pageerror',e=>errors.push(e.message));
    page.on('response',r=>{
      if(r.url().endsWith('/orbital-nexus.glb'))glbResponses.push(r.status());
      if(r.status()>=400)failedResponses.push(r.status()+' '+r.url());
    });
    page.on('request',r=>{const u=r.url();if(/^https?:/.test(u)&&new URL(u).origin!==origin)external.push(u);});
    const response=await page.goto(testUrl,{waitUntil:'domcontentloaded'});
    assert.equal(response.status(),200,'viewer entry served over HTTP');
    await page.waitForFunction(()=>window.orbitalDiagnostics?.report?.events?.some(e=>e.stage==='Loaded'),null,{timeout:120000});
    const result=await page.evaluate(()=>({
      ready:window.orbitalDiagnostics.report.ready,
      loaded:window.orbitalDiagnostics.report.events.findLast(e=>e.stage==='Loaded')?.message,
      modelName:document.querySelector('#model-inspector-name')?.textContent,
      modelDetails:document.querySelector('#model-inspector-details')?.textContent,
      modelVisible:document.querySelector('#model-inspector')?.dataset.visible,
      fixture:document.querySelector('#v88-fixture-note')?.textContent
    }));
    assert.equal(result.ready,true,'Three.js viewer initialized');
    assert.match(result.loaded,/Orbital Nexus loaded · 3076 meshes · 118 animation clips/);
    assert.equal(result.modelName,'orbital-nexus.glb');
    assert.equal(result.modelVisible,'true');
    assert.match(result.modelDetails,/3076 meshes · 435,096 triangles · 118 animations/);
    assert.match(result.fixture,/NOT LIVE TELEMETRY/);
    assert.deepEqual(glbResponses,[200,200],'bundled GLB HEAD and GET both succeed');
    assert.ok(!failedResponses.some(item=>/\/orbital-nexus\.glb$/.test(item)),
      'GLB does not return HTTP errors; other gateway endpoint failures are reported separately');
    assert.deepEqual(errors,[],'no page runtime errors');
    assert.deepEqual(external,[],'no external network requests');
    if(failedResponses.length)console.log('Other local HTTP failures: '+failedResponses.join(' | '));
    const output=path.join(root,'V88.8-screenshots','model-loaded-1366x768.png');
    fs.mkdirSync(path.dirname(output),{recursive:true});
    await page.screenshot({path:output});
    console.log('PASS · GLB loaded through Three.js · '+result.loaded);
    console.log('Model screenshot: '+output);
    await page.close();
  }finally{
    await browser.close();
    if(server.listening)await new Promise(resolve=>server.close(resolve));
    if(gatewayChild){gatewayChild.kill();if(gatewayChild.exitCode===null)await Promise.race([once(gatewayChild,'exit'),new Promise(resolve=>setTimeout(resolve,1000))]);}
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
