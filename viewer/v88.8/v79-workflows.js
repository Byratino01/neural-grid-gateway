/* V79: monitor-only lifecycle visualization, no Three.js scene mutations. */
(()=>{'use strict';
const runs=new Map(),seen=new Set();
const staleMs=15*60*1000;
function elements(){return [document.querySelector('#stations button[data-id="github"]'),document.querySelector('#v71-connectors [data-connector="github"]')].filter(Boolean);}
function render(){
 const now=Date.now();let count=0,uncertain=0;
 for(const r of runs.values()){if(!r.active)continue;if(now-r.at>staleMs)uncertain++;else count++;}
 const tier=count===0?'idle':count===1?'slow':count<5?'medium':'fast';
 for(const el of elements()){
   el.dataset.workflowStatus=count?'active':uncertain?'uncertain':'idle';
   el.dataset.workflowPulse=tier;
   el.style.setProperty('--workflow-pulse-period',count===1?'2200ms':count<5?'1300ms':'700ms');
   let badge=el.querySelector('[data-workflow-count]');
   if(!badge){badge=document.createElement('span');badge.dataset.workflowCount='';badge.className='v79-count';el.append(badge);}
   badge.textContent=count?String(count):uncertain?'?':'0';
   badge.title=count+' active GitHub workflows'+(uncertain?', '+uncertain+' unconfirmed':'');
 }
}
function ingest(event){
 if(event?.schema!=='neural-grid/event/v1'||event.source!=='github'||typeof event.eventId!=='string'||seen.has(event.eventId))return;
 if(!/^github\.workflow\./.test(event.type||''))return;
 const id=String(event.metadata?.runId??'');if(!/^[0-9]{1,24}$/.test(id))return;
 const status=String(event.metadata?.status||'').toLowerCase();
 const conclusion=String(event.metadata?.conclusion||'').toLowerCase();
 const terminal=status==='completed'||Boolean(conclusion);
 const active=['queued','in_progress','requested','waiting','pending'].includes(status);
 if(!terminal&&!active)return;
 seen.add(event.eventId);if(seen.size>2000)seen.delete(seen.values().next().value);
 const prior=runs.get(id);if(prior?.terminal&&!terminal)return;
 runs.set(id,{active:active&&!terminal,terminal,at:Date.now()});render();
}
document.addEventListener('ng:monitor-event',e=>ingest(e.detail));
// A disconnected telemetry stream must never imply live workflow activity.
const connection=document.getElementById('v71-state');
if(connection)new MutationObserver(()=>{if(connection.dataset.state!=='connected'){runs.clear();render();}}).observe(connection,{attributes:true,attributeFilter:['data-state']});
setInterval(render,30000);render();
})();
