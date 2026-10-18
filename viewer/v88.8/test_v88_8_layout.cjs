// Run while start_viewer.py --monitor-port serves this directory.
// Install Playwright locally or set NODE_PATH to an existing Playwright installation.
// Optional: set PLAYWRIGHT_CHROME_PATH to an installed Chrome/Chromium executable.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {chromium} = require('playwright');

const requestedUrl = process.env.V88_6_URL;
const output = path.join(__dirname, 'V88.8-screenshots');
const sizes = [[1714,864], [1920,1080], [1366,768], [1024,768], [768,1024]];
const ids = ['connectors','activity','system','flow','metrics','map'];
const chrome = process.env.PLAYWRIGHT_CHROME_PATH;
const overlaps = (a,b) => Math.min(a.right,b.right)-Math.max(a.left,b.left)>1 &&
  Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1;

(async () => {
  fs.mkdirSync(output,{recursive:true});
  // A same-process static server makes fixture testing independent of a stale
  // viewer on port 50080. Set V88_6_URL to test the Python viewer instead.
  const server = requestedUrl ? null : http.createServer((request,response) => {
    const pathname = decodeURIComponent(new URL(request.url,'http://localhost').pathname);
    const file = path.resolve(__dirname,'.'+pathname);
    if (!file.startsWith(__dirname+path.sep)) {response.writeHead(403);response.end();return}
    const mime = file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':
      file.endsWith('.html')?'text/html':file.endsWith('.svg')?'image/svg+xml':
      file.endsWith('.ico')?'image/x-icon':'application/octet-stream';
    fs.readFile(file,(error,body)=>{
      response.writeHead(error?404:200,{'Content-Type':error?'text/plain':mime});
      response.end(error?'File not found':body);
    });
  });
  if (server) await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const baseUrl = requestedUrl || 'http://127.0.0.1:'+server.address().port+'/v70.html?fixture=1';
  const browser = await chromium.launch({headless:true,...(chrome?{executablePath:chrome}:{})});
  const report = [];
  try {
    for (const [width,height] of sizes) {
      const page = await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
      const consoleErrors = [];
      const badResponses = [];
      const externalRequests = [];
      page.on('pageerror',error=>consoleErrors.push(error.message));
      page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text())});
      page.on('response',response=>{if(response.status()>=400)badResponses.push(response.status()+' '+response.url())});
      page.on('request',request=>{
        const url=request.url();
        if(/^https?:/.test(url)&&new URL(url).origin!==new URL(baseUrl).origin)externalRequests.push(url);
      });
      const response = await page.goto(baseUrl,{waitUntil:'domcontentloaded'});
      assert.equal(response.status(),200,'viewer HTTP status');
      await page.locator('#v88-fixture-note').waitFor();
      await page.waitForTimeout(700);
      assert.match(await page.locator('#v88-fixture-note').innerText(),/NOT LIVE TELEMETRY/);
      assert.match(await page.locator('#v70-activity .live-label').innerText(),/FIXTURE/);
      assert.doesNotMatch(await page.locator('#v70-activity .live-label').innerText(),/LIVE/);
      assert.equal(await page.locator('#v70-dashboard .v70-panel').count(),6);
      const chromeBounds = await page.evaluate(() => {
        const bounds = selector => {
          const r=document.querySelector(selector).getBoundingClientRect();
          return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};
        };
        return {header:bounds('body>header'),controls:bounds('body>header .controls'),
          note:bounds('#v88-fixture-note'),first:bounds('#v70-connectors')};
      });
      assert.ok(chromeBounds.first.top>=chromeBounds.header.bottom-2,
        'dashboard must begin below header: '+JSON.stringify(chromeBounds));
      assert.equal(overlaps(chromeBounds.note,chromeBounds.controls),false,
        width+'x'+height+' fixture badge/controls overlap '+JSON.stringify(chromeBounds));
      for (const id of ids) {
        const panel = page.locator('#v70-'+id);
        assert.equal(await panel.isVisible(),true,id+' visible');
        const bounds = await panel.evaluate(element => {
          const rect = part => {
            const r=part.getBoundingClientRect();
            return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};
          };
          return {panel:rect(element),head:rect(element.querySelector('.panel-head')),
            body:rect(element.querySelector('.panel-body'))};
        });
        assert.ok(bounds.panel.width>120 && bounds.panel.height>150,id+' size');
        assert.equal(overlaps(bounds.head,bounds.body),false,id+' header/content overlap');
      }
      assert.equal(await page.locator('#v70-map .connection-map').isVisible(),true,'map visible');
      assert.equal(await page.locator('#v70-flow .v88-chart').isVisible(),true,'chart visible');
      assert.deepEqual(externalRequests,[],'fixture must not request external services');
      assert.ok(badResponses.every(item=>/\/orbital-nexus\.glb$/.test(item)),'no new failed asset requests');
      assert.ok((await page.locator('#v88-flow-points circle').count())>=4,'timestamp points');
      if(width>=1366)for(const [id,content] of [
        ['system','.status-table'],['flow','.v88-chart'],['map','.connection-map']]) {
        const bounds=await page.locator('#v70-'+id).evaluate((panel,selector)=>{
          const body=panel.querySelector('.panel-body').getBoundingClientRect();
          const target=panel.querySelector(selector).getBoundingClientRect();
          return {bodyBottom:body.bottom,targetBottom:target.bottom};
        },content);
        assert.ok(bounds.targetBottom<=bounds.bodyBottom+1,id+' primary content visible without scrolling');
      }
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'horizontal document overflow');
      assert.equal(await page.evaluate(()=>document.querySelector('#v70-dashboard').scrollWidth>innerWidth+1),false,'horizontal dashboard overflow');
      assert.equal(await page.locator('#v80-connection-settings').getAttribute('open'),null,'auth settings collapsed');
      assert.equal(await page.locator('#v71-state').innerText(),'DISCONNECTED');
      assert.equal(await page.locator('#v71-connect').isEnabled(),true);
      assert.equal(await page.locator('#v71-disconnect').isEnabled(),false);
      assert.equal(await page.locator('#v70-system .status-row').count(),8,'verified status rows');
      assert.equal(await page.locator('#v70-metrics .station-row').count(),5,'station table rows');
      assert.equal(await page.locator('#v88-activity-feed .activity-item').count(),4,'fixture event rows');
      assert.equal(await page.locator('#v70-map .connection-map .map-node').count(),7,'map nodes');
      assert.equal(await page.locator('#v71-connectors .v71-connector:not([hidden])').count(),5,'five visible connectors');
      assert.equal(await page.locator('#v71-connectors [data-connector="higgsfield"] strong').innerText(),'UNCONFIGURED');
      assert.equal(await page.locator('#v71-connectors [data-connector="truck-scanner"]').isVisible(),false);
      for(const id of ['github','render','netlify','chatgpt','higgsfield']) {
        const icon=page.locator('#v71-connectors [data-connector="'+id+'"] .service-icon');
        assert.equal(await icon.isVisible(),true,id+' icon visible');
        assert.equal(await icon.evaluate(el=>el.complete && el.naturalWidth>0),true,id+' icon loaded');
      }
      const clipped = await page.evaluate(()=>[...document.querySelectorAll('#v71-connectors .v71-connector:not([hidden])')]
        .flatMap(row=>[row.querySelector('span:not(.v71-dot)'),row.querySelector('strong')])
        .filter(Boolean).filter(el=>el.scrollWidth>el.clientWidth+1).map(el=>el.textContent));
      assert.deepEqual(clipped,[],'connector labels and statuses must not clip');
      if(width===1714) {
        const actual=await page.evaluate(()=>Object.fromEntries(['connectors','activity','system','flow','metrics','map'].map(id=>{
          const r=document.querySelector('#v70-'+id).getBoundingClientRect();
          return [id,{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom}];
        })));
        for(const id of ['connectors','activity']) assert.equal(actual[id].width,310.5,id+' exact 75% width');
        assert.equal(actual.connectors.x,14,'left edge anchored');
        assert.equal(actual.activity.x+actual.activity.width,1700,'right edge anchored');
        for(const id of ['system','flow','metrics','map']) {
          assert.equal(actual[id].height,216,id+' exact 80% height');
          assert.equal(actual[id].bottom,850,id+' bottom anchored');
        }
        fs.writeFileSync(path.join(output,'panel-measurements.json'),JSON.stringify(actual,null,2));
        const add=await page.locator('#v70-connectors .add-connector').boundingBox();
        assert.ok(add && add.y+add.height<=chromeBounds.first.bottom+1,'Add Connector visible within Panel 01');
      }
      assert.equal(await page.locator('#v70-system .status-row').nth(0).innerText().then(t=>t.includes('FIXTURE')),true,'fixture gateway state');
      const assetNames = await page.evaluate(()=>performance.getEntriesByType('resource').map(item=>new URL(item.name).pathname));
      for(const asset of ['/v70-dashboard.css','/v70-dashboard.js','/v71-monitor.js'])
        assert.ok(assetNames.some(name=>name.endsWith(asset)),'asset loaded '+asset);
      await page.screenshot({path:path.join(output,'v88.8-'+width+'x'+height+'-preview.png')});
      if (width<=1100) {
        await page.locator('#v70-map').scrollIntoViewIfNeeded();
        await page.waitForTimeout(150);
        await page.screenshot({path:path.join(output,width+'x'+height+'-bottom.png')});
      }
      // The panel header remains fixed within the panel as its content scrolls.
      for(const id of ids) {
        const panel = page.locator('#v70-'+id);
        await panel.locator('.panel-body').evaluate(element=>{element.scrollTop=element.scrollHeight});
        const overlap = await panel.evaluate(element=>{
          const h=element.querySelector('.panel-head').getBoundingClientRect();
          const b=element.querySelector('.panel-body').getBoundingClientRect();
          return Math.min(h.bottom,b.bottom)-Math.max(h.top,b.top)>1;
        });
        assert.equal(overlap,false,id+' scrolled overlap');
      }
      report.push({viewport:width+'x'+height,panels:6,fixture:true,
        timelinePoints:await page.locator('#v88-flow-points circle').count(),
        consoleErrors:[...new Set(consoleErrors)],badResponses:[...new Set(badResponses)],
        externalRequests});
      await page.close();
    }

    // End-to-end manual-token path: trusted operator-side test code issues the
    // credential; the browser only receives the short-lived viewer token.
    const gatewayOrigin=new URL(baseUrl).origin;
    const issuerKey=process.env.TELEMETRY_SESSION_ISSUER_KEY;
    const webhookSecret=process.env.GITHUB_WEBHOOK_SECRET;
    assert.ok(issuerKey&&webhookSecret,'CI-only issuer and webhook test configuration');
    const issuedResponse=await fetch(gatewayOrigin+'/api/telemetry/sessions',{method:'POST',
      headers:{authorization:'Bearer '+issuerKey,'content-type':'application/json'},
      body:JSON.stringify({origin:gatewayOrigin})});
    assert.equal(issuedResponse.status,201,'trusted test operator issues token');
    const issued=await issuedResponse.json();
    assert.equal(issued.expiresIn,900,'manual session lifetime');
    const payload=JSON.stringify({action:'completed',repository:{full_name:'ci/neural-grid'},
      workflow_run:{id:8844001,name:'V88.8 browser authentication',status:'completed',conclusion:'success'}});
    const signature=require('node:crypto').createHmac('sha256',webhookSecret).update(payload).digest('hex');
    const webhookResponse=await fetch(gatewayOrigin+'/webhooks/github',{method:'POST',
      headers:{'content-type':'application/json','x-hub-signature-256':'sha256='+signature,
        'x-github-delivery':'v88-8-e2e-0001','x-github-event':'workflow_run'},body:payload});
    assert.equal(webhookResponse.status,202,'seed authenticated telemetry history');
    const authPage=await browser.newPage({viewport:{width:1366,height:768}});
    const browserRequests=[];
    let telemetrySocketClose;
    authPage.on('websocket',socket=>{
      if(socket.url().endsWith('/events'))telemetrySocketClose=new Promise(resolve=>socket.on('close',resolve));
    });
    authPage.on('request',request=>browserRequests.push({url:request.url(),headers:request.headers()}));
    const authPageResponse=await authPage.goto(gatewayOrigin+'/viewer/?fixture=1',{waitUntil:'domcontentloaded'});
    assert.equal(authPageResponse.status(),200,'staging viewer route');
    await authPage.locator('#v80-connection-settings').evaluate(element=>element.open=true);
    await authPage.locator('#v80-gateway').fill(gatewayOrigin);
    await authPage.locator('#v80-token').fill(issued.token);
    await authPage.locator('#v71-connect').click();
    await authPage.locator('#v71-state').filter({hasText:'CONNECTED'}).waitFor({timeout:10000});
    await authPage.locator('#v71-last-event').filter({hasText:'github.workflow.success'}).waitFor({timeout:10000});
    assert.equal(await authPage.locator('#v80-token').inputValue(),'','manual token field cleared');
    assert.equal(await authPage.evaluate(token=>localStorage.getItem('telemetryToken')===token||
      sessionStorage.getItem('telemetryToken')===token,issued.token),false,'token not persisted');
    assert.ok(browserRequests.some(request=>request.url===gatewayOrigin+'/api/connectors'),'authenticated connector status loaded');
    assert.ok(browserRequests.some(request=>request.url===gatewayOrigin+'/api/telemetry/history'),'authenticated history loaded');
    assert.equal(browserRequests.some(request=>request.url.includes('/api/telemetry/sessions')||request.url.includes('/api/monitor/session')),
      false,'browser never calls either token issuer endpoint');
    assert.equal(browserRequests.some(request=>Object.values(request.headers).includes(issuerKey)),false,
      'browser never receives the issuer key');
    assert.ok(telemetrySocketClose,'authenticated WebSocket opened');
    await authPage.locator('#v71-disconnect').click();
    await authPage.locator('#v71-state').filter({hasText:'DISCONNECTED'}).waitFor();
    assert.equal(await authPage.locator('#v71-disconnect').isEnabled(),false,'manual Disconnect disables itself');
    await telemetrySocketClose;
    await authPage.close();
  } finally {await browser.close(); if(server)await new Promise(resolve=>server.close(resolve))}
  fs.writeFileSync(path.join(output,'layout-report.json'),JSON.stringify(report,null,2));
  for(const row of report) console.log(row.viewport+' PASS · 6 panels · '+row.timelinePoints+' chart points');
  console.log('Browser report: '+path.join(output,'layout-report.json'));
})().catch(error=>{console.error(error);process.exitCode=1});

