// Lightweight, on-device alignment/quality checks, not document authentication.
export function coverCrop(sw, sh, aspect) {
  const width = Math.min(sw, sh * aspect), height = width / aspect;
  return {x:(sw-width)/2,y:(sh-height)/2,width,height};
}

export function analyzeFrame(data, width, height, previous) {
  const gray = new Float32Array(width * height);
  let brightness=0, motion=0, detail=0;
  for(let i=0;i<gray.length;i++) {
    gray[i]=data[i*4]*.299+data[i*4+1]*.587+data[i*4+2]*.114;
    brightness+=gray[i];
    if(previous?.length===gray.length) motion+=Math.abs(gray[i]-previous[i]);
  }
  const x0=Math.round(width*.08), x1=Math.round(width*.92);
  const y0=Math.round(height*.08), y1=Math.round(height*.92);
  let count=0;
  for(let y=y0+3;y<y1-3;y++) for(let x=x0+3;x<x1-3;x++) {
    const i=y*width+x;
    detail+=Math.abs(4*gray[i]-gray[i-1]-gray[i+1]-gray[i-width]-gray[i+width]); count++;
  }
  // Require a continuous boundary near every guide edge, rather than detecting
  // arbitrary text/high contrast somewhere inside the document.
  function edge(horizontal, position, start, end) {
    let best=0;
    for(let offset=-3;offset<=3;offset++) {
      let hits=0,total=0;
      for(let p=start+5;p<end-5;p++) {
        const x=horizontal?p:position+offset, y=horizontal?position+offset:p;
        const i=y*width+x, step=horizontal?width:1;
        if(Math.abs(gray[i-2*step]-gray[i+2*step])>24) hits++;
        total++;
      }
      best=Math.max(best,hits/total);
    }
    return best;
  }
  const edges=[edge(true,y0,x0,x1),edge(true,y1,x0,x1),edge(false,x0,y0,y1),edge(false,x1,y0,y1)];
  const aligned=edges.every(v=>v>.68);
  brightness/=gray.length; motion=previous?motion/gray.length:Infinity; detail/=count;
  const quality=brightness>45 && brightness<235 && detail>5;
  return {gray,aligned,quality,stable:motion<3.5,brightness,detail,motion,edges};
}

export function advanceCapture(state, frame, now) {
  // A second side must leave the guide first, so the unchanged front cannot
  // be captured again while the customer is reading the turn-over instruction.
  if(!state.armed) {
    state.absent=frame.aligned?0:state.absent+1;
    if(state.absent>=3) state.armed=true;
  }
  const good=state.armed && frame.aligned && frame.quality && frame.stable;
  if(!good) state.since=null;
  else if(state.since===null) state.since=now;
  const progress=state.since===null?0:Math.min(1,(now-state.since)/1300);
  return {progress,capture:progress===1};
}
