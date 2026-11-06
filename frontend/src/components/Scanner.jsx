import { useEffect, useRef, useState } from 'react';
import { CameraOff, Loader2 } from 'lucide-react';

// Hanya format yang dipakai ID Card: makin sedikit format, makin cepat tiap frame diperiksa
const FORMATS = ['code_128', 'qr_code'];

/**
 * Scanner barcode batang (Code 128) dari kamera belakang.
 * - Android/Chrome: BarcodeDetector bawaan (cepat, hemat baterai)
 * - iPhone/Safari & lainnya: fallback ZXing (dimuat hanya bila perlu)
 * `paused` menghentikan deteksi tanpa mematikan kamera (mis. saat popup terbuka).
 */
export default function Scanner({ onCode, paused = false }) {
  const videoRef = useRef(null);
  const onCodeRef = useRef(onCode);
  const pausedRef = useRef(paused);
  const [state, setState] = useState('loading'); // loading | ready | error
  const [error, setError] = useState('');
  const [locked, setLocked] = useState(false);
  const lockTimer = useRef(null);

  onCodeRef.current = onCode;
  pausedRef.current = paused;

  useEffect(() => {
    let stream;
    let stopped = false;
    let raf;
    let zxingControls;
    // Cegah barcode yang sama terbaca berkali-kali selama masih di depan kamera
    let last = { code: '', at: 0 };

    const emit = code => {
      const now = Date.now();
      if (pausedRef.current || (code === last.code && now - last.at < 2500)) return;
      last = { code, at: now };
      setLocked(true);
      clearTimeout(lockTimer.current);
      lockTimer.current = setTimeout(() => setLocked(false), 900);
      onCodeRef.current?.(code);
    };

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Browser tidak mendukung kamera. Buka lewat HTTPS dengan Chrome/Safari.');
      }
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }
      });
      if (stopped) return;
      const video = videoRef.current;
      video.srcObject = stream;
      await video.play();
      // Barcode batang kartu sangat rapat: fokus otomatis kontinu wajib supaya garis tipis tajam
      try {
        const track = stream.getVideoTracks()[0];
        const caps = track.getCapabilities?.() || {};
        if (caps.focusMode?.includes('continuous')) await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
      } catch { /* tidak semua perangkat mendukung */ }
      setState('ready');

      const supported = 'BarcodeDetector' in window
        ? await window.BarcodeDetector.getSupportedFormats().catch(() => [])
        : [];
      if (supported.includes('code_128')) {
        const detector = new window.BarcodeDetector({ formats: FORMATS.filter(f => supported.includes(f)) });
        let busy = false;
        const loop = async () => {
          if (stopped) return;
          if (!busy && !pausedRef.current && video.readyState >= 2) {
            busy = true;
            try {
              const codes = await detector.detect(video);
              if (codes[0]?.rawValue) emit(codes[0].rawValue);
            } catch { /* frame dilewati */ }
            busy = false;
          }
          raf = requestAnimationFrame(loop);
        };
        loop();
      } else {
        // Cadangan ZXing (iPhone & HP tanpa BarcodeDetector). Dulu ZXing membaca gambar 1920x1080 penuh
        // dengan TRY_HARDER tiap 40 ms di thread utama (400-800 ms per percobaan di HP kelas menengah),
        // dan tetap membaca saat popup terbuka: semua animasi ikut patah-patah. Kini yang dibaca hanya pita
        // tengah (tempat kotak bidik) yang diperkecil, berhenti total saat popup terbuka, dan memberi jeda
        // supaya animasi selalu kebagian waktu.
        const { MultiFormatReader, DecodeHintType, BarcodeFormat, BinaryBitmap, HybridBinarizer, RGBLuminanceSource } =
          await import('@zxing/library');
        if (stopped) return;
        const reader = new MultiFormatReader();
        reader.setHints(new Map([
          [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128, BarcodeFormat.QR_CODE]],
          [DecodeHintType.TRY_HARDER, true]
        ]));
        const canvas = document.createElement('canvas');
        const g = canvas.getContext('2d', { willReadFrequently: true });
        let busy = false;
        let timer;
        const scanOnce = () => {
          const vw = video.videoWidth, vh = video.videoHeight;
          if (!vw || !vh) return;
          // Pita tengah: 82% lebar x 44% tinggi (sama dengan kotak bidik), lebar dibatasi 960 px.
          // Garis barcode batang tetap tajam karena yang diperkecil hanya pita, bukan seluruh frame.
          const sw = Math.round(vw * 0.82), sh = Math.round(vh * 0.44);
          const scale = Math.min(1, 960 / sw);
          const w = Math.round(sw * scale), h = Math.round(sh * scale);
          if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
          g.drawImage(video, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, w, h);
          const { data } = g.getImageData(0, 0, w, h);
          const lum = new Uint8ClampedArray(w * h);
          for (let i = 0, j = 0; j < lum.length; i += 4, j++) lum[j] = (data[i] + (data[i + 1] << 1) + data[i + 2]) >> 2;
          try {
            const result = reader.decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(lum, w, h))));
            if (result) emit(result.getText());
          } catch { /* tidak ada kode di frame ini */ }
        };
        const loop = () => {
          if (stopped) return;
          if (!busy && !pausedRef.current && video.readyState >= 2 && !document.hidden) {
            busy = true;
            const t0 = performance.now();
            scanOnce();
            busy = false;
            // Jeda sebanding lama baca: HP lambat otomatis membaca lebih jarang
            timer = setTimeout(loop, Math.max(60, (performance.now() - t0) * 1.5));
            return;
          }
          timer = setTimeout(loop, 150);
        };
        loop();
        zxingControls = { stop: () => clearTimeout(timer) };
      }
    }

    start().catch(err => {
      if (stopped) return;
      setState('error');
      setError(err.name === 'NotAllowedError'
        ? 'Izin kamera ditolak. Aktifkan izin kamera untuk situs ini di pengaturan browser.'
        : err.message || 'Kamera tidak dapat dibuka');
    });

    return () => {
      stopped = true;
      clearTimeout(lockTimer.current);
      cancelAnimationFrame(raf);
      zxingControls?.stop();
      stream?.getTracks().forEach(t => t.stop());
    };
  }, []);

  return (
    <div className={`scanner${locked ? ' locked' : ''}`}>
      <video ref={videoRef} playsInline muted />
      {state === 'ready' && (
        <>
          <div className="scan-frame" aria-hidden="true"><i /><i /><i /><i /></div>
          {!paused && <div className="scan-line" />}
        </>
      )}
      {state !== 'ready' && (
        <div className="scanner-msg">
          <div>
            {state === 'loading'
              ? <Loader2 className="spin" size={30} />
              : <CameraOff size={30} />}
            <p style={{ marginTop: 10 }}>{state === 'loading' ? 'Membuka kamera…' : error}</p>
          </div>
        </div>
      )}
    </div>
  );
}
