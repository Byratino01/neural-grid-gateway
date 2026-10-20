import test from 'node:test';
import assert from 'node:assert/strict';
import {createGpuTimer} from '../viewer/v88.8/gpu-timer.js';

function timerFixture({available=true,disjoint=false}={}){
  const state={begins:0,ends:0,deleted:0,available,disjoint};
  const extension={TIME_ELAPSED_EXT:1,GPU_DISJOINT_EXT:2};
  const gl={QUERY_RESULT_AVAILABLE:3,QUERY_RESULT:4,isContextLost:()=>false,getExtension:name=>name==='EXT_disjoint_timer_query_webgl2'?extension:null,
    createQuery:()=>({}),beginQuery:()=>state.begins++,endQuery:()=>state.ends++,deleteQuery:()=>state.deleted++,
    getParameter:()=>state.disjoint,getQueryParameter:(_query,p)=>p===3?state.available:1230000};
  return {timer:createGpuTimer({getContext:()=>gl}),state};
}

test('GPU timer queries are asynchronous, non-overlapping, and convert ns to ms',()=>{
  const {timer,state}=timerFixture();
  assert.equal(timer.supported,true);
  timer.poll();timer.begin();timer.begin();timer.end();timer.begin();
  assert.equal(state.begins,1);
  assert.equal(timer.poll(),1.23);
  timer.begin();timer.end();timer.dispose();
  assert.equal(state.deleted,2);
});

test('GPU timer discards disjoint results and unsupported contexts degrade safely',()=>{
  const disjoint=timerFixture({disjoint:true});
  disjoint.timer.begin();disjoint.timer.end();
  assert.equal(disjoint.timer.poll(),null);
  assert.equal(disjoint.state.deleted,1);
  const unsupported=createGpuTimer({getContext:()=>({getExtension:()=>null})});
  assert.equal(unsupported.supported,false);
  assert.equal(unsupported.poll(),null);
});
