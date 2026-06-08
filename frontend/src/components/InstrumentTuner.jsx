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
  },
  ukulele_low_g: {
    name: 'Ukulele (Low G)',
    strings: [
      { name: 'A', note: 'A4', freq: 440.00, index: 1 },
      { name: 'E', note: 'E4', freq: 329.63, index: 2 },
      { name: 'C', note: 'C4', freq: 261.63, index: 3 },
      { name: 'G', note: 'G3', freq: 196.00, index: 4 },
    ]
  }
};

// Optimized autocorrelation algorithm for pitch detection with parabolic interpolation refinement
function autoCorrelate(buffer, sampleRate, rms) {
  if (rms < 0.003) return -1; // Lowered threshold to 0.003 to detect E4/A4 strings easily while retaining noise rejection

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
  let maxpos_temp = -1;
  for (let i = Math.max(d, minLag); i < maxLag; i++) {
    if (c[i] > maxval) {
      maxval = c[i];
      maxpos_temp = i;
    }
  }

  // Determine threshold ratio dynamically: higher frequencies (above 220Hz) use 0.35,
  // lower frequencies use 0.50. This is highly effective because high strings decay faster
  // and have lower amplitude peaks, while our target-anchored noise gate filters out any false positives.
  const estimatedFreq = maxpos_temp > 0 ? sampleRate / maxpos_temp : 0;
  const thresholdRatio = estimatedFreq > 220 ? 0.35 : 0.50;

  if (maxval < thresholdRatio * c[0]) {
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

function getMedian(arr) {
  if (!arr || arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
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
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [tunedStrings, setTunedStrings] = useState([]);
  const [showAllTunedMessage, setShowAllTunedMessage] = useState(false);

  const currentStrings = INSTRUMENT_TUNINGS[selectedInst].strings;
  const activeTarget = tunerMode === 'manual' ? selectedString : detectedString;
  const inTune = activeTarget && frequency && Math.abs(cents) <= 12;
  const displayInTune = activeTarget && displayFrequency && Math.abs(displayCents) <= 12;
  const clampedCents = Math.max(-50, Math.min(50, cents));
  const needleRotation = frequency ? clampedCents * 1.2 : 0; // -60 to +60 deg

  const tunerAudioCtxRef = useRef(null);
  const refAudioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const audioStreamRef = useRef(null);
  const animationFrameRef = useRef(null);

  const oscillatorRef = useRef(null);
  const oscGainRef = useRef(null);
  const volumeBarRef = useRef(null);
  const wakeLockRef = useRef(null);

  const selectedInstRef = useRef(selectedInst);
  const tunerModeRef = useRef(tunerMode);
  const selectedStringRef = useRef(selectedString);

  // Stability & smoothing refs for tuner needle and note display
  const pitchHistoryRef = useRef([]);
  const centsHistoryRef = useRef([]);
  const settlingFramesRef = useRef(0);
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
    setTunedStrings([]); // Clear tuned strings list on instrument switch
    setShowAllTunedMessage(false);
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
    setShowAllTunedMessage(false);
  }, [tunerMode]);

  // Play chime confirm sound
  const playChime = () => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const now = audioCtx.currentTime;
      
      const playTone = (freq, delay, duration) => {
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + delay);
        
        gainNode.gain.setValueAtTime(0, now + delay);
        gainNode.gain.linearRampToValueAtTime(0.15, now + delay + 0.02);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + delay + duration);
        
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        osc.start(now + delay);
        osc.stop(now + delay + duration);
      };

      // Arpeggiated chime
      playTone(1046.50, 0, 0.35); // C6
      playTone(1318.51, 0.06, 0.45); // E6
      
      setTimeout(() => {
        try {
          audioCtx.close();
        } catch (e) {}
      }, 800);
    } catch (e) {
      console.warn('Failed to play chime:', e);
    }
  };

  // Track tuned strings, chime on new tuning success, and auto-stop when all strings are tuned
  useEffect(() => {
    if (displayInTune && activeTarget && isListening) {
      const stringId = activeTarget.index;
      if (!tunedStrings.includes(stringId)) {
        setTunedStrings(prev => {
          if (prev.includes(stringId)) return prev;
          const updated = [...prev, stringId];
          
          // Play confirm chime
          playChime();
          
          // Check if all strings are tuned for active instrument
          const totalStrings = INSTRUMENT_TUNINGS[selectedInst].strings.length;
          if (updated.length === totalStrings) {
            // Auto stop after 1.2s delay to show final tuned highlight
            setTimeout(() => {
              stopTuner();
              setShowAllTunedMessage(true);
            }, 1200);
          }
          return updated;
        });
      }
    }
  }, [displayInTune, activeTarget, selectedInst, tunedStrings, isListening]);

  // If the active target string is played and is out of tune, remove it from tunedStrings list
  useEffect(() => {
    if (activeTarget && isListening && frequency && !displayInTune) {
      const stringId = activeTarget.index;
      if (tunedStrings.includes(stringId)) {
        setTunedStrings(prev => prev.filter(id => id !== stringId));
      }
    }
  }, [activeTarget, isListening, frequency, displayInTune, tunedStrings]);

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
    setTunedStrings([]); // Clear tuned strings history on start
    setShowAllTunedMessage(false);
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



          const detectedFreq = autoCorrelate(dataArray, audioCtx.sampleRate, rms);

          // Apply instrument-specific frequency range filtering to reject out-of-range noise
          const isGuitar = selectedInstRef.current === 'guitar';
          const isLowGUke = selectedInstRef.current === 'ukulele_low_g';
          const minAllowedFreq = isGuitar ? 70 : isLowGUke ? 170 : 200;
          const maxAllowedFreq = isGuitar ? 480 : 600;

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

            // Determine parameters (optimized dynamically for responsive high-pitch strings)
            const maxHistory = 10;
            const settlingThreshold = detectedFreq > 220 ? 1 : 3; // Lower settling threshold for high strings
            const alpha = detectedFreq > 220 ? 0.18 : 0.10; // Faster tracking for high strings that decay quickly

            // Push to history buffers
            pitchHistoryRef.current.push(detectedFreq);
            if (pitchHistoryRef.current.length > maxHistory) {
              pitchHistoryRef.current.shift();
            }

            // Speech Rejection / Pitch Stability filter: check if pitch is sliding/unstable over the last 4 frames
            let isPitchStable = true;
            if (pitchHistoryRef.current.length >= 4) {
              const recentF = pitchHistoryRef.current.slice(-4);
              const minF = Math.min(...recentF);
              const maxF = Math.max(...recentF);
              const maxRatio = detectedFreq > 220 ? 1.03 : 1.018; // More lenient for high strings which slide/decay faster
              if (minF > 0 && maxF / minF > maxRatio) {
                isPitchStable = false;
              }
            }

            if (isPitchStable) {
              // Calculate median filtered frequency
              const filteredFreq = getMedian(pitchHistoryRef.current);

              // Increment settling frames
              settlingFramesRef.current += 1;

              // Only update active frequency if we have passed the transient settling gate
              if (settlingFramesRef.current > settlingThreshold) {
                if (smoothedFreqRef.current === 0) {
                  smoothedFreqRef.current = filteredFreq;
                } else {
                  smoothedFreqRef.current = smoothedFreqRef.current * (1 - alpha) + filteredFreq * alpha;
                }
                setFrequency(smoothedFreqRef.current);
              } else {
                // During settling gate, keep history updated but hold off updating state to avoid jumpiness
                smoothedFreqRef.current = filteredFreq;
              }

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

                // Apply string switching debouncing (faster confirmation for high strings)
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

                  const requiredConfirms = closest.freq > 220 ? 3 : 5;
                  if (stringChangeConfirmCountRef.current >= requiredConfirms) {
                    // Stable new string switch!
                    lastTargetStringRef.current = closest;
                    setDetectedString(closest);
                    target = closest;
                    stringChangeCandidateRef.current = null;
                    stringChangeConfirmCountRef.current = 0;
                    // Clear history on string change to avoid leakages
                    pitchHistoryRef.current = [];
                    centsHistoryRef.current = [];
                    settlingFramesRef.current = 0;
                  } else {
                    // Keep last target string until confirmed
                    target = lastTargetStringRef.current;
                  }
                }
              }

              if (target && settlingFramesRef.current > settlingThreshold) {
                let centsDev = 1200 * Math.log2(smoothedFreqRef.current / target.freq);
                
                // Apply a dead-zone lock-in: if extremely close (within 1.5 cents), snap to 0
                if (Math.abs(centsDev) < 1.5) {
                  centsDev = 0;
                }

                centsHistoryRef.current.push(centsDev);
                if (centsHistoryRef.current.length > maxHistory) {
                  centsHistoryRef.current.shift();
                }
                const filteredCents = getMedian(centsHistoryRef.current);

                if (smoothedCentsRef.current === 0) {
                  smoothedCentsRef.current = filteredCents;
                } else {
                  smoothedCentsRef.current = smoothedCentsRef.current * (1 - alpha) + filteredCents * alpha;
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
              // Reset settling frames count when the pitch is unstable (speech rejection)
              settlingFramesRef.current = 0;
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
              // Reset history buffers
              pitchHistoryRef.current = [];
              centsHistoryRef.current = [];
              settlingFramesRef.current = 0;
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
    pitchHistoryRef.current = [];
    centsHistoryRef.current = [];
    settlingFramesRef.current = 0;

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/60 backdrop-blur-sm animate-fade-in" onClick={handleClose}>
      <div className="bg-[#18181a] border border-stone-800 rounded-xl max-w-sm w-full p-6 shadow-2xl relative select-none flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-stone-800 pb-3 mb-3 select-none">
          <div className="flex items-center gap-2 font-black text-stone-100 text-[15px]">
            <Mic className="w-4.5 h-4.5 text-amber-500" />
            <span>Bộ lên dây / Instrument Tuner</span>
          </div>
          <button onClick={handleClose} className="p-1.5 rounded-full hover:bg-stone-800 text-stone-400 hover:text-stone-200 transition">
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        {/* On-Screen Segmented Quick Select Tabs */}
        <div className="flex bg-stone-900/50 p-1 rounded-lg border border-stone-800/80 mb-1.5 select-none">
          <button
            onClick={() => setSelectedInst('guitar')}
            className={`flex-1 py-2 text-xs font-black rounded-md transition-all cursor-pointer text-center ${
              selectedInst === 'guitar'
                ? 'bg-amber-950/60 border border-amber-800/80 text-amber-400 shadow-sm'
                : 'text-stone-500 hover:text-stone-400 border border-transparent'
            }`}
          >
            Guitar
          </button>
          <button
            onClick={() => setSelectedInst('ukulele')}
            className={`flex-1 py-2 text-xs font-black rounded-md transition-all cursor-pointer text-center ${
              selectedInst === 'ukulele'
                ? 'bg-blue-950/60 border border-blue-800/80 text-blue-400 shadow-sm'
                : 'text-stone-500 hover:text-stone-400 border border-transparent'
            }`}
          >
            Uke Standard
          </button>
          <button
            onClick={() => setSelectedInst('ukulele_low_g')}
            className={`flex-1 py-2 text-xs font-black rounded-md transition-all cursor-pointer text-center ${
              selectedInst === 'ukulele_low_g'
                ? 'bg-emerald-950/60 border border-emerald-800/80 text-emerald-400 shadow-sm'
                : 'text-stone-500 hover:text-stone-400 border border-transparent'
            }`}
          >
            Uke Low G
          </button>
        </div>
        <div className="text-[9px] text-stone-500 font-extrabold uppercase tracking-wider text-center select-none pb-1.5">
          {selectedInst === 'ukulele_low_g' ? 'Low G Tuning (G3-C4-E4-A4)' : selectedInst === 'ukulele' ? 'Standard Tuning (G4-C4-E4-A4)' : 'Standard Tuning (E2-A2-D3-G3-B3-E4)'}
        </div>

        {/* Modal Body */}
        <div className="flex-grow flex flex-col space-y-4">
          
          {/* 1. Horizontal sliding dial gauge */}
          <div className="flex flex-col items-center justify-center relative w-full h-24 bg-stone-900/40 rounded-lg border border-stone-800/80 overflow-hidden tuner-grid-bg">
            {/* Center Thick Target Marker Zone (±12 cents = 68px width) */}
            <div 
              className={`absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-[68px] z-0 transition-colors duration-150 ${
                displayInTune 
                  ? 'bg-green-500/15 border-x border-green-500/35 shadow-[inset_0_0_12px_rgba(34,197,94,0.12)]' 
                  : 'bg-stone-800/10 border-x border-stone-800/20'
              }`}
            ></div>
            {/* Center Vertical Target Line */}
            <div className={`absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-0.5 z-0 ${displayInTune ? 'bg-green-500/80 shadow-lg shadow-green-500/60' : 'bg-stone-700/50'}`}></div>
            
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
                <div ref={volumeBarRef} className="h-full bg-stone-800 transition-all duration-75" style={{ width: '0%' }}></div>
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
                <span className={`text-xs font-black px-2.5 py-1 rounded-full leading-none border transition-colors ${
                  displayInTune 
                    ? 'bg-green-950/80 text-green-400 border-green-900' 
                    : displayCents < 0 ? 'bg-amber-950/80 text-amber-400 border-amber-900' : 'bg-red-950/80 text-red-400 border-red-900'
                }`}>
                  {displayInTune 
                    ? 'Chuẩn nốt / In Tune! ✓' 
                    : displayCents < 0 
                      ? 'Căng lên / TIGHTEN ⬆' 
                      : 'Trùng xuống / LOOSEN ⬇'}
                </span>
                {!displayInTune && (
                  <span className="font-mono text-[10px] text-stone-500 font-bold">
                    {displayCents < 0 ? `${Math.round(displayCents)}` : `+${Math.round(displayCents)}`}
                  </span>
                )}
              </div>
            ) : (
              <div className="text-[10px] font-bold text-stone-500">Tuner is stopped</div>
            )}
          </div>

          {/* 3. Interactive SVG Headstock Visualizer */}
          <div className="relative flex items-center justify-center h-[280px] w-full bg-stone-900/10 rounded-lg border border-stone-800 p-4 overflow-hidden select-none">
            {selectedInst === 'guitar' ? (
              /* Symmetrical 3+3 Guitar Headstock SVG */
              <svg viewBox="0 0 200 300" className="h-[270px] w-[180px] drop-shadow-[0_12px_20px_rgba(0,0,0,0.6)]">
                <defs>
                  {/* Radial gradient representing a warm amber-to-dark sunburst wood finish */}
                  <radialGradient id="sunburst" cx="50%" cy="40%" r="65%" fx="45%" fy="35%">
                    <stop offset="0%" stopColor="#f59e0b" />
                    <stop offset="35%" stopColor="#d97706" />
                    <stop offset="65%" stopColor="#78350f" />
                    <stop offset="90%" stopColor="#291305" />
                    <stop offset="100%" stopColor="#0f0500" />
                  </radialGradient>
                  
                  {/* Highly reflective polished chrome */}
                  <linearGradient id="chromeShiny" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#f3f4f6" />
                    <stop offset="20%" stopColor="#e5e7eb" />
                    <stop offset="40%" stopColor="#9ca3af" />
                    <stop offset="45%" stopColor="#4b5563" />
                    <stop offset="50%" stopColor="#1f2937" />
                    <stop offset="55%" stopColor="#9ca3af" />
                    <stop offset="80%" stopColor="#e5e7eb" />
                    <stop offset="100%" stopColor="#374151" />
                  </linearGradient>

                  {/* Green chrome for tuned pegs */}
                  <linearGradient id="chromeTuned" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#e8f5e9" />
                    <stop offset="20%" stopColor="#a5d6a7" />
                    <stop offset="40%" stopColor="#66bb6a" />
                    <stop offset="50%" stopColor="#2e7d32" />
                    <stop offset="60%" stopColor="#1b5e20" />
                    <stop offset="80%" stopColor="#a5d6a7" />
                    <stop offset="100%" stopColor="#1b5e20" />
                  </linearGradient>

                  {/* Glowing blue chrome for active peg */}
                  <linearGradient id="chromeActive" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#dbeafe" />
                    <stop offset="20%" stopColor="#bfdbfe" />
                    <stop offset="40%" stopColor="#60a5fa" />
                    <stop offset="50%" stopColor="#2563eb" />
                    <stop offset="60%" stopColor="#1d4ed8" />
                    <stop offset="80%" stopColor="#60a5fa" />
                    <stop offset="100%" stopColor="#1e40af" />
                  </linearGradient>

                  {/* Golden brass gradient */}
                  <linearGradient id="brass" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#fef08a" />
                    <stop offset="25%" stopColor="#eab308" />
                    <stop offset="50%" stopColor="#ca8a04" />
                    <stop offset="75%" stopColor="#a16207" />
                    <stop offset="100%" stopColor="#78350f" />
                  </linearGradient>

                  {/* Lacquer varnish gloss reflection */}
                  <linearGradient id="glossReflection" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#ffffff" stopOpacity="0.25" />
                    <stop offset="30%" stopColor="#ffffff" stopOpacity="0.08" />
                    <stop offset="31%" stopColor="#ffffff" stopOpacity="0" />
                    <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                  </linearGradient>

                  {/* Clip path for the headstock wood */}
                  <clipPath id="guitarHeadstockClip">
                    <path d="M 80 230 C 68 220, 58 190, 58 170 L 58 45 C 58 32, 75 25, 100 35 C 125 25, 142 32, 142 45 L 142 170 C 142 190, 132 220, 120 230 Z" />
                  </clipPath>
                </defs>

                {/* Fretboard Mahogany Neck */}
                <rect x="80" y="235" width="40" height="65" fill="#3c1505" />
                <rect x="80" y="235" width="40" height="65" fill="url(#chromeShiny)" opacity="0.08" />
                
                {/* Fretboard dark rosewood */}
                <rect x="80" y="235" width="40" height="65" fill="#1c1917" rx="1" />
                
                {/* Bone Nut */}
                <rect x="80" y="230" width="40" height="6" fill="#f5f5f4" rx="1" />
                
                {/* Nut slots details */}
                <line x1="83.3" y1="230" x2="83.3" y2="236" stroke="#a8a29e" strokeWidth="0.8" />
                <line x1="90.0" y1="230" x2="90.0" y2="236" stroke="#a8a29e" strokeWidth="0.8" />
                <line x1="96.7" y1="230" x2="96.7" y2="236" stroke="#a8a29e" strokeWidth="0.8" />
                <line x1="103.3" y1="230" x2="103.3" y2="236" stroke="#a8a29e" strokeWidth="0.8" />
                <line x1="110.0" y1="230" x2="110.0" y2="236" stroke="#a8a29e" strokeWidth="0.8" />
                <line x1="116.7" y1="230" x2="116.7" y2="236" stroke="#a8a29e" strokeWidth="0.8" />

                {/* Guitar Wood Headstock with grains & reflections */}
                <g clipPath="url(#guitarHeadstockClip)">
                  <path 
                    d="M 80 230 C 68 220, 58 190, 58 170 L 58 45 C 58 32, 75 25, 100 35 C 125 25, 142 32, 142 45 L 142 170 C 142 190, 132 220, 120 230 Z" 
                    fill="url(#sunburst)" 
                  />
                  
                  {/* Simulated wood grain curves */}
                  <path d="M 65 60 Q 80 65, 95 70 T 115 150" stroke="#451a03" strokeWidth="0.5" opacity="0.25" fill="none" />
                  <path d="M 70 55 Q 85 60, 100 65 T 120 160" stroke="#451a03" strokeWidth="0.4" opacity="0.2" fill="none" />
                  <path d="M 60 80 Q 75 85, 90 90 T 110 190" stroke="#451a03" strokeWidth="0.6" opacity="0.28" fill="none" />
                  <path d="M 63 100 Q 78 105, 93 110 T 113 210" stroke="#451a03" strokeWidth="0.5" opacity="0.22" fill="none" />

                  {/* 3D Bevel Highlight */}
                  <path 
                    d="M 79 228 C 69 218, 60 188, 60 168 L 60 47 C 60 35, 76 28, 100 37 C 124 28, 140 35, 140 47 L 140 168 C 140 188, 131 218, 121 228" 
                    fill="none" 
                    stroke="#fef08a" 
                    strokeWidth="0.6" 
                    opacity="0.15" 
                  />
                  
                  {/* Gloss Lacquer varnish reflection */}
                  <path 
                    d="M 58 45 Q 100 90, 142 190 L 142 45 Z" 
                    fill="url(#glossReflection)" 
                    opacity="0.22" 
                    pointerEvents="none" 
                  />
                </g>
                
                {/* Outer edge stroke */}
                <path 
                  d="M 80 230 C 68 220, 58 190, 58 170 L 58 45 C 58 32, 75 25, 100 35 C 125 25, 142 32, 142 45 L 142 170 C 142 190, 132 220, 120 230 Z" 
                  fill="none" 
                  stroke="#220b02" 
                  strokeWidth="1.5" 
                />

                {/* 6 Tuning Pegs in 3+3 Symmetrical Layout */}
                {[
                  { y: 195, idx: 6, name: 'E', isLeft: true, freq: 82.41 }, // E2
                  { y: 135, idx: 5, name: 'A', isLeft: true, freq: 110.00 }, // A2
                  { y: 75,  idx: 4, name: 'D', isLeft: true, freq: 146.83 }, // D3
                  { y: 75,  idx: 3, name: 'G', isLeft: false, freq: 196.00 }, // G3
                  { y: 135, idx: 2, name: 'B', isLeft: false, freq: 246.94 }, // B3
                  { y: 195, idx: 1, name: 'e', isLeft: false, freq: 329.63 }  // E4
                ].map((peg) => {
                  const isPegActive = activeTarget?.index === peg.idx;
                  const isPegTuned = tunedStrings.includes(peg.idx) && (!isPegActive || !isListening || displayInTune);
                  return (
                    <g key={peg.idx}>
                      {peg.isLeft ? (
                        <g>
                          {/* Shaft and Base parts */}
                          <line x1="21" y1={peg.y} x2="68" y2={peg.y} stroke="url(#chromeShiny)" strokeWidth="1.8" />
                          <rect x="52" y={peg.y - 8} width="10" height="16" rx="1" fill="url(#chromeShiny)" stroke="#111827" strokeWidth="0.4" />
                          <circle cx="57" cy={peg.y} r="3.5" fill="url(#brass)" stroke="#7c2d12" strokeWidth="0.3" />
                          <circle cx="68" cy={peg.y} r="3" fill="url(#chromeShiny)" stroke="#1f2937" strokeWidth="0.4" />
                          <ellipse cx="68" cy={peg.y + 0.5} rx="2.2" ry="0.9" fill="#9ca3af" stroke="#374151" strokeWidth="0.2" />
                          <ellipse cx="68" cy={peg.y - 0.5} rx="2.2" ry="0.9" fill="#d1d5db" stroke="#374151" strokeWidth="0.2" />
                          
                          {/* Active Pulsing Halo */}
                          {isPegActive && (
                            <circle cx="21" cy={peg.y} r="13" fill="none" stroke={displayInTune ? "#10b981" : "#3b82f6"} strokeWidth="2" className="animate-pulse" />
                          )}
                          {/* Tuning Key Handle (Interactive Button) */}
                          <rect x="12" y={peg.y - 7} width="18" height="14" rx="4" fill={isPegTuned ? "url(#chromeTuned)" : isPegActive ? "url(#chromeActive)" : "url(#chromeShiny)"} stroke={isPegTuned ? "#047857" : isPegActive ? "#2563eb" : "#1f2937"} strokeWidth="0.8" />
                          <text x="21" y={peg.y + 3.5} fill={isPegActive ? "#ffffff" : isPegTuned ? "#065f46" : "#374151"} fontSize="10" fontFamily="monospace" fontWeight="black" textAnchor="middle">{peg.name}</text>
                          <circle cx="21" cy={peg.y} r="18" fill="transparent" className="cursor-pointer pointer-events-auto" onClick={() => {
                            if (tunerMode === 'manual') {
                              const matched = currentStrings.find(s => s.index === peg.idx);
                              if (matched) setSelectedString(matched);
                            }
                            playReferenceTone(peg.freq);
                          }} />
                        </g>
                      ) : (
                        <g>
                          {/* Shaft and Base parts */}
                          <line x1="132" y1={peg.y} x2="179" y2={peg.y} stroke="url(#chromeShiny)" strokeWidth="1.8" />
                          <rect x="138" y={peg.y - 8} width="10" height="16" rx="1" fill="url(#chromeShiny)" stroke="#111827" strokeWidth="0.4" />
                          <circle cx="143" cy={peg.y} r="3.5" fill="url(#brass)" stroke="#7c2d12" strokeWidth="0.3" />
                          <circle cx="132" cy={peg.y} r="3" fill="url(#chromeShiny)" stroke="#1f2937" strokeWidth="0.4" />
                          <ellipse cx="132" cy={peg.y + 0.5} rx="2.2" ry="0.9" fill="#9ca3af" stroke="#374151" strokeWidth="0.2" />
                          <ellipse cx="132" cy={peg.y - 0.5} rx="2.2" ry="0.9" fill="#d1d5db" stroke="#374151" strokeWidth="0.2" />
                          
                          {/* Active Pulsing Halo */}
                          {isPegActive && (
                            <circle cx="179" cy={peg.y} r="13" fill="none" stroke={displayInTune ? "#10b981" : "#3b82f6"} strokeWidth="2" className="animate-pulse" />
                          )}
                          {/* Tuning Key Handle (Interactive Button) */}
                          <rect x="170" y={peg.y - 7} width="18" height="14" rx="4" fill={isPegTuned ? "url(#chromeTuned)" : isPegActive ? "url(#chromeActive)" : "url(#chromeShiny)"} stroke={isPegTuned ? "#047857" : isPegActive ? "#2563eb" : "#1f2937"} strokeWidth="0.8" />
                          <text x="179" y={peg.y + 3.5} fill={isPegActive ? "#ffffff" : isPegTuned ? "#065f46" : "#374151"} fontSize="10" fontFamily="monospace" fontWeight="black" textAnchor="middle">{peg.name}</text>
                          <circle cx="179" cy={peg.y} r="18" fill="transparent" className="cursor-pointer pointer-events-auto" onClick={() => {
                            if (tunerMode === 'manual') {
                              const matched = currentStrings.find(s => s.index === peg.idx);
                              if (matched) setSelectedString(matched);
                            }
                            playReferenceTone(peg.freq);
                          }} />
                        </g>
                      )}
                    </g>
                  );
                })}

                {/* Steel Strings */}
                {[
                  { xNut: 83.3,  postX: 68,  pegY: 195, idx: 6, t: 2.6 }, // String 6 (E2)
                  { xNut: 90.0,  postX: 68,  pegY: 135, idx: 5, t: 2.2 }, // String 5 (A2)
                  { xNut: 96.7,  postX: 68,  pegY: 75,  idx: 4, t: 1.8 }, // String 4 (D3)
                  { xNut: 103.3, postX: 132, pegY: 75,  idx: 3, t: 1.5 }, // String 3 (G3)
                  { xNut: 110.0, postX: 132, pegY: 135, idx: 2, t: 1.2 }, // String 2 (B3)
                  { xNut: 116.7, postX: 132, pegY: 195, idx: 1, t: 1.0 }  // String 1 (E4)
                ].map((str) => {
                  const isStrActive = activeTarget?.index === str.idx;
                  const isStrTuned = tunedStrings.includes(str.idx) && (!isStrActive || !isListening || displayInTune);
                  const vibrateClass = isStrActive && isListening && frequency ? 'animate-string-vibrate' : '';
                  return (
                    <path
                      key={str.idx}
                      d={`M ${str.xNut} 300 L ${str.xNut} 230 L ${str.postX} ${str.pegY}`}
                      fill="none"
                      stroke={isStrActive && isListening && frequency ? (displayInTune ? '#10b981' : '#60a5fa') : isStrTuned ? '#10b981' : '#9ca3af'}
                      strokeWidth={str.t}
                      opacity={isStrActive && isListening && frequency ? 1.0 : isStrTuned ? 0.9 : 0.45}
                      className={vibrateClass}
                    />
                  );
                })}
              </svg>
            ) : (
              /* Symmetrical 2+2 Ukulele Headstock SVG (No branding) */
              <svg viewBox="0 0 200 300" className="h-[270px] w-[180px] drop-shadow-[0_12px_20px_rgba(0,0,0,0.6)]">
                <defs>
                  {/* Radial gradient representing warm koa wood finish */}
                  <radialGradient id="ukeKoaWood" cx="50%" cy="50%" r="70%" fx="45%" fy="45%">
                    <stop offset="0%" stopColor="#ea580c" />
                    <stop offset="35%" stopColor="#b45309" />
                    <stop offset="70%" stopColor="#78350f" />
                    <stop offset="100%" stopColor="#3c1505" />
                  </radialGradient>

                  {/* Highly reflective polished chrome */}
                  <linearGradient id="chromeShinyUke" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#f3f4f6" />
                    <stop offset="20%" stopColor="#e5e7eb" />
                    <stop offset="40%" stopColor="#9ca3af" />
                    <stop offset="45%" stopColor="#4b5563" />
                    <stop offset="50%" stopColor="#1f2937" />
                    <stop offset="55%" stopColor="#9ca3af" />
                    <stop offset="80%" stopColor="#e5e7eb" />
                    <stop offset="100%" stopColor="#374151" />
                  </linearGradient>

                  {/* Green chrome for tuned pegs */}
                  <linearGradient id="chromeTunedUke" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#e8f5e9" />
                    <stop offset="20%" stopColor="#a5d6a7" />
                    <stop offset="40%" stopColor="#66bb6a" />
                    <stop offset="50%" stopColor="#2e7d32" />
                    <stop offset="60%" stopColor="#1b5e20" />
                    <stop offset="80%" stopColor="#a5d6a7" />
                    <stop offset="100%" stopColor="#1b5e20" />
                  </linearGradient>

                  {/* Glowing blue chrome for active peg */}
                  <linearGradient id="chromeActiveUke" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#dbeafe" />
                    <stop offset="20%" stopColor="#bfdbfe" />
                    <stop offset="40%" stopColor="#60a5fa" />
                    <stop offset="50%" stopColor="#2563eb" />
                    <stop offset="60%" stopColor="#1d4ed8" />
                    <stop offset="80%" stopColor="#60a5fa" />
                    <stop offset="100%" stopColor="#1e40af" />
                  </linearGradient>

                  {/* Golden brass gradient */}
                  <linearGradient id="brassUke" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#fef08a" />
                    <stop offset="25%" stopColor="#eab308" />
                    <stop offset="50%" stopColor="#ca8a04" />
                    <stop offset="75%" stopColor="#a16207" />
                    <stop offset="100%" stopColor="#78350f" />
                  </linearGradient>

                  {/* Lacquer varnish gloss reflection */}
                  <linearGradient id="glossReflectionUke" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#ffffff" stopOpacity="0.25" />
                    <stop offset="30%" stopColor="#ffffff" stopOpacity="0.08" />
                    <stop offset="31%" stopColor="#ffffff" stopOpacity="0" />
                    <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                  </linearGradient>

                  {/* Clip path for the headstock wood */}
                  <clipPath id="ukeleleHeadstockClip">
                    <path d="M 80 230 C 68 220, 58 190, 58 170 L 58 60 C 58 45, 75 40, 100 50 C 125 40, 142 45, 142 60 L 142 170 C 142 190, 132 220, 120 230 Z" />
                  </clipPath>
                </defs>

                {/* Fretboard dark mahogany neck */}
                <rect x="80" y="235" width="40" height="65" fill="#3c1505" />
                <rect x="80" y="235" width="40" height="65" fill="url(#chromeShinyUke)" opacity="0.08" />
                
                {/* Fretboard ebony */}
                <rect x="80" y="235" width="40" height="65" fill="#1c1917" rx="1" />
                
                {/* Bone Nut */}
                <rect x="80" y="230" width="40" height="6" fill="#f5f5f4" rx="1" />
                
                {/* Nut slots details */}
                <line x1="86" y1="230" x2="86" y2="236" stroke="#a8a29e" strokeWidth="0.8" />
                <line x1="95" y1="230" x2="95" y2="236" stroke="#a8a29e" strokeWidth="0.8" />
                <line x1="105" y1="230" x2="105" y2="236" stroke="#a8a29e" strokeWidth="0.8" />
                <line x1="114" y1="230" x2="114" y2="236" stroke="#a8a29e" strokeWidth="0.8" />

                {/* Symmetrical Ukelele Wood Headstock */}
                <g clipPath="url(#ukeleleHeadstockClip)">
                  <path 
                    d="M 80 230 C 68 220, 58 190, 58 170 L 58 60 C 58 45, 75 40, 100 50 C 125 40, 142 45, 142 60 L 142 170 C 142 190, 132 220, 120 230 Z" 
                    fill="url(#ukeKoaWood)" 
                  />
                  
                  {/* Flame Koa grain stripes */}
                  <path d="M 60 80 Q 100 85, 140 80" stroke="#3c1505" strokeWidth="3.0" opacity="0.32" fill="none" />
                  <path d="M 58 105 Q 100 112, 142 105" stroke="#3c1505" strokeWidth="3.5" opacity="0.35" fill="none" />
                  <path d="M 58 130 Q 100 137, 142 130" stroke="#3c1505" strokeWidth="2.5" opacity="0.32" fill="none" />
                  <path d="M 58 155 Q 100 162, 142 155" stroke="#3c1505" strokeWidth="3.5" opacity="0.38" fill="none" />
                  <path d="M 60 180 Q 100 187, 140 180" stroke="#3c1505" strokeWidth="3.0" opacity="0.30" fill="none" />

                  {/* Bevel highlight */}
                  <path 
                    d="M 79 228 C 69 218, 60 188, 60 168 L 60 62 C 60 48, 76 43, 100 53 C 124 43, 140 48, 140 62 L 140 168 C 140 188, 131 218, 121 228" 
                    fill="none" 
                    stroke="#fed7aa" 
                    strokeWidth="0.6" 
                    opacity="0.15" 
                  />
                  
                  {/* Gloss Lacquer varnish reflection */}
                  <path 
                    d="M 58 60 Q 100 90, 142 165 L 142 60 Z" 
                    fill="url(#glossReflectionUke)" 
                    opacity="0.22" 
                    pointerEvents="none" 
                  />
                </g>
                
                {/* Outer edge stroke */}
                <path 
                  d="M 80 230 C 68 220, 58 190, 58 170 L 58 60 C 58 45, 75 40, 100 50 C 125 40, 142 45, 142 60 L 142 170 C 142 190, 132 220, 120 230 Z" 
                  fill="none" 
                  stroke="#220b02" 
                  strokeWidth="1.5" 
                />

                {/* 4 Symmetrical Tuning Pegs (No branding text printed) */}
                {[
                  { y: 175, idx: 4, name: 'G', isLeft: true, freq: selectedInst === 'ukulele_low_g' ? 196.00 : 392.00 }, // string 4 (g4/G3)
                  { y: 115, idx: 3, name: 'C', isLeft: true, freq: 261.63 }, // string 3 (C4)
                  { y: 115, idx: 2, name: 'E', isLeft: false, freq: 329.63 }, // string 2 (E4)
                  { y: 175, idx: 1, name: 'A', isLeft: false, freq: 440.00 }  // string 1 (A4)
                ].map((peg) => {
                  const isPegActive = activeTarget?.index === peg.idx;
                  const isPegTuned = tunedStrings.includes(peg.idx) && (!isPegActive || !isListening || displayInTune);
                  return (
                    <g key={peg.idx}>
                      {peg.isLeft ? (
                        <g>
                          {/* Shaft and Base parts */}
                          <line x1="21" y1={peg.y} x2="70" y2={peg.y} stroke="url(#chromeShinyUke)" strokeWidth="1.8" />
                          <rect x="54" y={peg.y - 7} width="8" height="14" rx="1" fill="url(#chromeShinyUke)" stroke="#111827" strokeWidth="0.3" />
                          <circle cx="58" cy={peg.y} r="2.8" fill="url(#brassUke)" stroke="#7c2d12" strokeWidth="0.25" />
                          <circle cx="70" cy={peg.y} r="2.5" fill="url(#chromeShinyUke)" stroke="#1f2937" strokeWidth="0.4" />
                          <ellipse cx="70" cy={peg.y + 0.3} rx="1.8" ry="0.8" fill="#9ca3af" stroke="#374151" strokeWidth="0.2" />
                          <ellipse cx="70" cy={peg.y - 0.3} rx="1.8" ry="0.8" fill="#d1d5db" stroke="#374151" strokeWidth="0.2" />
                          
                          {/* Active Pulsing Halo */}
                          {isPegActive && (
                            <circle cx="21" cy={peg.y} r="13" fill="none" stroke={displayInTune ? "#10b981" : "#3b82f6"} strokeWidth="2" className="animate-pulse" />
                          )}
                          {/* Tuning Key Handle (Interactive Button) */}
                          <rect x="12" y={peg.y - 7} width="18" height="14" rx="4" fill={isPegTuned ? "url(#chromeTunedUke)" : isPegActive ? "url(#chromeActiveUke)" : "url(#chromeShinyUke)"} stroke={isPegTuned ? "#047857" : isPegActive ? "#2563eb" : "#1f2937"} strokeWidth="0.8" />
                          <text x="21" y={peg.y + 3.5} fill={isPegActive ? "#ffffff" : isPegTuned ? "#065f46" : "#374151"} fontSize="10" fontFamily="monospace" fontWeight="black" textAnchor="middle">{peg.name}</text>
                          <circle cx="21" cy={peg.y} r="18" fill="transparent" className="cursor-pointer pointer-events-auto" onClick={() => {
                            if (tunerMode === 'manual') {
                              const matched = currentStrings.find(s => s.index === peg.idx);
                              if (matched) setSelectedString(matched);
                            }
                            playReferenceTone(peg.freq);
                          }} />
                        </g>
                      ) : (
                        <g>
                          {/* Shaft and Base parts */}
                          <line x1="130" y1={peg.y} x2="179" y2={peg.y} stroke="url(#chromeShinyUke)" strokeWidth="1.8" />
                          <rect x="138" y={peg.y - 7} width="8" height="14" rx="1" fill="url(#chromeShinyUke)" stroke="#111827" strokeWidth="0.3" />
                          <circle cx="142" cy={peg.y} r="2.8" fill="url(#brassUke)" stroke="#7c2d12" strokeWidth="0.25" />
                          <circle cx="130" cy={peg.y} r="2.5" fill="url(#chromeShinyUke)" stroke="#1f2937" strokeWidth="0.4" />
                          <ellipse cx="130" cy={peg.y + 0.3} rx="1.8" ry="0.8" fill="#9ca3af" stroke="#374151" strokeWidth="0.2" />
                          <ellipse cx="130" cy={peg.y - 0.3} rx="1.8" ry="0.8" fill="#d1d5db" stroke="#374151" strokeWidth="0.2" />
                          
                          {/* Active Pulsing Halo */}
                          {isPegActive && (
                            <circle cx="179" cy={peg.y} r="13" fill="none" stroke={displayInTune ? "#10b981" : "#3b82f6"} strokeWidth="2" className="animate-pulse" />
                          )}
                          {/* Tuning Key Handle (Interactive Button) */}
                          <rect x="170" y={peg.y - 7} width="18" height="14" rx="4" fill={isPegTuned ? "url(#chromeTunedUke)" : isPegActive ? "url(#chromeActiveUke)" : "url(#chromeShinyUke)"} stroke={isPegTuned ? "#047857" : isPegActive ? "#2563eb" : "#1f2937"} strokeWidth="0.8" />
                          <text x="179" y={peg.y + 3.5} fill={isPegActive ? "#ffffff" : isPegTuned ? "#065f46" : "#374151"} fontSize="10" fontFamily="monospace" fontWeight="black" textAnchor="middle">{peg.name}</text>
                          <circle cx="179" cy={peg.y} r="18" fill="transparent" className="cursor-pointer pointer-events-auto" onClick={() => {
                            if (tunerMode === 'manual') {
                              const matched = currentStrings.find(s => s.index === peg.idx);
                              if (matched) setSelectedString(matched);
                            }
                            playReferenceTone(peg.freq);
                          }} />
                        </g>
                      )}
                    </g>
                  );
                })}

                {/* Nylon Strings */}
                {[
                  { xNut: 86,  postX: 70,  pegY: 175, idx: 4, t: selectedInst === 'ukulele_low_g' ? 1.8 : 1.5 }, // string 4
                  { xNut: 95,  postX: 70,  pegY: 115, idx: 3, t: 1.9 }, // string 3 (C4)
                  { xNut: 105, postX: 130, pegY: 115, idx: 2, t: 1.7 }, // string 2 (E4)
                  { xNut: 114, postX: 130, pegY: 175, idx: 1, t: 1.3 }  // string 1 (A4)
                ].map((str) => {
                  const isStrActive = activeTarget?.index === str.idx;
                  const isStrTuned = tunedStrings.includes(str.idx) && (!isStrActive || !isListening || displayInTune);
                  const vibrateClass = isStrActive && isListening && frequency ? 'animate-string-vibrate' : '';
                  return (
                    <path
                      key={str.idx}
                      d={`M ${str.xNut} 300 L ${str.xNut} 230 L ${str.postX} ${str.pegY}`}
                      fill="none"
                      stroke={isStrActive && isListening && frequency ? (displayInTune ? '#10b981' : '#60a5fa') : isStrTuned ? '#10b981' : '#d6d3d1'}
                      strokeWidth={str.t}
                      opacity={isStrActive && isListening && frequency ? 1.0 : isStrTuned ? 0.9 : 0.55}
                      className={vibrateClass}
                    />
                  );
                })}
              </svg>
            )}
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
                    : 'bg-stone-900/40 border-stone-800 text-stone-500 hover:text-stone-400'
                }`}
              >
                Auto
              </button>
              <button
                onClick={() => setTunerMode('manual')}
                className={`px-4 py-1.5 rounded-full border transition-all cursor-pointer ${
                  tunerMode === 'manual'
                    ? 'bg-amber-950/60 border-amber-800 text-amber-400 font-extrabold shadow-sm shadow-amber-500/10'
                    : 'bg-stone-900/40 border-stone-800 text-stone-500 hover:text-stone-400'
                }`}
              >
                Manual
              </button>
            </div>

            {/* Mic Activation Trigger */}
            <button
              onClick={toggleListening}
              className={`w-full py-10 mb-4 rounded-lg text-base font-black transition-all active:scale-[0.98] flex items-center justify-center gap-3 cursor-pointer shadow-md ${
                isListening
                  ? 'bg-red-950/80 border border-red-800 text-red-200 hover:bg-red-900'
                  : 'bg-stone-100 hover:bg-white text-stone-900'
              }`}
            >
              <Mic className={`w-6 h-6 ${isListening ? 'animate-pulse' : ''}`} />
              {isListening ? 'STOP TUNER (DỪNG)' : 'START TUNER (BẮT ĐẦU)'}
            </button>
          </div>
        </div>

        {/* Success Overlay Dialog Box */}
        {showAllTunedMessage && (
          <div className="absolute inset-0 z-30 flex items-center justify-center p-4 bg-stone-950/80 backdrop-blur-md rounded-xl animate-fade-in" onClick={() => setShowAllTunedMessage(false)}>
            <div className="bg-[#18181a] border border-emerald-500/30 p-6 rounded-xl max-w-[260px] w-full flex flex-col items-center justify-center text-center shadow-2xl animate-scale-up" onClick={(e) => e.stopPropagation()}>
              <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mb-4 text-emerald-400 animate-bounce">
                <Check className="w-7 h-7" />
              </div>
              <h3 className="text-stone-100 font-black text-sm tracking-wide mb-1">
                All strings are tuned!
              </h3>
              <p className="text-emerald-400 font-extrabold text-xs mb-3">
                Tất cả các dây đã chuẩn!
              </p>
              <p className="text-stone-400 text-[10px] font-bold">
                Sẵn sàng đệm hát rồi! / Ready to play!
              </p>
              <button
                onClick={() => setShowAllTunedMessage(false)}
                className="mt-5 px-6 py-2 rounded-md bg-emerald-500 hover:bg-emerald-600 active:scale-[0.98] text-stone-950 font-black text-[10px] uppercase tracking-wider transition-all cursor-pointer shadow-md shadow-emerald-500/20"
              >
                Đồng ý / Close
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
