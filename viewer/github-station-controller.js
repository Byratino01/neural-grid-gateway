// V78: connect verified telemetry to the existing GitHub HUD station.
// This is an opt-in DOM controller; it never mutates the Three.js scene or GLB.
import {createWorkflowActivity} from "./github-workflow-activity.js";
import {workflowVisualState,applyWorkflowVisual} from "./github-workflow-visual.js";

export function createGithubStationController({root,now=()=>Date.now()}={}){
 if(!root||typeof root.querySelector!=="function")throw new TypeError("viewer root required");
 const activity=createWorkflowActivity({now});
 function refresh(){
  const visual=workflowVisualState(activity.snapshot());
  return {visual,applied:applyWorkflowVisual(root,visual)};
 }
 function ingest(event){
  const accepted=activity.ingest(event);
  if(accepted)refresh();
  return accepted;
 }
 return Object.freeze({ingest,refresh,snapshot:()=>activity.snapshot()});
}
