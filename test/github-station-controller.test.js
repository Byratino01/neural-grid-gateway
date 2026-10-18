import test from "node:test";
import assert from "node:assert/strict";
import {createGithubStationController} from "../viewer/github-station-controller.js";

test("V78 viewer GitHub HUD reflects 3 running, then 2, then idle",()=>{
 const vars={},attrs={},data={},count={textContent:""};
 const station={dataset:data,style:{setProperty:(k,v)=>vars[k]=v},
  querySelector:s=>s==="[data-workflow-count]"?count:null,
  setAttribute:(k,v)=>attrs[k]=v};
 const root={querySelector:s=>s==='[data-station-id="github"]'?station:null};
 const c=createGithubStationController({root,now:()=>1000});
 const event=(eventId,runId,status,conclusion="")=>({
  schema:"neural-grid/event/v1",eventId,source:"github",
  type:"github.workflow."+(conclusion||status),
  metadata:{repository:"org/example",runId:String(runId),status,conclusion}});
 assert.equal(c.refresh().visual.activeCount,0);
 for(let i=1;i<=3;i++)assert.equal(c.ingest(event("start-"+i,i,"in_progress")),true);
 assert.equal(count.textContent,"3");
 assert.equal(data.workflowPulse,"medium");
 assert.equal(c.ingest(event("done-1",1,"completed","success")),true);
 assert.equal(count.textContent,"2");
 assert.equal(c.ingest(event("done-1",1,"completed","success")),false);
 for(let i=2;i<=3;i++)assert.equal(c.ingest(event("done-"+i,i,"completed","success")),true);
 assert.equal(count.textContent,"0");
 assert.equal(data.workflowStatus,"idle");
 assert.match(attrs["aria-label"],/0 active workflows/);
 assert.equal(vars["--workflow-pulse-period"],"0ms");
});
