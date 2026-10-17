import test from "node:test";
import assert from "node:assert/strict";
import {workflowVisualState,applyWorkflowVisual} from "../viewer/github-workflow-visual.js";

test("V76 pulse tiers represent 0, 1, 3, 5 concurrent runs",()=>{
 const state=n=>workflowVisualState({activeCount:n,uncertainCount:0});
 assert.deepEqual([0,1,3,5].map(n=>state(n).pulseTier),
  ["idle","slow","medium","fast"]);
 assert.deepEqual([0,1,3,5].map(n=>state(n).periodMs),
  [0,2200,1300,700]);
 assert.deepEqual([0,1,3,5].map(n=>state(n).countLabel),
  ["0","1","3","5"]);
 assert.equal(state(0).animate,false);
 assert.equal(state(5).animate,true);
});
test("V76 unconfirmed workflow status is distinct from active",()=>{
 const state=workflowVisualState({activeCount:0,uncertainCount:2});
 assert.equal(state.status,"uncertain");
 assert.equal(state.countLabel,"?");
 assert.equal(state.animate,false);
 assert.throws(()=>workflowVisualState({activeCount:-1,uncertainCount:0}));
});
test("V76 applies presentation only to existing GitHub control",()=>{
 const vars={},attrs={},data={};
 const counter={textContent:""};
 const station={dataset:data,style:{setProperty:(k,v)=>vars[k]=v},
  querySelector:s=>s==="[data-workflow-count]"?counter:null,
  setAttribute:(k,v)=>attrs[k]=v};
 const root={querySelector:s=>s==='[data-station-id="github"]'?station:null};
 const state=workflowVisualState({activeCount:3,uncertainCount:0});
 assert.equal(applyWorkflowVisual(root,state),true);
 assert.equal(data.workflowPulse,"medium");
 assert.equal(counter.textContent,"3");
 assert.equal(vars["--workflow-pulse-period"],"1300ms");
 assert.match(attrs["aria-label"],/3 active workflows/);
 assert.equal(applyWorkflowVisual({querySelector:()=>null},state),false);
});
