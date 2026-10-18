/* V87: read-only, independently keyed GitHub workflow telemetry. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root&&root.document)api.mount(root.document);
})(typeof globalThis!=='undefined'?globalThis:null,function(){
  'use strict';
  const terminal=new Set(['completed','success','failure','cancelled','timed_out','skipped','neutral','action_required','stale']);
  function createTracker(){
    const runs=new Map();
    function ingest(e){
      if(!e||e.schema!=='neural-grid/event/v1'||e.source!=='github'||!/^github\.workflow\./.test(e.type))return false;
      const m=e.metadata||{};
      if(!/^[1-9][0-9]{0,19}$/.test(String(m.runId||''))||typeof m.repository!=='string'||!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(m.repository))return false;
      const key=m.repository+'#'+m.runId;
      const status=String(m.status||'').toLowerCase();
      const conclusion=String(m.conclusion||'').toLowerCase();
      const action=String(m.action||'').toLowerCase();
      if(!['queued','requested','waiting','pending','in_progress','completed'].includes(status)&&!terminal.has(conclusion))return false;
      const previous=runs.get(key);
      const finished=status==='completed'||terminal.has(conclusion);
      // Do not revive a completed run from a delayed queued/in_progress event.
      if(previous?.finished&&!finished)return false;
      const time=Date.parse(e.timestamp||'');
      if(previous&&Number.isFinite(time)&&time<previous.time)return false;
      runs.set(key,{key,repository:m.repository,runId:String(m.runId),workflow:String(m.workflow||'Workflow').slice(0,100),status:finished?'completed':status,conclusion:finished?(conclusion||action||'completed'):'',finished,time:Number.isFinite(time)?time:Date.now()});
      if(runs.size>200){const oldest=[...runs.values()].sort((a,b)=>a.time-b.time)[0];runs.delete(oldest.key);}
      return true;
    }
    function snapshot(){const all=[...runs.values()].sort((a,b)=>b.time-a.time);return {active:all.filter(x=>!x.finished),recent:all.slice(0,8),total:all.length};}
    function reset(){runs.clear();}
    return {ingest,snapshot,reset};
  }
  function mount(doc){
    const panel=doc.getElementById('v71-monitor');if(!panel)return;
    const tracker=createTracker();
    const box=doc.createElement('section');box.id='v87-github-workflows';box.setAttribute('aria-label','Verified GitHub workflow activity');
    const title=doc.createElement('h4');title.textContent='GITHUB WORKFLOWS · VERIFIED EVENTS';
    const summary=doc.createElement('p');summary.id='v87-github-summary';summary.textContent='0 active runs · no verified workflow events';
    const list=doc.createElement('ol');list.id='v87-github-runs';
    const station=doc.createElement('div');station.id='v87-github-indicator';station.textContent='GitHub station · idle';
    box.append(title,summary,station,list);panel.append(box);
    function render(){const data=tracker.snapshot();summary.textContent=data.active.length+' active run'+(data.active.length===1?'':'s')+' · '+data.total+' observed';
      station.textContent='GitHub station · '+(data.active.length?data.active.length+' concurrent workflow'+(data.active.length===1?'':'s'):'idle');
      station.dataset.activity=data.active.length?'active':'idle';list.replaceChildren();
      for(const run of data.recent){const li=doc.createElement('li');li.textContent=run.repository+' · '+run.workflow+' · #'+run.runId+' · '+(run.finished?run.conclusion:run.status);list.append(li);}
    }
    doc.addEventListener('ng:monitor-event',e=>{if(tracker.ingest(e.detail))render();});
    doc.addEventListener('ng:monitor-reset',()=>{tracker.reset();render();});
    render();
  }
  return {createTracker,mount};
});
