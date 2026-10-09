import test from 'node:test';
import assert from 'node:assert/strict';
import {coverCrop,analyzeFrame,advanceCapture} from '../apps/utn/captureAnalysis.mjs';
const w=320,h=202;
function fixture({card=true,texture=true,cover=false}={}) {
  const data=new Uint8ClampedArray(w*h*4);
  for(let y=0;y<h;y++) for(let x=0;x<w;x++) {
    const inside=card && x>=26 && x<=294 && y>=16 && y<=186;
    let c=inside?210:25;
    if(inside && texture && y>35 && y<165 && x>45 && x<270 && y%13<3) c=55;
    if(cover && y<30) c=25;
    const i=(y*w+x)*4; data[i]=data[i+1]=data[i+2]=c; data[i+3]=255;
  }
  return data;
}
test('portrait camera crops to landscape preview with margin and source bounds',()=>{
  const c=coverCrop(1080,1920,85.6/53.98);
  assert.equal(c.width,1080); assert.ok(c.height<700);
  assert.ok(c.y>600); assert.ok(c.y+c.height<=1920);
  assert.equal(c.width/c.height,85.6/53.98);
});
test('alignment rejects empty, textureless and missing-edge frames',()=>{
  const good=analyzeFrame(fixture(),w,h);
  assert.equal(good.aligned,true); assert.equal(good.quality,true);
  assert.equal(analyzeFrame(fixture({card:false}),w,h).aligned,false);
  assert.equal(analyzeFrame(fixture({texture:false}),w,h).quality,false);
  assert.equal(analyzeFrame(fixture({cover:true}),w,h).aligned,false);
  assert.equal(analyzeFrame(fixture(),w,h,good.gray).stable,true);
  assert.equal(analyzeFrame(fixture({card:false}),w,h,good.gray).stable,false);
});
test('auto capture waits for stable dwell and resets on motion',()=>{
  const state={armed:true,absent:0,since:null}, good={aligned:true,quality:true,stable:true};
  assert.equal(advanceCapture(state,good,0).capture,false);
  assert.equal(advanceCapture(state,good,1200).capture,false);
  assert.equal(advanceCapture(state,{...good,stable:false},1300).progress,0);
  assert.equal(advanceCapture(state,good,1500).capture,false);
  assert.equal(advanceCapture(state,good,2800).capture,true);
});
test('back side requires leaving guide before new stable capture',()=>{
  const state={armed:false,absent:0,since:null}, good={aligned:true,quality:true,stable:true};
  for(let n=0;n<20;n++) assert.equal(advanceCapture(state,good,n*180).capture,false);
  for(let n=0;n<3;n++) advanceCapture(state,{...good,aligned:false},4000+n*180);
  assert.equal(state.armed,true);
  assert.equal(advanceCapture(state,good,5000).capture,false);
  assert.equal(advanceCapture(state,good,6400).capture,true);
});
