// V75 read-only GitHub workflow concurrency model. No timers or Three.js mutations.
export function createWorkflowActivity({now=()=>Date.now(),staleAfterMs=15*60*1000}={}){
 const runs=new Map();
 const accepted=new Set();
 const validId=x=>typeof x==="string"&&/^[0-9]{1,24}$/.test(x);
 function ingest(event){
  if(event?.schema!=="neural-grid/event/v1"||event.source!=="github"||
     typeof event.eventId!=="string"||accepted.has(event.eventId))return false;
  if(!event.type?.startsWith("github.workflow."))return false;
  const repository=String(event.metadata?.repository??"");
  const runId=String(event.metadata?.runId??"");
  if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)||!validId(runId))return false;
  const id=repository+"#"+runId;
  const phase=String(event.metadata?.status||"").toLowerCase();
  const conclusion=String(event.metadata?.conclusion||"").toLowerCase();
  const active=phase==="queued"||phase==="in_progress"||phase==="requested"||phase==="waiting"||phase==="pending";
  const completed=phase==="completed"||Boolean(conclusion);
  if(!active&&!completed)return false;
  accepted.add(event.eventId);
  if(accepted.size>2000)accepted.delete(accepted.values().next().value);
  const previous=runs.get(id);
  if(previous?.terminal && active)return false; // delayed start cannot resurrect completed run
  runs.set(id,{id,repository,runId,active:active&&!completed,terminal:completed,
   lastPhase:phase,conclusion:completed?conclusion:null,updatedAt:now()});
  return true;
 }
 function snapshot(){
  const t=now();
  const all=[...runs.values()];
  const active=all.filter(r=>r.active&&t-r.updatedAt<=staleAfterMs);
  const uncertain=all.filter(r=>r.active&&t-r.updatedAt>staleAfterMs);
  const completedRuns=all.filter(r=>r.terminal);
  const failedCount=completedRuns.filter(r=>["failure","timed_out","cancelled"].includes(r.conclusion)).length;
  return {activeCount:active.length,uncertainCount:uncertain.length,
   queuedCount:all.filter(r=>r.active&&r.lastPhase==="queued").length,
   completedCount:completedRuns.length,failedCount,eventCount:accepted.size,
   pulse:active.length===0?"idle":active.length===1?"slow":active.length<5?"medium":"fast",
   runs:all.map(r=>({...r,stale:r.active&&t-r.updatedAt>staleAfterMs}))};
 }
 function hydrate(events){
  if(!Array.isArray(events))return 0;
  let count=0;
  for(const event of events)if(ingest(event))count++;
  return count;
 }
 return Object.freeze({ingest,hydrate,snapshot});
}
