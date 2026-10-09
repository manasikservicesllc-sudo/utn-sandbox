import React, { useEffect, useRef, useState } from 'react';
import type { EvidenceImage } from './DocumentCapture';
import { coverCrop, analyzeFrame, advanceCapture } from './captureAnalysis.mjs';

// Camera pixels stay in this browser until the user submits the assessment.
export default function LiveDocumentCamera({ side, format, onCapture, onClose }: {
  side: 'front' | 'back'; format: 'card' | 'page'; onCapture: (image: EvidenceImage) => void; onClose: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const callback = useRef(onCapture); callback.current = onCapture;
  const locked = useRef(false);
  const previousSide = useRef(side);
  const gate = useRef({armed:true,absent:0,since:null as number | null});
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const [hint, setHint] = useState('ضع البطاقة داخل الإطار · Align all four edges');
  const [auto, setAuto] = useState(true);
  const aspect = format === 'card' ? 85.6 / 53.98 : 1 / 1.414;
  useEffect(() => {
    let disposed = false;
    let stream: MediaStream | undefined;
    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported');
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
        if (disposed) { stream.getTracks().forEach(track => track.stop()); return; }
        if (video.current) { video.current.srcObject = stream; await video.current.play(); }
      } catch (e) {
        if (!disposed) setError((e as Error).name === 'NotAllowedError'
          ? 'اسمح باستخدام الكاميرا، أو ارفع صورة. Allow camera access, or upload an image.'
          : 'تعذر فتح الكاميرا. يمكنك رفع صورة. Camera unavailable. Upload an image instead.');
      }
    }
    void start();
    return () => { disposed = true; stream?.getTracks().forEach(track => track.stop()); };
  }, []);

  function capture() {
    const source = video.current;
    if (!source || !ready || locked.current || !source.videoWidth) return;
    locked.current = true;
    try {
      // Match object-fit: cover exactly. Preserve an 8% margin around the guide.
      const crop = coverCrop(source.videoWidth, source.videoHeight, aspect);
      const scale = Math.min(1, 2000 / Math.max(crop.width, crop.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(crop.width * scale); canvas.height = Math.round(crop.height * scale);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('canvas');
      context.drawImage(source, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
      const base64 = canvas.toDataURL('image/jpeg', 0.92).split(',')[1];
      if (base64.length * 0.75 > 5 * 1024 * 1024) throw new Error('size');
      callback.current({ name: `${side}.jpg`, mimeType: 'image/jpeg', base64 });
    } catch { locked.current = false; setError('تعذر التقاط الصورة. حاول مجددًا أو ارفع صورة. Capture failed. Retry or upload.'); }
  }
  const captureRef = useRef(capture); captureRef.current = capture;
  useEffect(() => {
    const changed = previousSide.current !== side;
    previousSide.current = side;
    if(changed) { locked.current = false; gate.current = {armed:false,absent:0,since:null}; }
    gate.current.since = null;
    setProgress(0);
    setHint(changed ? 'أبعد البطاقة ثم اقلبها · Remove and turn the card over' : 'حاذِ الحواف الأربع مع الإطار · Align all four edges');
    if (!ready || !auto || error) return;
    const state = gate.current;
    let previous: Float32Array | undefined;
    const canvas = document.createElement('canvas');
    canvas.width = 320; canvas.height = Math.round(320/aspect);
    const context = canvas.getContext('2d', {willReadFrequently:true});
    if(!context) return;
    const timer = window.setInterval(() => {
      const source = video.current;
      if(!source?.videoWidth || source.readyState < 2 || locked.current || document.hidden) { state.since=null; return; }
      try {
        const crop=coverCrop(source.videoWidth,source.videoHeight,aspect);
        context.drawImage(source,crop.x,crop.y,crop.width,crop.height,0,0,canvas.width,canvas.height);
        const frame=analyzeFrame(context.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height,previous);
        previous=frame.gray;
        const next=advanceCapture(state,frame,performance.now());
        setProgress(next.progress);
        setHint(!state.armed ? 'أبعد البطاقة ثم اقلبها · Remove and turn the card over'
          : frame.brightness<45 ? 'زد الإضاءة · More light needed'
          : frame.brightness>235 ? 'قلل الانعكاس · Avoid bright glare'
          : !frame.aligned ? 'أظهر الحواف الأربع بمحاذاة الإطار · Align all four edges'
          : !frame.quality ? 'اقترب قليلًا وانتظر التركيز · Wait for a sharp image'
          : !frame.stable ? 'ثبّت البطاقة · Hold still'
          : 'ممتاز، ثبّت البطاقة… نلتقط تلقائيًا · Hold still…');
        if(next.capture) captureRef.current();
      } catch { setAuto(false); setHint('استخدم زر الالتقاط · Use manual capture'); }
    },180);
    return () => window.clearInterval(timer);
  },[ready,side,aspect,auto,error]);

  return <div style={{ background: '#102b29', borderRadius: 18, overflow: 'hidden', color: 'white', width:'100%', minWidth:0 }}>
    <div aria-live="polite" style={{ textAlign: 'center', padding: 14, fontSize: 18, fontWeight: 600 }}>
      {side === 'front' ? format === 'card' ? 'صوّر الأمام · Capture front' : 'صوّر الصفحة · Capture page' : 'اقلب البطاقة · Capture back'}
    </div>
    <div style={{ position: 'relative', background: '#081916', aspectRatio:String(aspect), width:'100%' }}>
      <video ref={video} autoPlay muted playsInline onLoadedData={() => setReady(true)} aria-label="Live document camera" style={{ position:'absolute', inset:0, display: 'block', width: '100%', height:'100%', objectFit: 'cover' }} />
      <div aria-hidden="true" style={{ position: 'absolute', inset: '8%', border: `3px solid ${progress>0 ? '#7aefb4' : '#d4e9dd'}`, borderRadius: format === 'card' ? 12 : 4, boxShadow:'0 0 0 60px #00110c55', pointerEvents: 'none' }} />
      <div aria-hidden="true" style={{position:'absolute',bottom:0,left:0,height:5,width:`${progress*100}%`,background:'#7aefb4',transition:'width .18s linear'}} />
    </div>
    <p aria-live="polite" style={{textAlign:'center',padding:'0 12px',fontSize:16,lineHeight:1.6,minHeight:48}}>{error || (!ready ? 'جارٍ فتح الكاميرا · Opening camera…' : auto ? hint : 'أظهر المستند كاملًا ثم التقط · Keep all corners visible')}</p>
    <label style={{display:'flex',justifyContent:'center',alignItems:'center',gap:8,fontSize:16,padding:'0 12px'}}><input type="checkbox" checked={auto} onChange={e=>setAuto(e.target.checked)} />التقاط تلقائي · Auto capture</label>
    <p style={{textAlign:'center',fontSize:14,padding:'0 12px',color:'#c0d5ca'}}>ضعها على سطح داكن وأبعد أصابعك · Dark surface, fingers off the document</p>
    <div style={{ display: 'flex', gap: 10, padding: 16, flexWrap: 'wrap' }}>
      <button type="button" disabled={!ready || !!error} onClick={capture} style={{ flex: 1, minHeight: 52, border: 0, borderRadius: 12, background: '#e2eee7', color: '#173d34', fontSize: 16, opacity: !ready || error ? 0.5 : 1 }}>التقط الآن · Capture</button>
      <button type="button" onClick={onClose} style={{ minHeight: 52, borderRadius: 12, padding: '0 14px', border: '1px solid #7fa99b', background: 'transparent', color: 'white', fontSize: 16 }}>إغلاق · Close</button>
    </div>
  </div>;
}
