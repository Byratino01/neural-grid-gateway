const API_URL="https://api.openai.com/v1/organization/usage/completions";
const MAX_USAGE_ROWS=100;

function safeCount(value){return Number.isSafeInteger(value)&&value>=0?value:null;}
function safeModel(value){return typeof value==="string"&&/^[A-Za-z0-9._:/-]{1,120}$/.test(value)?value:null;}
function usageResult(body){
  const buckets=Array.isArray(body.data)?body.data:[];
  const bucket=buckets.filter(x=>Number.isSafeInteger(x?.start_time)&&Number.isSafeInteger(x?.end_time))
    .sort((a,b)=>b.start_time-a.start_time)[0];
  if(!bucket)return {startTime:null,endTime:null,records:[]};
  const records=(Array.isArray(bucket.results)?bucket.results:[]).slice(0,MAX_USAGE_ROWS).map(row=>({
    model:safeModel(row?.model),requests:safeCount(row?.num_model_requests),
    inputTokens:safeCount(row?.input_tokens),outputTokens:safeCount(row?.output_tokens),
    cachedInputTokens:safeCount(row?.input_cached_tokens)
  }));
  return {startTime:bucket.start_time,endTime:bucket.end_time,records};
}

export function createOpenAIConnector({adminKey="",fetchFn=globalThis.fetch,now=()=>Date.now()}={}){
  const credential=typeof adminKey==="string"?adminKey.trim():"";
  return Object.freeze({
    async snapshot(){
      const observedAt=now();
      const snapshot={schema:"neural-grid/openai-usage/v1",provider:"openai_api",
        status:credential?"connecting":"unconnected",verified:false,observedAt:new Date(observedAt).toISOString(),
        usage:{status:credential?"pending":"not_configured",bucketWidth:"1d",startTime:null,endTime:null,
          records:[],verificationLatencyMs:null},
        limitations:["OpenAI API organization completions usage only; no ChatGPT account, conversation, or subscription activity.",
          "Usage is a provider-reported current UTC-day aggregate that may be partial or delayed, not a real-time event stream.",
          "Model identifiers are included only when present in the usage response.",
          "The gateway does not observe other clients' live request latency or error status.",
          "This connector does not create model requests or application-to-application events."]};
      if(!credential)return snapshot;
      const end=Math.floor(observedAt/1000),start=end-(end%86400);
      const query=new URLSearchParams({start_time:String(start),end_time:String(end),bucket_width:"1d",group_by:"model",limit:"1"});
      const started=now();
      try{
        const response=await fetchFn(API_URL+"?"+query,{method:"GET",redirect:"error",headers:{Authorization:"Bearer "+credential,Accept:"application/json"},
          cache:"no-store",signal:AbortSignal.timeout(10000)});
        snapshot.usage.verificationLatencyMs=Math.max(0,Math.round(now()-started));
        if(!response?.ok){snapshot.usage.status=response?.status===401?"unauthorized":response?.status===403?"forbidden":"provider_error";
          snapshot.status="error";return snapshot;}
        const body=await response.json();
        if(!body||typeof body!=="object"||Array.isArray(body)||!Array.isArray(body.data)){
          snapshot.usage.status="invalid_response";snapshot.status="error";return snapshot;}
        Object.assign(snapshot.usage,{status:"available",...usageResult(body)});
        snapshot.verified=true;snapshot.status="connected";return snapshot;
      }catch(error){
        snapshot.usage.verificationLatencyMs=Math.max(0,Math.round(now()-started));
        snapshot.usage.status=error?.name==="TimeoutError"?"timeout":"unavailable";
        snapshot.status="error";return snapshot;
      }
    }
  });
}

export {usageResult};
