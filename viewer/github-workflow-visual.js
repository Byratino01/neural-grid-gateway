// V76 presentation state for the existing GitHub station.
// The viewer chooses how to render this state; this module never touches Three.js.
export function workflowVisualState(snapshot){
 const count=Number(snapshot?.activeCount);
 const uncertain=Number(snapshot?.uncertainCount);
 if(!Number.isSafeInteger(count)||count<0||!Number.isSafeInteger(uncertain)||uncertain<0)
  throw new TypeError("valid workflow counts required");
 const tier=count===0?"idle":count===1?"slow":count<=4?"medium":"fast";
 return Object.freeze({
  stationId:"github",activeCount:count,uncertainCount:uncertain,
  pulseTier:tier,animate:count>0,
  periodMs:count===0?0:count===1?2200:count<=4?1300:700,
  intensity:count===0?0.2:count===1?0.55:count<=4?0.8:1,
  countLabel:count>0?String(count):uncertain>0?"?":"0",
  status:count>0?"active":uncertain>0?"uncertain":"idle"
 });
}
export function applyWorkflowVisual(root,visual){
 if(!root||typeof root.querySelector!=="function")throw new TypeError("viewer root required");
 if(visual?.stationId!=="github")throw new TypeError("GitHub visual state required");
 const station=root.querySelector('[data-station-id="github"]');
 if(!station)return false;
 station.dataset.workflowPulse=visual.pulseTier;
 station.dataset.workflowStatus=visual.status;
 station.style.setProperty("--workflow-pulse-period",visual.periodMs+"ms");
 station.style.setProperty("--workflow-pulse-intensity",String(visual.intensity));
 const counter=station.querySelector("[data-workflow-count]");
 if(counter)counter.textContent=visual.countLabel;
 station.setAttribute("aria-label","GitHub: "+visual.activeCount+" active workflows"+
  (visual.uncertainCount?", "+visual.uncertainCount+" unconfirmed":""));
 return true;
}
