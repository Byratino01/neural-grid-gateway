// Optional asynchronous WebGL2 GPU elapsed-time query. Never blocks waiting for a result.
export function createGpuTimer(renderer) {
  let gl,extension,pending=null,active=null,disabled=false;
  try {
    gl=renderer?.getContext?.();
    if(!gl||typeof gl.getQueryParameter!=='function'||typeof gl.createQuery!=='function')return unavailable();
    extension=gl.getExtension('EXT_disjoint_timer_query_webgl2');
  }catch{return unavailable();}
  if(!extension)return unavailable();
  function cleanup(query){try{if(query&&!gl.isContextLost())gl.deleteQuery(query);}catch{}}
  function stop(){
    if(active){
      try{if(!gl.isContextLost())gl.endQuery(extension.TIME_ELAPSED_EXT);}catch{disabled=true;}
      pending=active;active=null;
    }
  }
  return {
    supported:true,
    begin(){
      if(disabled||active||pending||gl.isContextLost())return;
      try{active=gl.createQuery();if(!active){disabled=true;return;}gl.beginQuery(extension.TIME_ELAPSED_EXT,active);}
      catch{cleanup(active);active=null;disabled=true;}
    },
    end:stop,
    poll(){
      if(disabled||!pending||gl.isContextLost())return null;
      try{
        if(gl.getParameter(extension.GPU_DISJOINT_EXT)){cleanup(pending);pending=null;return null;}
        if(!gl.getQueryParameter(pending,gl.QUERY_RESULT_AVAILABLE))return null;
        const nanoseconds=Number(gl.getQueryParameter(pending,gl.QUERY_RESULT));
        cleanup(pending);pending=null;
        return Number.isFinite(nanoseconds)&&nanoseconds>0?nanoseconds/1e6:null;
      }catch{cleanup(pending);pending=null;disabled=true;return null;}
    },
    dispose(){stop();cleanup(pending);pending=null;disabled=true;}
  };
}

function unavailable(){return {supported:false,begin(){},end(){},poll(){return null;},dispose(){}};}
