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
  if (rms < 0.012) return -1; // Raised threshold from 0.003 to 0.012 to reject background/ambient noise

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

  // If no peak found or correlation is too weak (below 45% of energy at lag 0)
  if (maxval < 0.45 * c[0]) {
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
  const [displayFrequency, setDisplayFrequency] = useState(null);
  const [displayCents, setDisplayCents] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [consoleErrors, setConsoleErrors] = useState([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

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
  const smoothedFreqRef = useRef(0);
  const smoothedCentsRef = useRef(0);
  const lastTargetStringRef = useRef(null);
  const stringChangeCandidateRef = useRef(null);
  const stringChangeConfirmCountRef = useRef(0);
  const lastTextUpdateTimeRef = useRef(0);

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
    smoothedFreqRef.current = 0;
    smoothedCentsRef.current = 0;
    lastTextUpdateTimeRef.current = 0;
  }, [selectedInst]);

  // Reset smoothing/stability refs on mode changes
  useEffect(() => {
    lastTargetStringRef.current = null;
    stringChangeCandidateRef.current = null;
    stringChangeConfirmCountRef.current = 0;
    framesWithoutPitchRef.current = 0;
    smoothedFreqRef.current = 0;
    smoothedCentsRef.current = 0;
    lastTextUpdateTimeRef.current = 0;
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

          // Apply instrument-specific frequency range filtering to reject out-of-range noise
          const isGuitar = selectedInstRef.current === 'guitar';
          const minAllowedFreq = isGuitar ? 70 : 200;
          const maxAllowedFreq = isGuitar ? 380 : 500;

          // Target-Anchored Noise Filtering: Discard pitch detection if it lies too far from expected string frequencies
          let passesNoiseGate = false;
          if (detectedFreq !== -1 && detectedFreq > minAllowedFreq && detectedFreq < maxAllowedFreq) {
            if (tunerModeRef.current === 'manual') {
              const targetStr = selectedStringRef.current;
              if (targetStr) {
                const centsDiff = Math.abs(1200 * Math.log2(detectedFreq / targetStr.freq));
                if (centsDiff <= 220) {
                  passesNoiseGate = true;
                }
              }
            } else {
              const currentStrings = INSTRUMENT_TUNINGS[selectedInstRef.current].strings;
              let minDiff = 99999;
              for (let i = 0; i < currentStrings.length; i++) {
                const centsDiff = Math.abs(1200 * Math.log2(detectedFreq / currentStrings[i].freq));
                if (centsDiff < minDiff) {
                  minDiff = centsDiff;
                }
              }
              if (minDiff <= 180) {
                passesNoiseGate = true;
              }
            }
          }

          if (passesNoiseGate) {
            // Reset no-pitch frames count
            framesWithoutPitchRef.current = 0;

            // Apply exponential moving average to frequency (alpha = 0.85 for stable Hz readings)
            if (smoothedFreqRef.current === 0) {
              smoothedFreqRef.current = detectedFreq;
            } else {
              smoothedFreqRef.current = smoothedFreqRef.current * 0.85 + detectedFreq * 0.15;
            }
            setFrequency(smoothedFreqRef.current);

            let target = null;
            if (tunerModeRef.current === 'manual') {
              target = selectedStringRef.current;
            } else {
              // Find closest target string frequency
              const currentStrings = INSTRUMENT_TUNINGS[selectedInstRef.current].strings;
              let closest = currentStrings[0];
              let minDist = Math.abs(smoothedFreqRef.current - closest.freq);

              for (let i = 1; i < currentStrings.length; i++) {
                const dist = Math.abs(smoothedFreqRef.current - currentStrings[i].freq);
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
              let centsDev = 1200 * Math.log2(smoothedFreqRef.current / target.freq);
              
              // Apply a dead-zone lock-in: if extremely close (within 1.5 cents), snap to 0
              if (Math.abs(centsDev) < 1.5) {
                centsDev = 0;
              }

              // Apply stronger exponential smoothing for cents needle (alpha = 0.85)
              if (smoothedCentsRef.current === 0) {
                smoothedCentsRef.current = centsDev;
              } else {
                smoothedCentsRef.current = smoothedCentsRef.current * 0.85 + centsDev * 0.15;
              }
              setCents(smoothedCentsRef.current);
            }

            // Throttle numeric text updates to ~150ms intervals for visual legibility
            const now = performance.now();
            if (now - lastTextUpdateTimeRef.current > 150) {
              setDisplayFrequency(smoothedFreqRef.current);
              setDisplayCents(smoothedCentsRef.current);
              lastTextUpdateTimeRef.current = now;
            }
          } else {
            // Increment no-pitch frame count
            framesWithoutPitchRef.current += 1;

            if (framesWithoutPitchRef.current >= 25) {
              // Clear active detected pitch when there is silence or no pitch (after 400ms grace period)
              setFrequency(null);
              setCents(0);
              setDisplayFrequency(null);
              setDisplayCents(0);
              lastTargetStringRef.current = null;
              stringChangeCandidateRef.current = null;
              stringChangeConfirmCountRef.current = 0;
              smoothedFreqRef.current = 0;
              smoothedCentsRef.current = 0;
              lastTextUpdateTimeRef.current = 0;
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
    setDisplayFrequency(null);
    setDisplayCents(0);
    if (volumeBarRef.current) {
      volumeBarRef.current.style.width = '0%';
    }
    // Reset smoothing/stability refs
    framesWithoutPitchRef.current = 0;
    smoothedFreqRef.current = 0;
    smoothedCentsRef.current = 0;
    lastTargetStringRef.current = null;
    stringChangeCandidateRef.current = null;
    stringChangeConfirmCountRef.current = 0;
    lastTextUpdateTimeRef.current = 0;
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
  const displayInTune = activeTarget && displayFrequency && Math.abs(displayCents) <= 3;
  const clampedCents = Math.max(-50, Math.min(50, cents));
  const needleRotation = frequency ? clampedCents * 1.2 : 0; // -60 to +60 deg

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/60 backdrop-blur-sm animate-fade-in" onClick={handleClose}>
      <div className="bg-[#18181a] border border-stone-850 rounded-[28px] max-w-sm w-full p-6 shadow-2xl relative select-none flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-stone-850 pb-3.5 mb-4 select-none">
          <div className="relative">
            <button 
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="flex items-center gap-1.5 font-black text-stone-100 hover:text-white transition text-[15px] cursor-pointer"
            >
              <Mic className="w-4.5 h-4.5 text-amber-500" />
              <span>{selectedInst === 'guitar' ? 'Guitar (6-string)' : 'Ukulele (4-string)'}</span>
              <span className="text-[10px] text-stone-500">▼</span>
            </button>
            <div className="text-[9px] text-stone-500 font-extrabold uppercase tracking-wider pl-6.5">
              Standard Tuning
            </div>
            
            {/* Dropdown Options */}
            {isDropdownOpen && (
              <div className="absolute top-full left-6 mt-1.5 w-48 bg-stone-900 border border-stone-800 rounded-xl shadow-2xl z-30 py-1 overflow-hidden animate-fade-in">
                <button
                  onClick={() => {
                    setSelectedInst('guitar');
                    setIsDropdownOpen(false);
                  }}
                  className={`w-full text-left px-4 py-2.5 text-xs font-bold transition flex items-center justify-between cursor-pointer ${
                    selectedInst === 'guitar' ? 'bg-stone-850 text-amber-500' : 'text-stone-300 hover:bg-stone-850'
                  }`}
                >
                  <span>Guitar (Standard)</span>
                  {selectedInst === 'guitar' && <span className="text-amber-500 text-[10px]">●</span>}
                </button>
                <button
                  onClick={() => {
                    setSelectedInst('ukulele');
                    setIsDropdownOpen(false);
                  }}
                  className={`w-full text-left px-4 py-2.5 text-xs font-bold transition flex items-center justify-between cursor-pointer ${
                    selectedInst === 'ukulele' ? 'bg-stone-850 text-amber-500' : 'text-stone-300 hover:bg-stone-850'
                  }`}
                >
                  <span>Ukulele (Standard)</span>
                  {selectedInst === 'ukulele' && <span className="text-amber-500 text-[10px]">●</span>}
                </button>
              </div>
            )}
          </div>
          
          <button onClick={handleClose} className="p-1.5 rounded-full hover:bg-stone-850 text-stone-400 hover:text-stone-200 transition">
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-grow flex flex-col space-y-4">
          
          {/* 1. Horizontal sliding dial gauge */}
          <div className="flex flex-col items-center justify-center relative w-full h-24 bg-stone-900/40 rounded-2xl border border-stone-850/80 overflow-hidden tuner-grid-bg">
            {/* Center Vertical Marker Line */}
            <div className={`absolute top-0 bottom-0 left-1/2 w-0.5 z-0 ${displayInTune ? 'bg-green-500/60 shadow-lg shadow-green-500/50' : 'bg-stone-800'}`}></div>
            
            {/* Flat / Sharp labels */}
            <span className="absolute left-5 text-xl font-serif text-stone-600 font-bold select-none">b</span>
            <span className="absolute right-5 text-xl font-serif text-stone-600 font-bold select-none">#</span>

            {/* Slider pointer cursor */}
            {isListening && frequency ? (
              <div 
                className="absolute transition-transform duration-100 ease-out z-10 flex flex-col items-center"
                style={{ 
                  transform: `translateX(${clampedCents * 2.8}px)`, 
                  left: 'calc(50% - 14px)'
                }}
              >
                {/* Dial circle outer ring */}
                <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center shadow-lg transition-colors ${
                  displayInTune 
                    ? 'border-green-500 bg-green-950/80 text-green-400 shadow-green-500/20' 
                    : displayCents < 0 
                      ? 'border-orange-500 bg-orange-950/80 text-orange-400 shadow-orange-500/20' 
                      : 'border-red-500 bg-red-950/80 text-red-400 shadow-red-500/20'
                }`}>
                  <div className={`w-2.5 h-2.5 rounded-full transition-colors ${
                    displayInTune ? 'bg-green-400 animate-pulse' : displayCents < 0 ? 'bg-orange-400' : 'bg-red-400'
                  }`}></div>
                </div>
                {/* Pointer triangle pointing down */}
                <div className={`w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] mt-0.5 ${
                  displayInTune ? 'border-t-green-500' : displayCents < 0 ? 'border-t-orange-500' : 'border-t-red-500'
                }`}></div>
              </div>
            ) : (
              /* Idle Center state cursor */
              <div className="absolute left-1/2 -translate-x-1/2 z-10 flex flex-col items-center opacity-30">
                <div className="w-7 h-7 rounded-full border-2 border-stone-600 bg-stone-900/60"></div>
                <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-stone-600 mt-0.5"></div>
              </div>
            )}

            {/* Signal strength / VU meter in background at top */}
            {isListening && (
              <div className="absolute top-0 left-0 right-0 h-1 bg-stone-950/30 overflow-hidden">
                <div ref={volumeBarRef} className="h-full bg-stone-850 transition-all duration-75" style={{ width: '0%' }}></div>
              </div>
            )}
          </div>

          {/* 2. Floating guidance bubble */}
          <div className="h-10 flex items-center justify-center relative">
            {isListening && !frequency ? (
              <div className="bg-stone-900 border border-stone-800 px-4 py-1.5 rounded-full text-[10px] font-bold tracking-wide text-stone-300 shadow-md animate-bounce select-none">
                Start tuning by playing any string
              </div>
            ) : isListening && frequency && activeTarget ? (
              <div className="flex items-center gap-2">
                <span className="font-mono text-xl font-black text-stone-100 leading-none">
                  {activeTarget.note}
                </span>
                <span className="font-mono text-xs text-stone-500 font-bold">
                  {displayFrequency ? `${displayFrequency.toFixed(1)} Hz` : '-- Hz'}
                </span>
                <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded leading-none ${
                  displayInTune 
                    ? 'bg-green-950/80 text-green-400 border border-green-900' 
                    : displayCents < 0 ? 'bg-orange-950/80 text-orange-400 border border-orange-900' : 'bg-red-950/80 text-red-400 border border-red-900'
                }`}>
                  {displayInTune 
                    ? 'In Tune' 
                    : displayCents < 0 
                      ? `${Math.round(displayCents)} cents (Flat)` 
                      : `+${Math.round(displayCents)} cents (Sharp)`}
                </span>
              </div>
            ) : (
              <div className="text-[10px] font-bold text-stone-500">Tuner is stopped</div>
            )}
          </div>

          {/* 3. Interactive SVG Headstock Visualizer */}
          <div className="relative flex items-center justify-between h-[280px] w-full bg-stone-900/10 rounded-3xl border border-stone-850 p-4 overflow-hidden select-none">
            
            {/* Peg Buttons Column on the Left */}
            <div className="flex flex-col justify-between h-full w-[45px] z-10">
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
                    className={`w-9 h-9 rounded-full flex flex-col items-center justify-center border transition-all active:scale-90 cursor-pointer ${
                      isSelected
                        ? displayInTune && isListening
                          ? 'bg-green-900 border-green-500 text-green-300 shadow-md shadow-green-500/20 font-black animate-pulse'
                          : 'bg-blue-900 border-blue-500 text-blue-300 shadow-md shadow-blue-500/20 font-black'
                        : 'bg-stone-900/80 border-stone-800 text-stone-400 hover:bg-stone-800 hover:text-stone-200'
                    }`}
                  >
                    <span className="font-mono text-sm font-black leading-none uppercase">
                      {stringObj.name}
                    </span>
                  </button>
                );
              })}
            </div>
            
            {/* Headstock SVG on the Right */}
            <div className="absolute right-0 top-0 bottom-0 w-[260px] flex items-center justify-center">
              {selectedInst === 'guitar' ? (
                /* Fender-style 6-in-line Guitar Headstock SVG */
                <svg viewBox="0 0 160 300" className="h-[270px] w-[145px] drop-shadow-[0_12px_20px_rgba(0,0,0,0.6)]">
                  <defs>
                    <linearGradient id="guitarWood" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#b45309" />
                      <stop offset="40%" stopColor="#78350f" />
                      <stop offset="100%" stopColor="#451a03" />
                    </linearGradient>
                    <linearGradient id="chrome" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f3f4f6" />
                      <stop offset="50%" stopColor="#9ca3af" />
                      <stop offset="100%" stopColor="#4b5563" />
                    </linearGradient>
                  </defs>

                  {/* Fretboard Mahogany Neck */}
                  <rect x="58" y="245" width="44" height="55" fill="#291a15" />
                  
                  {/* Fret silver lines */}
                  <line x1="58" y1="275" x2="102" y2="275" stroke="#9ca3af" strokeWidth="1" />
                  
                  {/* Fret Bone Nut */}
                  <rect x="58" y="242" width="44" height="4" fill="#eceff1" rx="1" />

                  {/* Guitar Wood Headstock */}
                  <path 
                    d="M 58 242 C 45 235, 33 215, 33 205 L 33 45 C 33 25, 78 12, 95 22 C 112 32, 112 95, 102 150 C 96 185, 102 230, 102 242 Z" 
                    fill="url(#guitarWood)" 
                    stroke="#27130a" 
                    strokeWidth="1.5" 
                  />

                  {/* 6 Tuning Pegs keys & posts */}
                  {[
                    { y: 215, idx: 6, strThick: '2.4' }, // E2
                    { y: 181, idx: 5, strThick: '2.0' }, // A2
                    { y: 147, idx: 4, strThick: '1.7' }, // D3
                    { y: 113, idx: 3, strThick: '1.4' }, // G3
                    { y: 79,  idx: 2, strThick: '1.1' }, // B3
                    { y: 45,  idx: 1, strThick: '0.8' }  // E4
                  ].map((peg) => {
                    const isPegActive = activeTarget?.index === peg.idx;
                    return (
                      <g key={peg.idx}>
                        {/* Chrome Tuning Key handle extending left */}
                        <path 
                          d={`M 15 ${peg.y} C 12 ${peg.y - 4}, 12 ${peg.y + 4}, 15 ${peg.y} C 18 ${peg.y - 4}, 28 ${peg.y - 2}, 30 ${peg.y} C 28 ${peg.y + 2}, 18 ${peg.y + 4}, 15 ${peg.y}`} 
                          fill="url(#chrome)" 
                          stroke="#1f2937" 
                          strokeWidth="0.8" 
                        />
                        <line x1="30" y1={peg.y} x2="43" y2={peg.y} stroke="url(#chrome)" strokeWidth="3" />
                        
                        {/* Chrome Post center cap */}
                        <circle cx="43" cy={peg.y} r="3.5" fill="url(#chrome)" stroke="#1f2937" strokeWidth="0.8" />
                        
                        {isPegActive && (
                          <circle cx="43" cy={peg.y} r="6.5" fill="none" stroke={displayInTune ? "#10b981" : "#3b82f6"} strokeWidth="1" className="animate-ping" />
                        )}
                      </g>
                    );
                  })}

                  {/* Steel Strings */}
                  {[
                    { xNut: 62, pegY: 215, idx: 6, t: 2.3 }, // String 6 (E2)
                    { xNut: 69, pegY: 181, idx: 5, t: 1.9 }, // String 5 (A2)
                    { xNut: 76, pegY: 147, idx: 4, t: 1.6 }, // String 4 (D3)
                    { xNut: 83, pegY: 113, idx: 3, t: 1.3 }, // String 3 (G3)
                    { xNut: 90, pegY: 79,  idx: 2, t: 1.0 }, // String 2 (B3)
                    { xNut: 97, pegY: 45,  idx: 1, t: 0.7 }  // String 1 (E4)
                  ].map((str) => {
                    const isStrActive = activeTarget?.index === str.idx;
                    const vibrateClass = isStrActive && isListening && frequency ? 'animate-string-vibrate' : '';
                    return (
                      <path
                        key={str.idx}
                        d={`M ${str.xNut} 300 L ${str.xNut} 242 L 43 ${str.pegY}`}
                        fill="none"
                        stroke={isStrActive && isListening && frequency ? '#60a5fa' : '#9ca3af'}
                        strokeWidth={str.t}
                        opacity={isStrActive && isListening && frequency ? 1.0 : 0.45}
                        className={vibrateClass}
                      />
                    );
                  })}
                </svg>
              ) : (
                /* Ukulele Symmetrical 2+2 Headstock SVG */
                <svg viewBox="0 0 160 300" className="h-[270px] w-[145px] drop-shadow-[0_12px_20px_rgba(0,0,0,0.6)]">
                  <defs>
                    <linearGradient id="ukeleleWood" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#b45309" />
                      <stop offset="35%" stopColor="#854d0e" />
                      <stop offset="100%" stopColor="#451a03" />
                    </linearGradient>
                    <linearGradient id="chrome" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f3f4f6" />
                      <stop offset="50%" stopColor="#9ca3af" />
                      <stop offset="100%" stopColor="#4b5563" />
                    </linearGradient>
                  </defs>

                  {/* Fretboard dark mahogany neck */}
                  <rect x="58" y="245" width="44" height="55" fill="#291a15" />
                  
                  {/* Fret lines */}
                  <line x1="58" y1="275" x2="102" y2="275" stroke="#9ca3af" strokeWidth="1" />
                  
                  {/* Bone Nut */}
                  <rect x="58" y="242" width="44" height="4" fill="#eceff1" rx="1" />

                  {/* Symmetrical Ukelele Wood Headstock */}
                  <path 
                    d="M 58 242 C 48 235, 38 215, 38 180 C 38 120, 48 60, 80 60 C 112 60, 122 120, 122 180 C 122 215, 112 235, 102 242 Z" 
                    fill="url(#ukeleleWood)" 
                    stroke="#27130a" 
                    strokeWidth="1.5" 
                  />

                  {/* 4 Tuning Pegs (2 Left, 2 Right) */}
                  {[
                    // Left pegs
                    { y: 190, x: 46, keyX: 18, isLeft: true, idx: 4 },  // string 4 (g4)
                    { y: 120, x: 46, keyX: 18, isLeft: true, idx: 3 },  // string 3 (C4)
                    // Right pegs
                    { y: 120, x: 114, keyX: 142, isLeft: false, idx: 2 }, // string 2 (E4)
                    { y: 190, x: 114, keyX: 142, isLeft: false, idx: 1 }  // string 1 (A4)
                  ].map((peg) => {
                    const isPegActive = activeTarget?.index === peg.idx;
                    return (
                      <g key={peg.idx}>
                        {/* Key handle extending left or right */}
                        {peg.isLeft ? (
                          <path 
                            d={`M ${peg.keyX} ${peg.y} C ${peg.keyX - 3} ${peg.y - 4}, ${peg.keyX - 3} ${peg.y + 4}, ${peg.keyX} ${peg.y} C ${peg.keyX + 3} ${peg.y - 4}, ${peg.keyX + 13} ${peg.y - 2}, ${peg.x} ${peg.y} C ${peg.keyX + 13} ${peg.y + 2}, ${peg.keyX + 3} ${peg.y + 4}, ${peg.keyX}`}
                            fill="url(#chrome)" 
                            stroke="#1f2937" 
                            strokeWidth="0.8" 
                          />
                        ) : (
                          <path 
                            d={`M ${peg.keyX} ${peg.y} C ${peg.keyX + 3} ${peg.y - 4}, ${peg.keyX + 3} ${peg.y + 4}, ${peg.keyX} ${peg.y} C ${peg.keyX - 3} ${peg.y - 4}, ${peg.keyX - 13} ${peg.y - 2}, ${peg.x} ${peg.y} C ${peg.keyX - 13} ${peg.y + 2}, ${peg.keyX - 3} ${peg.y + 4}, ${peg.keyX}`}
                            fill="url(#chrome)" 
                            stroke="#1f2937" 
                            strokeWidth="0.8" 
                          />
                        )}
                        <line x1={peg.isLeft ? peg.keyX : peg.x} x2={peg.isLeft ? peg.x : peg.keyX} y1={peg.y} y2={peg.y} stroke="url(#chrome)" strokeWidth="3" />
                        
                        {/* Chrome Post center cap */}
                        <circle cx={peg.x} cy={peg.y} r="3.5" fill="url(#chrome)" stroke="#1f2937" strokeWidth="0.8" />
                        
                        {isPegActive && (
                          <circle cx={peg.x} cy={peg.y} r="6.5" fill="none" stroke={displayInTune ? "#10b981" : "#3b82f6"} strokeWidth="1" className="animate-ping" />
                        )}
                      </g>
                    );
                  })}

                  {/* Strings */}
                  {[
                    { xNut: 64, pegX: 46, pegY: 190, idx: 4, t: 1.5 }, // string 4 (g4)
                    { xNut: 74, pegX: 46, pegY: 120, idx: 3, t: 1.9 }, // string 3 (C4)
                    { xNut: 84, pegX: 114, pegY: 120, idx: 2, t: 1.7 }, // string 2 (E4)
                    { xNut: 94, pegX: 114, pegY: 190, idx: 1, t: 1.3 }  // string 1 (A4)
                  ].map((str) => {
                    const isStrActive = activeTarget?.index === str.idx;
                    const vibrateClass = isStrActive && isListening && frequency ? 'animate-string-vibrate' : '';
                    return (
                      <path
                        key={str.idx}
                        d={`M ${str.xNut} 300 L ${str.xNut} 242 L ${str.pegX} ${str.pegY}`}
                        fill="none"
                        stroke={isStrActive && isListening && frequency ? '#60a5fa' : '#d6d3d1'}
                        strokeWidth={str.t}
                        opacity={isStrActive && isListening && frequency ? 1.0 : 0.55}
                        className={vibrateClass}
                      />
                    );
                  })}
                </svg>
              )}
            </div>
          </div>

          {/* 4. Bottom controls panel */}
          <div className="space-y-3 pt-2">
            
            {/* Auto/Manual Mode selection buttons */}
            <div className="flex justify-center gap-3.5 text-[10px] uppercase font-black tracking-widest text-center select-none">
              <button
                onClick={() => {
                  setTunerMode('auto');
                  if (currentStrings.length > 0) setDetectedString(currentStrings[0]);
                }}
                className={`px-4 py-1.5 rounded-full border transition-all cursor-pointer ${
                  tunerMode === 'auto'
                    ? 'bg-blue-950/60 border-blue-800 text-blue-400 font-extrabold shadow-sm shadow-blue-500/10'
                    : 'bg-stone-900/40 border-stone-850 text-stone-500 hover:text-stone-400'
                }`}
              >
                Auto
              </button>
              <button
                onClick={() => setTunerMode('manual')}
                className={`px-4 py-1.5 rounded-full border transition-all cursor-pointer ${
                  tunerMode === 'manual'
                    ? 'bg-amber-950/60 border-amber-800 text-amber-400 font-extrabold shadow-sm shadow-amber-500/10'
                    : 'bg-stone-900/40 border-stone-850 text-stone-500 hover:text-stone-400'
                }`}
              >
                Manual
              </button>
            </div>

            {/* Mic Activation Trigger */}
            <button
              onClick={toggleListening}
              className={`w-full py-3.5 rounded-2xl text-xs font-black transition-all active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer shadow-md ${
                isListening
                  ? 'bg-red-950/80 border border-red-800 text-red-200 hover:bg-red-900'
                  : 'bg-stone-100 hover:bg-white text-stone-900'
              }`}
            >
              <Mic className={`w-4 h-4 ${isListening ? 'animate-pulse' : ''}`} />
              {isListening ? 'STOP TUNER (DỪNG)' : 'START TUNER (BẮT ĐẦU)'}
            </button>

            {/* Diagnostics triggers */}
            <button
              onClick={() => setShowDiagnostics(!showDiagnostics)}
              className="w-full text-center text-[9px] uppercase tracking-wider text-stone-500 hover:text-stone-400 transition font-black py-0.5"
            >
              {showDiagnostics ? 'Hide Diagnostics' : 'Show Diagnostics'}
            </button>

            {/* Diagnostics panel */}
            {showDiagnostics && (
              <div className="bg-stone-950/80 border border-stone-850 text-stone-400 p-3 rounded-2xl text-[9px] font-mono space-y-1.5 shadow-inner">
                <div className="font-extrabold border-b border-stone-850 pb-1 mb-1 text-stone-500 text-center uppercase tracking-wider">Thông số chẩn đoán</div>
                <div className="flex justify-between"><span>Secure Context:</span> <span className="text-stone-200">{window.isSecureContext ? 'Yes' : 'No'}</span></div>
                <div className="flex justify-between"><span>Audio Context:</span> <span ref={debugStateRef} className="text-stone-200">-</span></div>
                <div className="flex justify-between"><span>Mic Track state:</span> <span ref={debugTrackRef} className="text-stone-200">-</span></div>
                <div className="flex justify-between"><span>Raw RMS:</span> <span ref={debugRmsRef} className="text-stone-200">-</span></div>
                <div className="flex justify-between"><span>Sample Rate:</span> <span className="text-stone-200">{tunerAudioCtxRef.current?.sampleRate || '0'} Hz</span></div>
                
                {consoleErrors.length > 0 && (
                  <div className="border-t border-stone-850 pt-1.5 mt-1.5">
                    <div className="text-red-500 font-bold mb-1 uppercase">ERRORS CONSOLE:</div>
                    <div className="space-y-1 text-red-400 text-[8px] leading-tight">
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
