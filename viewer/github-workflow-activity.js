// V75 read-only GitHub workflow concurrency model. No timers or Three.js mutations.
export function createWorkflowActivity({now=()=>Date.now(),staleAfterMs=15*60*1000}={}){
 const runs=new Map();
 const accepted=new Set();
 const validId=x=>typeof x==="string"&&/^[0-9]{1,24}$/.test(x);
 function ingest(event){
  if(event?.schema!=="neural-grid/event/v1"||event.source!=="github"||
     typeof event.eventId!=="string"||accepted.has(event.eventId))return false;
  if(!event.type?.startsWith("github.workflow."))return false;
  const id=String(event.metadata?.runId??"");
  if(!validId(id))return false; // Cannot safely count runs without stable GitHub IDs.
  const phase=String(event.metadata?.status||"").toLowerCase();
  const conclusion=String(event.metadata?.conclusion||"").toLowerCase();
  const active=phase==="queued"||phase==="in_progress"||phase==="requested"||phase==="waiting"||phase==="pending";
  const completed=phase==="completed"||Boolean(conclusion);
  if(!active&&!completed)return false;
  accepted.add(event.eventId);
  if(accepted.size>2000)accepted.delete(accepted.values().next().value);
  const previous=runs.get(id);
  if(previous?.terminal && active)return false; // delayed start cannot resurrect completed run
  runs.set(id,{id,active:active&&!completed,terminal:completed,
   conclusion:completed?conclusion:null,updatedAt:now()});
  return true;
 }
 function snapshot(){
  const t=now();
  const all=[...runs.values()];
  const active=all.filter(r=>r.active&&t-r.updatedAt<=staleAfterMs);
  const uncertain=all.filter(r=>r.active&&t-r.updatedAt>staleAfterMs);
  return {activeCount:active.length,uncertainCount:uncertain.length,
   pulse:active.length===0?"idle":active.length===1?"slow":active.length<5?"medium":"fast",
   runs:all.map(r=>({...r,stale:r.active&&t-r.updatedAt>staleAfterMs}))};
 }
 return Object.freeze({ingest,snapshot});
}
