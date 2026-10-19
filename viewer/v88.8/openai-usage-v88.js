/* Read-only OpenAI API usage snapshot validation; never signals application interactions. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root&&root.document){
    const controller=api.createController(snapshot=>root.document.dispatchEvent(
      new root.CustomEvent('ng:openai-usage',{detail:snapshot})));
    root.__NG_OPENAI_USAGE=Object.freeze(controller);
  }
})(typeof globalThis!=='undefined'?globalThis:null,function(){
  'use strict';
  const count=value=>Number.isSafeInteger(value)&&value>=0?value:null;
  const model=value=>typeof value==='string'&&/^[A-Za-z0-9._:/-]{1,120}$/.test(value)?value:null;
  function normalize(payload){
    if(!payload||payload.schema!=='neural-grid/openai-usage/v1'||payload.provider!=='openai_api'||
      !['connected','unconnected','error'].includes(payload.status))return null;
    const usage=payload.usage&&typeof payload.usage==='object'?payload.usage:{};
    const records=Array.isArray(usage.records)?usage.records.slice(0,100).map(row=>({model:model(row?.model),
      requests:count(row?.requests),inputTokens:count(row?.inputTokens),outputTokens:count(row?.outputTokens),
      cachedInputTokens:count(row?.cachedInputTokens)})):[];
    const observedAt=typeof payload.observedAt==='string'&&Number.isFinite(Date.parse(payload.observedAt))?payload.observedAt:null;
    const startTime=count(usage.startTime),endTime=count(usage.endTime);
    return Object.freeze({status:payload.status,verified:payload.status==='connected'&&payload.verified===true,
      usage:Object.freeze({status:['available','not_configured','unauthorized','forbidden','provider_error','invalid_response','timeout','unavailable'].includes(usage.status)?usage.status:'not_configured',
        bucketWidth:usage.bucketWidth==='1d'?'1d':null,startTime,endTime,records:Object.freeze(records)})});
  }
  function createController(onUpdate=()=>{}){
    let current=null;
    return Object.freeze({
      ingest(payload){const next=normalize(payload);if(!next)return false;current=next;onUpdate(next);return true;},
      reset(){current=null;onUpdate(null);},
      snapshot(){return current;}
    });
  }
  return Object.freeze({normalize,createController});
});
