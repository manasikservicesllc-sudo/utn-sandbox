import React, { useEffect, useRef, useState } from 'react';
import type { EvidenceImage } from './DocumentCapture';

// Web-only camera. Nothing leaves the browser until the user submits assessment.
export default function LiveDocumentCamera({ side, onCapture, onClose }: {
  side: 'front' | 'back'; onCapture: (image: EvidenceImage) => void; onClose: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [capturing, setCapturing] = useState(false);
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
          ? 'اسمح باستخدام الكاميرا من إعدادات المتصفح، أو ارفع صورة. Allow camera access, or upload an image.'
          : 'تعذر فتح الكاميرا. يمكنك رفع صورة بدلًا منها. Camera unavailable. You can upload an image instead.');
      }
    }
    void start();
    return () => { disposed = true; stream?.getTracks().forEach(track => track.stop()); };
  }, []);
  function capture() {
    const source = video.current;
    if (!source || !ready || capturing || !source.videoWidth) return;
    setCapturing(true);
    try {
      // Keep the complete frame: the guide must never crop document corners.
      const scale = Math.min(1, 2000 / Math.max(source.videoWidth, source.videoHeight));
      const canvas = window.document.createElement('canvas');
      canvas.width = Math.round(source.videoWidth * scale); canvas.height = Math.round(source.videoHeight * scale);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('canvas');
      context.drawImage(source, 0, 0, canvas.width, canvas.height);
      const base64 = canvas.toDataURL('image/jpeg', 0.92).split(',')[1];
      if (base64.length * 0.75 > 5 * 1024 * 1024) throw new Error('size');
      onCapture({ name: `${side}.jpg`, mimeType: 'image/jpeg', base64 });
    } catch { setError('تعذر التقاط الصورة. حاول مجددًا أو ارفع صورة. Capture failed. Retry or upload.'); }
    finally { setCapturing(false); }
  }
  return <div style={{ background: '#102b29', borderRadius: 18, overflow: 'hidden', color: 'white' }}>
    <div aria-live="polite" style={{ textAlign: 'center', padding: 16, fontSize: 18, fontWeight: 600 }}>
      {side === 'front' ? 'صوّر الأمام · Capture front' : 'اقلب البطاقة · Capture back'}
    </div>
    <div style={{ position: 'relative', background: '#081916' }}>
      <video ref={video} autoPlay muted playsInline onLoadedData={() => setReady(true)} aria-label="Live document camera" style={{ display: 'block', width: '100%', maxHeight: '50dvh', objectFit: 'contain' }} />
      <div aria-hidden="true" style={{ position: 'absolute', inset: '12% 6%', border: '2px solid #d4e9dd', borderRadius: 16, pointerEvents: 'none' }} />
    </div>
    {error ? <p role="alert" style={{ padding: '0 16px', lineHeight: 1.7 }}>{error}</p> : <p style={{ textAlign: 'center', padding: '0 12px', lineHeight: 1.6 }}>{ready ? 'أظهر البطاقة كاملة وتجنب الانعكاس · Keep all corners visible' : 'جارٍ فتح الكاميرا · Opening camera…'}</p>}
    <div style={{ display: 'flex', gap: 10, padding: 16, flexWrap: 'wrap' }}>
      <button type="button" disabled={!ready || capturing || !!error} onClick={capture} style={{ flex: 1, minHeight: 52, border: 0, borderRadius: 12, background: '#e2eee7', color: '#173d34', fontSize: 16, opacity: !ready || error ? 0.5 : 1 }}>التقط الآن · Capture</button>
      <button type="button" onClick={onClose} style={{ minHeight: 52, borderRadius: 12, padding: '0 14px', border: '1px solid #7fa99b', background: 'transparent', color: 'white', fontSize: 16 }}>إغلاق · Close</button>
    </div>
  </div>;
}
