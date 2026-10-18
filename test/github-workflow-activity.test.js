import test from "node:test";
import assert from "node:assert/strict";
import {createWorkflowActivity} from "../viewer/github-workflow-activity.js";

test("V75 tracks three concurrent GitHub workflows independently",()=>{
 let clock=1000;
 const a=createWorkflowActivity({now:()=>clock});
 const event=(id,runId,status,conclusion="")=>({
  schema:"neural-grid/event/v1",eventId:id,source:"github",
  type:"github.workflow."+ (conclusion||status),
  metadata:{repository:"org/example",runId:String(runId),status,conclusion}
 });
 for(let n=1;n<=3;n++)assert.equal(a.ingest(event("start-"+n,n,"in_progress")),true);
 assert.equal(a.snapshot().activeCount,3);
 assert.equal(a.snapshot().pulse,"medium");
 assert.equal(a.ingest(event("done-1",1,"completed","success")),true);
 assert.equal(a.snapshot().activeCount,2);
 assert.equal(a.ingest(event("done-1",1,"completed","success")),false);
 assert.equal(a.ingest(event("late-start-1",1,"in_progress")),false);
 assert.equal(a.snapshot().activeCount,2);
 assert.equal(a.ingest(event("done-2",2,"completed","failure")),true);
 assert.equal(a.ingest(event("done-3",3,"completed","success")),true);
 assert.equal(a.snapshot().activeCount,0);
 assert.equal(a.snapshot().pulse,"idle");
});
test("V75 never invents run IDs or keeps stale workflow activity as confirmed",()=>{
 let clock=0;
 const a=createWorkflowActivity({now:()=>clock,staleAfterMs:100});
 assert.equal(a.ingest({schema:"neural-grid/event/v1",eventId:"missing",source:"github",
  type:"github.workflow.in_progress",metadata:{repository:"org/example",status:"in_progress"}}),false);
 assert.equal(a.ingest({schema:"neural-grid/event/v1",eventId:"start",source:"github",
  type:"github.workflow.in_progress",metadata:{repository:"org/example",runId:"456",status:"in_progress"}}),true);
 clock=101;
 assert.equal(a.snapshot().activeCount,0);
 assert.equal(a.snapshot().uncertainCount,1);
 assert.equal(a.snapshot().pulse,"idle");
});
