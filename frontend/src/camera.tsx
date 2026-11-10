import { useEffect, useRef, useState } from 'react';
import { Camera, Circle, RefreshCw, Square, Video, X } from 'lucide-react';

type Props = { mode: 'photo' | 'video'; onCapture: (file: File) => void; onClose: () => void; onFallback: () => void };
const MAX_SECONDS = 20;

function videoType() {
  const types = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
  return types.find((type) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) || '';
}

/** Cámara integrada: vista previa en vivo, cambio de cámara, foto o video corto. */
export function CameraCapture({ mode, onCapture, onClose, onFallback }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [error, setError] = useState('');
  const [recording, setRecording] = useState(0);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!navigator.mediaDevices?.getUserMedia) { setError('Tu navegador no permite usar la cámara aquí.'); return; }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1600 } }, audio: mode === 'video' })
      .then((media) => {
        if (cancelled) { media.getTracks().forEach((track) => track.stop()); return; }
        stream.current = media;
        if (video.current) { video.current.srcObject = media; void video.current.play(); }
      })
      .catch((reason: DOMException) => setError(reason.name === 'NotAllowedError'
        ? 'No diste permiso para usar la cámara. Puedes activarlo en la configuración del navegador o elegir un archivo.'
        : 'No se pudo abrir la cámara. Puedes elegir un archivo de tu galería.'));
    return () => { cancelled = true; stream.current?.getTracks().forEach((track) => track.stop()); stream.current = null; };
  }, [facing, mode]);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => setRecording((seconds) => {
      if (seconds >= MAX_SECONDS) { recorder.current?.stop(); return seconds; }
      return seconds + 1;
    }), 1000);
    return () => window.clearInterval(timer);
  }, [recording > 0]);

  function takePhoto() {
    const element = video.current;
    if (!element?.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = element.videoWidth;
    canvas.height = element.videoHeight;
    canvas.getContext('2d')!.drawImage(element, 0, 0);
    setFlash(true);
    window.setTimeout(() => setFlash(false), 180);
    canvas.toBlob((blob) => {
      if (blob) onCapture(new File([blob], `foto-${Date.now()}.jpg`, { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.85);
  }

  function toggleRecording() {
    if (recorder.current?.state === 'recording') { recorder.current.stop(); return; }
    if (!stream.current) return;
    const type = videoType();
    const media = new MediaRecorder(stream.current, type ? { mimeType: type, videoBitsPerSecond: 2_000_000 } : undefined);
    const chunks: Blob[] = [];
    media.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    media.onstop = () => {
      setRecording(0);
      const mime = (media.mimeType || 'video/webm').split(';')[0];
      onCapture(new File(chunks, `video-${Date.now()}.${mime.includes('mp4') ? 'mp4' : 'webm'}`, { type: mime }));
    };
    media.start(1000);
    recorder.current = media;
    setRecording(1);
  }

  return <div className="camera" role="dialog" aria-modal="true" aria-label={mode === 'photo' ? 'Tomar foto' : 'Grabar video'}>
    <video ref={video} playsInline muted className={facing === 'user' ? 'mirror' : ''} />
    {flash && <div className="camera-flash" />}
    <div className="camera-top">
      <button aria-label="Cerrar cámara" onClick={onClose}><X size={22} /></button>
      {recording > 0 && <span className="rec"><Circle size={10} fill="currentColor" /> {String(recording - 1).padStart(2, '0')}s / {MAX_SECONDS}s</span>}
      <button aria-label="Cambiar de cámara" disabled={recording > 0} onClick={() => setFacing(facing === 'user' ? 'environment' : 'user')}><RefreshCw size={20} /></button>
    </div>
    <p className="camera-hint">{mode === 'photo' ? 'Encuadra la escena. Evita rostros y placas legibles.' : `Video de hasta ${MAX_SECONDS} segundos. Evita rostros y placas legibles.`}</p>
    {error ? <div className="camera-error"><p>{error}</p><button className="primary" onClick={onFallback}>Elegir archivo</button></div> :
      <div className="camera-bottom">
        <button className="link light" onClick={onFallback}>Galería</button>
        {mode === 'photo'
          ? <button className="shutter" aria-label="Tomar foto" onClick={takePhoto}><Camera size={26} /></button>
          : <button className={'shutter video' + (recording ? ' on' : '')} aria-label={recording ? 'Detener grabación' : 'Grabar video'} onClick={toggleRecording}>
            {recording ? <Square size={24} fill="currentColor" /> : <Video size={26} />}
          </button>}
        <span className="camera-spacer" />
      </div>}
  </div>;
}
