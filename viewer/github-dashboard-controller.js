// V88 authoritative GitHub telemetry binding for dashboard panels 03–06.
import {createWorkflowActivity} from "./github-workflow-activity.js";
import {workflowVisualState,applyWorkflowVisual} from "./github-workflow-visual.js";

export function createGithubDashboardController({root,now=()=>Date.now(),connectionState=()=>({status:"disconnected",verified:false})}={}){
 if(!root||typeof root.querySelector!=="function")throw new TypeError("dashboard root required");
 const activity=createWorkflowActivity({now}); let eventFlowCount=0;
 const set=(selector,value)=>{const el=root.querySelector(selector);if(el)el.textContent=String(value);};
 function render(){
  const snapshot=activity.snapshot(),visual=workflowVisualState(snapshot),connection=connectionState()||{};
  set('[data-panel="system-status"] [data-metric="queued"]',snapshot.queuedCount);
  set('[data-panel="system-status"] [data-metric="active"]',snapshot.activeCount);
  set('[data-panel="system-status"] [data-metric="completed"]',snapshot.completedCount);
  set('[data-panel="system-status"] [data-metric="failed"]',snapshot.failedCount);
  set('[data-panel="system-status"] [data-count-scope]','active is current; completed/failed are history');
  set('[data-panel="event-flow"] [data-source="github"]',eventFlowCount);
  set('[data-panel="station-metrics"] [data-station="github"] [data-state]',visual.status.toUpperCase());
  set('[data-panel="station-metrics"] [data-station="github"] [data-active-count]',snapshot.activeCount);
  set('[data-panel="connection-map"] [data-connection="github"] [data-state]',connection.verified?'VERIFIED TELEMETRY · '+(snapshot.activeCount?'ACTIVE':'IDLE'):'UNVERIFIED');
  applyWorkflowVisual(root,visual); return {snapshot,visual,connection,eventFlowCount};
 }
 function ingest(event){const accepted=activity.ingest(event);if(accepted){eventFlowCount++;render();}return accepted;}
 function hydrate(events){let count=0;for(const event of Array.isArray(events)?events:[])if(ingest(event))count++;return count;}
 return Object.freeze({ingest,hydrate,render,snapshot:()=>activity.snapshot()});
}
