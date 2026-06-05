import React, { useState, useEffect, useRef } from 'react';
import { Mic, X, Volume2, Activity, AlertCircle, Check } from 'lucide-react';

const INSTRUMENT_TUNINGS = {
  guitar: {
    name: 'Guitar (Standard)',
    strings: [
      { name: 'e', note: 'E4', freq: 329.63, index: 1 },
      { name: 'B', note: 'B3', freq: 246.94, index: 2 },
      { name: 'G', note: 'G3', freq: 196.00, index: 3 },
      { name: 'D', note: 'D3', freq: 146.83, index: 4 },
      { name: 'A', note: 'A2', freq: 110.00, index: 5 },
      { name: 'E', note: 'E2', freq: 82.41, index: 6 },
    ]
  },
  ukulele: {
    name: 'Ukulele (Standard)',
    strings: [
      { name: 'A', note: 'A4', freq: 440.00, index: 1 },
      { name: 'E', note: 'E4', freq: 329.63, index: 2 },
      { name: 'C', note: 'C4', freq: 261.63, index: 3 },
      { name: 'g', note: 'G4', freq: 392.00, index: 4 },
    ]
  }
};

// Optimized autocorrelation algorithm for pitch detection with parabolic interpolation refinement
function autoCorrelate(buffer, sampleRate, rms) {
  if (rms < 0.003) return -1; // Safe lower threshold for quiet inputs

  const SIZE = buffer.length;
  // We only search for frequencies between 70Hz and 600Hz.
  // Period for 70Hz: sampleRate / 70 (e.g., 685 samples at 48kHz)
  // Period for 600Hz: sampleRate / 600 (e.g., 80 samples at 48kHz)
  const maxLag = Math.min(SIZE, Math.ceil(sampleRate / 70));
  const minLag = Math.floor(sampleRate / 600);

  const c = new Float32Array(maxLag);
  for (let i = 0; i < maxLag; i++) {
    let sum = 0;
    for (let j = 0; j < SIZE - i; j++) {
      sum += buffer[j] * buffer[j + i];
    }
    c[i] = sum;
  }

  // Find the first zero-crossing or local minimum to skip the central peak
  let d = 0;
  while (d < maxLag - 1 && c[d] > c[d + 1]) {
    d++;
  }

  // 1. Find the absolute maximum peak in the allowed lag range
  let maxval = -1;
  for (let i = Math.max(d, minLag); i < maxLag; i++) {
    if (c[i] > maxval) {
      maxval = c[i];
    }
  }

  // If no peak found or correlation is too weak (below 30% of energy at lag 0)
  if (maxval < 0.3 * c[0]) {
    return -1;
  }

  // 2. Find the first local maximum peak that is at least 80% of the absolute maximum peak
  // This resolves the octave reduction / pitch halving bug (e.g., detecting 130Hz instead of 260Hz)
  let maxpos = -1;
  const threshold = maxval * 0.80;
  for (let i = Math.max(d, minLag, 1); i < maxLag - 1; i++) {
    if (c[i] > c[i - 1] && c[i] > c[i + 1]) {
      if (c[i] > threshold) {
        maxpos = i;
        break;
      }
    }
  }

  // If no peak found via local maximum search, fallback to absolute maximum search
  if (maxpos === -1) {
    let fallbackMax = -1;
    for (let i = Math.max(d, minLag); i < maxLag; i++) {
      if (c[i] > fallbackMax) {
        fallbackMax = c[i];
        maxpos = i;
      }
    }
  }

  let T0 = maxpos;
  // Parabolic interpolation for sub-sample refinement
  if (T0 > 0 && T0 < maxLag - 1) {
    const x1 = c[T0 - 1];
    const x2 = c[T0];
    const x3 = c[T0 + 1];
    const a = (x1 + x3 - 2 * x2) / 2;
    const b = (x3 - x1) / 2;
    if (a) {
      T0 = T0 - b / (2 * a);
    }
  }

  return sampleRate / T0;
}

export default function InstrumentTuner({ isOpen, onClose }) {
  const [selectedInst, setSelectedInst] = useState('guitar');
  const [tunerMode, setTunerMode] = useState('auto'); // 'auto' or 'manual'
  const [selectedString, setSelectedString] = useState(null); // Locked string in manual mode
  const [detectedString, setDetectedString] = useState(null); // Highlighted string in auto mode
  const [isListening, setIsListening] = useState(false);
  const [frequency, setFrequency] = useState(null);
  const [cents, setCents] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [consoleErrors, setConsoleErrors] = useState([]);

  useEffect(() => {
    const handleError = (event) => {
      const errorMsg = event.error ? event.error.stack || event.error.message : event.message;
      setConsoleErrors(prev => [...prev.slice(-4), errorMsg]);
    };
    window.addEventListener('error', handleError);
    return () => {
      window.removeEventListener('error', handleError);
    };
  }, []);

  const tunerAudioCtxRef = useRef(null);
  const refAudioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const audioStreamRef = useRef(null);
  const animationFrameRef = useRef(null);

  const oscillatorRef = useRef(null);
  const oscGainRef = useRef(null);
  const volumeBarRef = useRef(null);
  const wakeLockRef = useRef(null);

  const debugStateRef = useRef(null);
  const debugTrackRef = useRef(null);
  const debugRmsRef = useRef(null);

  const selectedInstRef = useRef(selectedInst);
  const tunerModeRef = useRef(tunerMode);
  const selectedStringRef = useRef(selectedString);

  // Stability & smoothing refs for tuner needle and note display
  const framesWithoutPitchRef = useRef(0);
  const smoothedCentsRef = useRef(0);
  const lastTargetStringRef = useRef(null);
  const stringChangeCandidateRef = useRef(null);
  const stringChangeConfirmCountRef = useRef(0);

  // Sync state variables to refs to avoid stale closure in requestAnimationFrame loop
  useEffect(() => {
    selectedInstRef.current = selectedInst;
  }, [selectedInst]);

  useEffect(() => {
    tunerModeRef.current = tunerMode;
  }, [tunerMode]);

  useEffect(() => {
    selectedStringRef.current = selectedString;
  }, [selectedString]);

  // Sync selected instrument with default string
  useEffect(() => {
    setSelectedString(INSTRUMENT_TUNINGS[selectedInst].strings[0]);
    if (tunerMode === 'auto') {
      setDetectedString(INSTRUMENT_TUNINGS[selectedInst].strings[0]);
    }
    // Reset smoothing/stability refs
    lastTargetStringRef.current = null;
    stringChangeCandidateRef.current = null;
    stringChangeConfirmCountRef.current = 0;
    framesWithoutPitchRef.current = 0;
    smoothedCentsRef.current = 0;
  }, [selectedInst]);

  // Reset smoothing/stability refs on mode changes
  useEffect(() => {
    lastTargetStringRef.current = null;
    stringChangeCandidateRef.current = null;
    stringChangeConfirmCountRef.current = 0;
    framesWithoutPitchRef.current = 0;
    smoothedCentsRef.current = 0;
  }, [tunerMode]);

  // Handle cleanup when modal closes or unmounts
  useEffect(() => {
    if (!isOpen) {
      stopTuner();
      stopReferenceTone();
      if (refAudioCtxRef.current) {
        try {
          refAudioCtxRef.current.close();
        } catch (e) {}
        refAudioCtxRef.current = null;
      }
    }
    return () => {
      stopTuner();
      stopReferenceTone();
      if (refAudioCtxRef.current) {
        try {
          refAudioCtxRef.current.close();
        } catch (e) {}
        refAudioCtxRef.current = null;
      }
    };
  }, [isOpen]);

  // Prevent screen dimming while tuner modal is open
  useEffect(() => {
    let active = true;
    let clickListenerActive = false;

    const requestWakeLock = async () => {
      if (!('wakeLock' in navigator)) return;
      try {
        if (wakeLockRef.current) {
          await wakeLockRef.current.release();
          wakeLockRef.current = null;
        }
        wakeLockRef.current = await navigator.wakeLock.request('screen');
        console.log('Tuner Screen Wake Lock acquired.');
        if (clickListenerActive) {
          document.removeEventListener('click', handleUserInteraction);
          document.removeEventListener('touchstart', handleUserInteraction);
          clickListenerActive = false;
        }
      } catch (err) {
        console.warn('Tuner failed to acquire Wake Lock:', err);
      }
    };

    const handleUserInteraction = () => {
      requestWakeLock();
    };

    const releaseWakeLock = async () => {
      if (wakeLockRef.current) {
        try {
          await wakeLockRef.current.release();
          wakeLockRef.current = null;
          console.log('Tuner Screen Wake Lock released.');
        } catch (err) {}
      }
    };

    if (isOpen) {
      requestWakeLock();
      document.addEventListener('click', handleUserInteraction);
      document.addEventListener('touchstart', handleUserInteraction);
      clickListenerActive = true;
    }

    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && isOpen && active) {
        await requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      active = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (clickListenerActive) {
        document.removeEventListener('click', handleUserInteraction);
        document.removeEventListener('touchstart', handleUserInteraction);
      }
      releaseWakeLock();
    };
  }, [isOpen]);

  function stopReferenceTone() {
    if (oscillatorRef.current) {
      try {
        oscillatorRef.current.stop();
      } catch (err) {}
      oscillatorRef.current = null;
    }
    if (oscGainRef.current) {
      oscGainRef.current = null;
    }
  }

  function playReferenceTone(freq) {
    stopReferenceTone();
    
    // Release any active tuner mic capturing locks before playing output sounds on iOS Safari
    if (tunerAudioCtxRef.current) {
      stopTuner();
    }

    try {
      if (!refAudioCtxRef.current) {
        refAudioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      const audioCtx = refAudioCtxRef.current;
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }

      const osc = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      osc.type = 'triangle'; // Warm wood acoustic sound
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

      gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.25, audioCtx.currentTime + 0.08); // attack
      gainNode.gain.setValueAtTime(0.25, audioCtx.currentTime + 0.8); // sustain
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 1.4); // release

      osc.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      osc.start();
      osc.stop(audioCtx.currentTime + 1.45);

      oscillatorRef.current = osc;
      oscGainRef.current = gainNode;
    } catch (err) {
      console.warn('Failed to play reference pitch:', err);
    }
  }

  async function startTuner() {
    stopReferenceTone();
    setErrorMsg('');

    // Release any active reference output-only context before starting capture to avoid iOS session locking
    if (refAudioCtxRef.current) {
      try {
        refAudioCtxRef.current.close();
      } catch (e) {}
      refAudioCtxRef.current = null;
    }

    // Always create a fresh tuner context to avoid upgrading session category failure on mobile viewports
    if (tunerAudioCtxRef.current) {
      try {
        tunerAudioCtxRef.current.close();
      } catch (e) {}
      tunerAudioCtxRef.current = null;
    }

    // Synchronously initialize and resume AudioContext in the user gesture call stack
    try {
      tunerAudioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      if (tunerAudioCtxRef.current.state === 'suspended') {
        tunerAudioCtxRef.current.resume();
      }
    } catch (e) {
      console.error('Failed to initialize AudioContext:', e);
    }

    // Check if secure context (HTTPS / localhost)
    if (window.isSecureContext === false) {
      setErrorMsg('Tuner yêu cầu kết nối bảo mật (HTTPS hoặc localhost) để truy cập Micro. Vui lòng chạy ứng dụng qua HTTPS.');
      setIsListening(false);
      return;
    }

    if (!navigator || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setErrorMsg('Trình duyệt của bạn không hỗ trợ hoặc chặn quyền truy cập Micro.');
      setIsListening(false);
      return;
    }

    try {
      // Disable mobile echo cancellation, noise suppression, and auto gain control to capture raw instrument tones
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false
          }
        });
      } catch (err) {
        console.warn('Failed to getUserMedia with ideal constraints, retrying with simple audio:true', err);
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      audioStreamRef.current = stream;

      const audioCtx = tunerAudioCtxRef.current;
      if (!audioCtx) return;
      
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      analyserRef.current = analyser;

      setIsListening(true);
      const bufferLength = analyser.fftSize;
      const dataArray = new Float32Array(bufferLength);
      const dataArrayByte = new Uint8Array(bufferLength);

      const updatePitch = () => {
        try {
          if (!analyserRef.current) return;
          
          if (typeof analyserRef.current.getFloat32TimeDomainData === 'function') {
            analyserRef.current.getFloat32TimeDomainData(dataArray);
          } else {
            // Fallback for older mobile Safari / WebKit builds lacking getFloat32TimeDomainData
            analyserRef.current.getByteTimeDomainData(dataArrayByte);
            for (let i = 0; i < bufferLength; i++) {
              dataArray[i] = (dataArrayByte[i] - 128) / 128;
            }
          }

          // Calculate dynamic RMS volume level
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i] * dataArray[i];
          }
          const rms = Math.sqrt(sum / dataArray.length);

          // Update the signal/volume level VU meter bar directly in DOM to avoid React re-render lag
          if (volumeBarRef.current) {
            const volPercent = Math.min(100, Math.round(rms * 800));
            volumeBarRef.current.style.width = `${volPercent}%`;
            volumeBarRef.current.style.backgroundColor = rms < 0.003 ? '#d6d3d1' : '#3b82f6';
          }

          // Update real-time diagnostics panel elements directly in DOM
          if (debugStateRef.current && audioCtx) {
            debugStateRef.current.innerText = audioCtx.state;
          }
          if (debugTrackRef.current && audioStreamRef.current) {
            const track = audioStreamRef.current.getAudioTracks()[0];
            debugTrackRef.current.innerText = track 
              ? `${track.readyState} (${track.enabled ? 'Active' : 'Muted'})`
              : 'No Track';
          }
          if (debugRmsRef.current) {
            debugRmsRef.current.innerText = rms.toFixed(6);
          }

          const detectedFreq = autoCorrelate(dataArray, audioCtx.sampleRate, rms);
          if (detectedFreq !== -1 && detectedFreq > 50 && detectedFreq < 600) {
            // Reset no-pitch frames count
            framesWithoutPitchRef.current = 0;
            setFrequency(detectedFreq);

            let target = null;
            if (tunerModeRef.current === 'manual') {
              target = selectedStringRef.current;
            } else {
              // Find closest target string frequency
              const currentStrings = INSTRUMENT_TUNINGS[selectedInstRef.current].strings;
              let closest = currentStrings[0];
              let minDist = Math.abs(detectedFreq - closest.freq);

              for (let i = 1; i < currentStrings.length; i++) {
                const dist = Math.abs(detectedFreq - currentStrings[i].freq);
                if (dist < minDist) {
                  minDist = dist;
                  closest = currentStrings[i];
                }
              }

              // Apply string switching debouncing
              if (!lastTargetStringRef.current) {
                lastTargetStringRef.current = closest;
                setDetectedString(closest);
                target = closest;
              } else if (closest.index === lastTargetStringRef.current.index) {
                // Same string as before, reset candidate tracker
                stringChangeCandidateRef.current = null;
                stringChangeConfirmCountRef.current = 0;
                target = lastTargetStringRef.current;
              } else {
                // Different string detected! Check if it's the same candidate
                if (stringChangeCandidateRef.current && stringChangeCandidateRef.current.index === closest.index) {
                  stringChangeConfirmCountRef.current += 1;
                } else {
                  stringChangeCandidateRef.current = closest;
                  stringChangeConfirmCountRef.current = 1;
                }

                if (stringChangeConfirmCountRef.current >= 5) {
                  // Stable new string switch!
                  lastTargetStringRef.current = closest;
                  setDetectedString(closest);
                  target = closest;
                  stringChangeCandidateRef.current = null;
                  stringChangeConfirmCountRef.current = 0;
                } else {
                  // Keep last target string until confirmed
                  target = lastTargetStringRef.current;
                }
              }
            }

            if (target) {
              const centsDev = 1200 * Math.log2(detectedFreq / target.freq);
              // Apply exponential smoothing for cents needle
              if (smoothedCentsRef.current === 0) {
                smoothedCentsRef.current = centsDev;
              } else {
                smoothedCentsRef.current = smoothedCentsRef.current * 0.8 + centsDev * 0.2;
              }
              setCents(smoothedCentsRef.current);
            }
          } else {
            // Increment no-pitch frame count
            framesWithoutPitchRef.current += 1;

            if (framesWithoutPitchRef.current >= 25) {
              // Clear active detected pitch when there is silence or no pitch (after 400ms grace period)
              setFrequency(null);
              setCents(0);
              lastTargetStringRef.current = null;
              stringChangeCandidateRef.current = null;
              stringChangeConfirmCountRef.current = 0;
            }
          }
        } catch (err) {
          console.error("Error inside updatePitch loop:", err);
          setConsoleErrors(prev => [...prev.slice(-4), `Pitch Loop Error: ${err.message}`]);
        }
        animationFrameRef.current = requestAnimationFrame(updatePitch);
      };

      animationFrameRef.current = requestAnimationFrame(updatePitch);
    } catch (err) {
      console.error('Mic access denied:', err);
      setErrorMsg('Không thể truy cập Micro. Vui lòng kiểm tra quyền cài đặt Micro của trình duyệt.');
      setIsListening(false);
    }
  }

  function stopTuner() {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(track => track.stop());
      audioStreamRef.current = null;
    }
    if (tunerAudioCtxRef.current) {
      try {
        tunerAudioCtxRef.current.close();
      } catch (e) {}
      tunerAudioCtxRef.current = null;
    }
    analyserRef.current = null;
    setIsListening(false);
    setFrequency(null);
    setCents(0);
    if (volumeBarRef.current) {
      volumeBarRef.current.style.width = '0%';
    }
    // Reset smoothing/stability refs
    framesWithoutPitchRef.current = 0;
    smoothedCentsRef.current = 0;
    lastTargetStringRef.current = null;
    stringChangeCandidateRef.current = null;
    stringChangeConfirmCountRef.current = 0;
    // Reset debug panel labels
    if (debugStateRef.current) debugStateRef.current.innerText = '-';
    if (debugTrackRef.current) debugTrackRef.current.innerText = '-';
    if (debugRmsRef.current) debugRmsRef.current.innerText = '-';
  }

  function toggleListening() {
    if (isListening) {
      stopTuner();
    } else {
      // Synchronously initialize the tunerAudioCtxRef inside user gesture event stack
      try {
        if (!tunerAudioCtxRef.current) {
          tunerAudioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (tunerAudioCtxRef.current.state === 'suspended') {
          tunerAudioCtxRef.current.resume();
        }
      } catch (e) {
        console.error('Failed to initialize AudioContext synchronously in gesture:', e);
      }
      
      startTuner();
    }
  }

  function handleClose() {
    stopTuner();
    stopReferenceTone();
    if (refAudioCtxRef.current) {
      try {
        refAudioCtxRef.current.close();
      } catch (e) {}
      refAudioCtxRef.current = null;
    }
    onClose();
  }

  if (!isOpen) return null;

  const currentStrings = INSTRUMENT_TUNINGS[selectedInst].strings;
  const activeTarget = tunerMode === 'manual' ? selectedString : detectedString;
  const inTune = activeTarget && frequency && Math.abs(cents) <= 3;
  const clampedCents = Math.max(-50, Math.min(50, cents));
  const needleRotation = frequency ? clampedCents * 1.2 : 0; // -60 to +60 deg

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm animate-fade-in" onClick={handleClose}>
      <div className="bg-[#fcfbfa] border border-stone-200/80 rounded-2xl max-w-sm w-full p-5 shadow-2xl relative select-none flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-stone-150 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <Mic className="w-5 h-5 text-amber-700" />
            <h3 className="font-bold text-stone-900 text-base">Bộ Lên Dây / Instrument Tuner</h3>
          </div>
          <button onClick={handleClose} className="p-1.5 rounded-full hover:bg-stone-150 text-stone-400 hover:text-stone-700 transition">
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-grow flex flex-col space-y-4">
          {/* Instrument Selector Tab */}
          <div className="grid grid-cols-2 gap-1 bg-stone-100 p-0.5 rounded-lg border border-stone-200 text-xs">
            <button
              onClick={() => setSelectedInst('guitar')}
              className={`py-1.5 font-extrabold rounded-md transition-all ${
                selectedInst === 'guitar' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              Guitar (Standard)
            </button>
            <button
              onClick={() => setSelectedInst('ukulele')}
              className={`py-1.5 font-extrabold rounded-md transition-all ${
                selectedInst === 'ukulele' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              Ukulele (Standard)
            </button>
          </div>

          {/* Mode Selector (Auto vs Manual) */}
          <div className="grid grid-cols-2 gap-2 text-[10px] uppercase font-bold tracking-wider text-center">
            <button
              onClick={() => {
                setTunerMode('auto');
                if (currentStrings.length > 0) setDetectedString(currentStrings[0]);
              }}
              className={`py-1 rounded border transition ${
                tunerMode === 'auto'
                  ? 'bg-blue-50 border-blue-200 text-blue-900 font-extrabold'
                  : 'bg-white border-stone-200 text-stone-500 hover:bg-stone-50'
              }`}
            >
              Tự động (Auto)
            </button>
            <button
              onClick={() => setTunerMode('manual')}
              className={`py-1 rounded border transition ${
                tunerMode === 'manual'
                  ? 'bg-amber-50/70 border-amber-200 text-amber-900 font-extrabold'
                  : 'bg-white border-stone-200 text-stone-500 hover:bg-stone-50'
              }`}
            >
              Thủ công (Manual)
            </button>
          </div>

          {/* Tuner Dial Needle Visualizer */}
          <div className="bg-white border border-stone-150 rounded-xl p-4 shadow-sm flex flex-col items-center justify-center relative overflow-hidden h-44">
            {isListening && (
              <div className="absolute top-2 left-3 right-3 flex items-center gap-1.5 z-10 select-none">
                <span className="text-[9px] font-bold text-stone-400 uppercase tracking-wider">Tín hiệu:</span>
                <div className="flex-grow h-1 bg-stone-100 rounded-full overflow-hidden border border-stone-200/50">
                  <div ref={volumeBarRef} className="h-full bg-stone-300 transition-all duration-75" style={{ width: '0%' }}></div>
                </div>
              </div>
            )}

            {isListening && frequency ? (
              <>
                {/* SVG Analog Needle Gauge */}
                <svg viewBox="0 0 300 160" className="w-full max-w-[240px] mx-auto absolute top-2">
                  {/* Outer scale arc */}
                  <path d="M 40 135 A 110 110 0 0 1 260 135" fill="none" stroke="#e3ded5" strokeWidth="5" strokeLinecap="round" />
                  
                  {/* Center Green Target Zone */}
                  <path d="M 138 28 A 110 110 0 0 1 162 28" fill="none" stroke={inTune ? "#10b981" : "#e3ded5"} strokeWidth="6" />

                  {/* Tick Marks */}
                  <line x1="150" y1="20" x2="150" y2="30" stroke={inTune ? "#10b981" : "#78716c"} strokeWidth="2.5" />
                  <line x1="90" y1="44" x2="98" y2="51" stroke="#d6cfc1" strokeWidth="2" />
                  <line x1="210" y1="44" x2="202" y2="51" stroke="#d6cfc1" strokeWidth="2" />

                  {/* Rotating Dial Needle */}
                  <line
                    x1="150"
                    y1="135"
                    x2="150"
                    y2="28"
                    stroke={inTune ? "#10b981" : cents < 0 ? "#f97316" : "#ef4444"}
                    strokeWidth="3"
                    strokeLinecap="round"
                    style={{
                      transform: `rotate(${needleRotation}deg)`,
                      transformOrigin: '150px 135px'
                    }}
                  />
                  <circle cx="150" cy="135" r="8" fill={inTune ? "#10b981" : "#44403c"} />
                </svg>

                {/* Numeric cents status overlay */}
                <div className="absolute bottom-2 text-center flex flex-col items-center">
                  <span className="font-mono text-[22px] font-black text-stone-900 leading-none mb-1">
                    {activeTarget?.note}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-xs text-stone-500 font-bold">{frequency.toFixed(1)} Hz</span>
                    <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded leading-none ${
                      inTune 
                        ? 'bg-green-150 text-green-800' 
                        : cents < 0 ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {inTune 
                        ? 'Chuẩn' 
                        : cents < 0 ? `${Math.round(cents)} cents (Thấp)` : `+${Math.round(cents)} cents (Cao)`}
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center text-center space-y-2 p-2">
                <Activity className={`w-8 h-8 ${isListening ? 'text-blue-500 animate-pulse' : 'text-stone-300'}`} />
                <p className="text-xs font-bold text-stone-500">
                  {isListening ? 'Gảy dây đàn để lên tông...' : 'Tuner chưa bắt đầu thu âm'}
                </p>
                <p className="text-[10px] text-stone-400 max-w-[250px]">
                  {isListening ? 'Auto Mode sẽ tự phát hiện dây bạn đang gảy.' : 'Bấm nút bên dưới để cấp quyền và khởi động tuner.'}
                </p>
              </div>
            )}
          </div>


          {/* Reference Tones Board */}
          <div className="space-y-2">
            <div className="flex justify-between items-center text-[10px] uppercase font-bold tracking-wider text-stone-400 px-1 select-none">
              <span>{tunerMode === 'manual' ? 'Gõ dây để chọn & nghe thử' : 'Nghe âm thanh dây gốc (EADGBE/GCEA)'}</span>
              <Volume2 className="w-3.5 h-3.5" />
            </div>

            {/* String pegs rows */}
            <div className={`grid gap-2 ${selectedInst === 'guitar' ? 'grid-cols-6' : 'grid-cols-4'}`}>
              {currentStrings.map((stringObj) => {
                const isSelected = activeTarget?.index === stringObj.index;
                return (
                  <button
                    key={stringObj.index}
                    onClick={() => {
                      if (tunerMode === 'manual') {
                        setSelectedString(stringObj);
                      }
                      playReferenceTone(stringObj.freq);
                    }}
                    className={`flex flex-col items-center justify-center py-2.5 rounded-xl border-2 transition active:scale-95 cursor-pointer relative ${
                      isSelected
                        ? inTune && isListening
                          ? 'bg-green-50 border-green-500 text-green-900 shadow-md font-black animate-pulse'
                          : 'bg-amber-50 border-amber-500 text-amber-900 shadow-md font-black'
                        : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-50 hover:border-stone-300'
                    }`}
                  >
                    <span className="text-[10px] text-stone-400 font-extrabold uppercase leading-none mb-1">
                      {stringObj.index}
                    </span>
                    <span className="font-mono text-sm font-black leading-none uppercase">
                      {stringObj.name}
                    </span>
                    <span className="text-[8px] font-mono font-bold text-stone-450 mt-1">
                      {stringObj.note}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-[10px] font-semibold text-red-700 leading-tight">{errorMsg}</p>
            </div>
          )}

          {/* Bottom Activation controls */}
          <div className="pt-2 space-y-2">
            <button
              onClick={toggleListening}
              className={`w-full py-3 rounded-xl text-sm font-black transition active:scale-[0.98] shadow-md flex items-center justify-center gap-2 cursor-pointer ${
                isListening
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-stone-900 hover:bg-stone-850 text-white'
              }`}
            >
              <Mic className={`w-4 h-4 ${isListening ? 'animate-pulse' : ''}`} />
              {isListening ? 'Tắt thu âm (Stop Tuner)' : 'Bật thu âm (Start Tuner)'}
            </button>

            <button
              onClick={() => setShowDiagnostics(!showDiagnostics)}
              className="w-full text-center text-[10px] text-stone-400 hover:text-stone-600 transition font-bold"
            >
              {showDiagnostics ? 'Ẩn chẩn đoán' : 'Hiện chẩn đoán (Diagnostics)'}
            </button>

            {showDiagnostics && (
              <div className="bg-stone-900 text-stone-300 p-3 rounded-xl text-[10px] font-mono space-y-1.5 shadow-inner">
                <div className="font-bold border-b border-stone-800 pb-1 mb-1 text-stone-400 text-center uppercase tracking-wider">Thông số chẩn đoán</div>
                <div className="flex justify-between"><span>Secure Context:</span> <span className="text-stone-100">{window.isSecureContext ? 'Yes' : 'No'}</span></div>
                <div className="flex justify-between"><span>Audio Context:</span> <span ref={debugStateRef} className="text-stone-100">-</span></div>
                <div className="flex justify-between"><span>Mic Track state:</span> <span ref={debugTrackRef} className="text-stone-100">-</span></div>
                <div className="flex justify-between"><span>Raw RMS:</span> <span ref={debugRmsRef} className="text-stone-100">-</span></div>
                <div className="flex justify-between"><span>Sample Rate:</span> <span className="text-stone-100">{tunerAudioCtxRef.current?.sampleRate || '0'} Hz</span></div>
                
                {consoleErrors.length > 0 && (
                  <div className="border-t border-stone-800 pt-1.5 mt-1.5">
                    <div className="text-red-400 font-bold mb-1">ERRORS CONSOLE:</div>
                    <div className="space-y-1 text-red-300 text-[8px] leading-tight">
                      {consoleErrors.map((err, idx) => (
                        <div key={idx} className="whitespace-pre-wrap truncate max-w-full">{err}</div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
