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

  // If no peak found or correlation is too weak (below 55% of energy at lag 0)
  if (maxval < 0.55 * c[0]) {
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
          const maxAllowedFreq = isGuitar ? 380 : 600;

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

            // Determine parameters (fixed to 'smooth' preset internally)
            const maxHistory = 12;
            const settlingThreshold = 6;
            const alpha = 0.04;

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
              if (minF > 0 && maxF / minF > 1.018) {
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
      <div className="bg-[#18181a] border border-stone-800 rounded-[28px] max-w-sm w-full p-6 shadow-2xl relative select-none flex flex-col" onClick={(e) => e.stopPropagation()}>
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
        <div className="flex bg-stone-900/50 p-1 rounded-2xl border border-stone-800/80 mb-1.5 select-none">
          <button
            onClick={() => setSelectedInst('guitar')}
            className={`flex-1 py-2 text-xs font-black rounded-xl transition-all cursor-pointer text-center ${
              selectedInst === 'guitar'
                ? 'bg-amber-950/60 border border-amber-800/80 text-amber-400 shadow-sm'
                : 'text-stone-500 hover:text-stone-400 border border-transparent'
            }`}
          >
            Guitar
          </button>
          <button
            onClick={() => setSelectedInst('ukulele')}
            className={`flex-1 py-2 text-xs font-black rounded-xl transition-all cursor-pointer text-center ${
              selectedInst === 'ukulele'
                ? 'bg-blue-950/60 border border-blue-800/80 text-blue-400 shadow-sm'
                : 'text-stone-500 hover:text-stone-400 border border-transparent'
            }`}
          >
            Uke Standard
          </button>
          <button
            onClick={() => setSelectedInst('ukulele_low_g')}
            className={`flex-1 py-2 text-xs font-black rounded-xl transition-all cursor-pointer text-center ${
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
          <div className="flex flex-col items-center justify-center relative w-full h-24 bg-stone-900/40 rounded-2xl border border-stone-800/80 overflow-hidden tuner-grid-bg">
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
          <div className="relative flex items-center justify-between h-[280px] w-full bg-stone-900/10 rounded-3xl border border-stone-800 p-4 overflow-hidden select-none">
            
            {/* Peg Buttons Column on the Left */}
            <div className="flex flex-col justify-between h-full w-[45px] z-10">
              {currentStrings.map((stringObj) => {
                const isSelected = activeTarget?.index === stringObj.index;
                const isTuned = tunedStrings.includes(stringObj.index) && (!isSelected || !isListening || displayInTune);
                return (
                  <button
                    key={stringObj.index}
                    onClick={() => {
                      if (tunerMode === 'manual') {
                        setSelectedString(stringObj);
                      }
                      playReferenceTone(stringObj.freq);
                    }}
                    className={`w-9 h-9 rounded-full flex flex-col items-center justify-center border transition-all active:scale-[0.98] cursor-pointer ${
                      isSelected
                        ? displayInTune && isListening
                          ? 'bg-green-900 border-green-500 text-green-300 shadow-md shadow-green-500/20 font-black animate-pulse'
                          : isTuned
                            ? 'bg-green-950/80 border-green-700 text-green-400 font-black'
                            : 'bg-blue-900 border-blue-500 text-blue-300 shadow-md shadow-blue-500/20 font-black'
                        : isTuned
                          ? 'bg-green-950/40 border-green-900/60 text-green-500/90 font-bold'
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
                      <path d="M 58 242 C 45 235, 33 215, 33 205 L 33 45 C 33 25, 78 12, 95 22 C 112 32, 112 95, 102 150 C 96 185, 102 230, 102 242 Z" />
                    </clipPath>
                  </defs>

                  {/* Fretboard Mahogany Neck */}
                  <rect x="58" y="245" width="44" height="55" fill="#3c1505" />
                  <rect x="58" y="245" width="44" height="55" fill="url(#chromeShiny)" opacity="0.08" />
                  
                  {/* Fretboard dark rosewood */}
                  <rect x="58" y="245" width="44" height="55" fill="#1c1917" rx="1" />
                  
                  {/* Fret silver lines */}
                  <line x1="58" y1="275" x2="102" y2="275" stroke="#d1d5db" strokeWidth="1.2" />
                  
                  {/* Fret Bone Nut */}
                  <rect x="58" y="242" width="44" height="4.5" fill="#f5f5f4" rx="1" />
                  
                  {/* Nut slots details */}
                  <line x1="62" y1="242" x2="62" y2="246.5" stroke="#a8a29e" strokeWidth="0.8" />
                  <line x1="69" y1="242" x2="69" y2="246.5" stroke="#a8a29e" strokeWidth="0.8" />
                  <line x1="76" y1="242" x2="76" y2="246.5" stroke="#a8a29e" strokeWidth="0.8" />
                  <line x1="83" y1="242" x2="83" y2="246.5" stroke="#a8a29e" strokeWidth="0.8" />
                  <line x1="90" y1="242" x2="90" y2="246.5" stroke="#a8a29e" strokeWidth="0.8" />
                  <line x1="97" y1="242" x2="97" y2="246.5" stroke="#a8a29e" strokeWidth="0.8" />

                  {/* Guitar Wood Headstock with grains & reflections */}
                  <g clipPath="url(#guitarHeadstockClip)">
                    <path 
                      d="M 58 242 C 45 235, 33 215, 33 205 L 33 45 C 33 25, 78 12, 95 22 C 112 32, 112 95, 102 150 C 96 185, 102 230, 102 242 Z" 
                      fill="url(#sunburst)" 
                    />
                    
                    {/* Simulated wood grain curves */}
                    <path d="M 40 40 Q 60 45, 80 50 T 100 120" stroke="#451a03" strokeWidth="0.5" opacity="0.25" fill="none" />
                    <path d="M 45 35 Q 65 40, 85 45 T 105 130" stroke="#451a03" strokeWidth="0.4" opacity="0.2" fill="none" />
                    <path d="M 35 60 Q 55 65, 75 70 T 95 160" stroke="#451a03" strokeWidth="0.6" opacity="0.28" fill="none" />
                    <path d="M 38 80 Q 58 85, 78 90 T 98 180" stroke="#451a03" strokeWidth="0.5" opacity="0.22" fill="none" />
                    <path d="M 36 100 Q 56 105, 76 110 T 96 200" stroke="#451a03" strokeWidth="0.4" opacity="0.25" fill="none" />
                    <path d="M 34 130 Q 54 135, 74 140 T 94 220" stroke="#451a03" strokeWidth="0.5" opacity="0.18" fill="none" />
                    <path d="M 34 160 Q 54 165, 74 170 T 94 235" stroke="#451a03" strokeWidth="0.6" opacity="0.2" fill="none" />

                    {/* 3D Bevel Highlight */}
                    <path 
                      d="M 57 240 C 46 233, 35 214, 35 204 L 35 47 C 35 28, 77 15, 93 24 C 109 34, 109 94, 100 148 C 94 183, 100 228, 100 240" 
                      fill="none" 
                      stroke="#fef08a" 
                      strokeWidth="0.6" 
                      opacity="0.15" 
                    />
                    
                    {/* Gloss Lacquer varnish reflection */}
                    <path 
                      d="M 33 30 Q 80 80, 112 180 L 112 30 Z" 
                      fill="url(#glossReflection)" 
                      opacity="0.22" 
                      pointerEvents="none" 
                    />
                  </g>
                  
                  {/* Outer edge stroke */}
                  <path 
                    d="M 58 242 C 45 235, 33 215, 33 205 L 33 45 C 33 25, 78 12, 95 22 C 112 32, 112 95, 102 150 C 96 185, 102 230, 102 242 Z" 
                    fill="none" 
                    stroke="#220b02" 
                    strokeWidth="1.2" 
                  />

                  {/* 6 Tuning Pegs with detailed base plates, brass gears, and string winds */}
                  {[
                    { y: 215, idx: 6, strThick: '2.4' }, // E2
                    { y: 181, idx: 5, strThick: '2.0' }, // A2
                    { y: 147, idx: 4, strThick: '1.7' }, // D3
                    { y: 113, idx: 3, strThick: '1.4' }, // G3
                    { y: 79,  idx: 2, strThick: '1.1' }, // B3
                    { y: 45,  idx: 1, strThick: '0.8' }  // E4
                  ].map((peg) => {
                    const isPegActive = activeTarget?.index === peg.idx;
                    const isPegTuned = tunedStrings.includes(peg.idx) && (!isPegActive || !isListening || displayInTune);
                    return (
                      <g key={peg.idx}>
                        {/* Chrome Tuning Key base plate */}
                        <rect x="36" y={peg.y - 8} width="14" height="16" rx="2" fill="url(#chromeShiny)" stroke="#1c1917" strokeWidth="0.5" />
                        <circle cx="43" cy={peg.y - 5.5} r="0.8" fill="#374151" stroke="#1f2937" strokeWidth="0.2" />
                        <circle cx="43" cy={peg.y + 5.5} r="0.8" fill="#374151" stroke="#1f2937" strokeWidth="0.2" />

                        {/* Golden Brass Gear */}
                        <circle cx="43" cy={peg.y} r="4.5" fill="url(#brass)" stroke="#7c2d12" strokeWidth="0.4" />
                        <circle cx="43" cy={peg.y} r="4.5" fill="none" stroke="#fef08a" strokeWidth="0.6" strokeDasharray="0.8,0.8" />
                        <circle cx="43" cy={peg.y} r="1.2" fill="#374151" stroke="#1f2937" strokeWidth="0.3" />
                        <line x1="42.2" y1={peg.y} x2="43.8" y2={peg.y} stroke="#f3f4f6" strokeWidth="0.3" />

                        {/* Chrome shaft and casing */}
                        <rect x="39" y={peg.y - 1.2} width="8" height="2.4" fill="url(#chromeShiny)" rx="0.4" stroke="#1c1917" strokeWidth="0.3" />
                        <rect x="23" y={peg.y - 1} width="16" height="2" fill="url(#chromeShiny)" stroke="#111827" strokeWidth="0.4" />

                        {/* Chrome Tuning Key handle contoured */}
                        <path 
                          d={`M 13 ${peg.y} C 10 ${peg.y - 5.5}, 16 ${peg.y - 6}, 23 ${peg.y - 2.5} L 23 ${peg.y + 2.5} C 16 ${peg.y + 6}, 10 ${peg.y + 5.5}, 13 ${peg.y}`} 
                          fill={isPegTuned ? "url(#chromeTuned)" : "url(#chromeShiny)"} 
                          stroke={isPegTuned ? "#047857" : "#111827"} 
                          strokeWidth="0.6" 
                        />
                        <path 
                          d={`M 14.5 ${peg.y} C 12.5 ${peg.y - 3.5}, 17 ${peg.y - 4}, 21 ${peg.y - 1.5}`} 
                          fill="none" 
                          stroke="#ffffff" 
                          strokeWidth="0.4" 
                          opacity="0.5" 
                        />

                        {/* Chrome Post Washer and Cylinder */}
                        <ellipse cx="43" cy={peg.y} rx="4.0" ry="2.5" fill="url(#chromeShiny)" stroke="#111827" strokeWidth="0.4" />
                        <rect x="41.5" y={peg.y - 6} width="3" height="7" fill="url(#chromeShiny)" rx="0.5" stroke="#1f2937" strokeWidth="0.4" />

                        {/* String coils wound on post */}
                        <ellipse cx="43" cy={peg.y + 0.5} rx="2.8" ry="1.2" fill="#9ca3af" stroke="#374151" strokeWidth="0.25" />
                        <ellipse cx="43" cy={peg.y - 0.5} rx="2.8" ry="1.2" fill="#d1d5db" stroke="#374151" strokeWidth="0.25" />
                        <ellipse cx="43" cy={peg.y - 1.5} rx="2.8" ry="1.2" fill="#e5e7eb" stroke="#374151" strokeWidth="0.25" />

                        {/* Cut string end sticking out */}
                        <path d={`M 45.8 ${peg.y - 2.5} Q 49 ${peg.y - 4.5}, 47.5 ${peg.y - 7.5}`} fill="none" stroke="#9ca3af" strokeWidth="0.75" />

                        {isPegActive && (
                          <ellipse cx="43" cy={peg.y} rx="7.5" ry="5.5" fill="none" stroke={displayInTune ? "#10b981" : "#3b82f6"} strokeWidth="1" className="animate-ping" />
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
                    const isStrTuned = tunedStrings.includes(str.idx) && (!isStrActive || !isListening || displayInTune);
                    const vibrateClass = isStrActive && isListening && frequency ? 'animate-string-vibrate' : '';
                    return (
                      <path
                        key={str.idx}
                        d={`M ${str.xNut} 300 L ${str.xNut} 242 L 43 ${str.pegY}`}
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
                /* Ukulele Symmetrical 2+2 Headstock SVG */
                <svg viewBox="0 0 160 300" className="h-[270px] w-[145px] drop-shadow-[0_12px_20px_rgba(0,0,0,0.6)]">
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

                    {/* Pearlescent tuner key button */}
                    <radialGradient id="pearloidKey" cx="40%" cy="40%" r="60%">
                      <stop offset="0%" stopColor="#ffffff" />
                      <stop offset="40%" stopColor="#f3f4f6" />
                      <stop offset="80%" stopColor="#e5e7eb" />
                      <stop offset="100%" stopColor="#9ca3af" />
                    </radialGradient>

                    {/* Pearlescent tuner key button when tuned */}
                    <radialGradient id="pearloidTuned" cx="40%" cy="40%" r="60%">
                      <stop offset="0%" stopColor="#e8f5e9" />
                      <stop offset="40%" stopColor="#a5d6a7" />
                      <stop offset="80%" stopColor="#81c784" />
                      <stop offset="100%" stopColor="#2e7d32" />
                    </radialGradient>

                    {/* Clip path for the headstock wood */}
                    <clipPath id="ukeleleHeadstockClip">
                      <path d="M 58 242 C 48 235, 38 215, 38 180 C 38 120, 48 60, 80 60 C 112 60, 122 120, 122 180 C 122 215, 112 235, 102 242 Z" />
                    </clipPath>
                  </defs>

                  {/* Fretboard dark mahogany neck */}
                  <rect x="58" y="245" width="44" height="55" fill="#3c1505" />
                  <rect x="58" y="245" width="44" height="55" fill="url(#chromeShinyUke)" opacity="0.08" />
                  
                  {/* Fretboard ebony */}
                  <rect x="58" y="245" width="44" height="55" fill="#1c1917" rx="1" />
                  
                  {/* Fret lines */}
                  <line x1="58" y1="275" x2="102" y2="275" stroke="#d1d5db" strokeWidth="1.2" />
                  
                  {/* Bone Nut */}
                  <rect x="58" y="242" width="44" height="4.5" fill="#f5f5f4" rx="1" />
                  
                  {/* Nut slots details */}
                  <line x1="64" y1="242" x2="64" y2="246.5" stroke="#a8a29e" strokeWidth="0.8" />
                  <line x1="74" y1="242" x2="74" y2="246.5" stroke="#a8a29e" strokeWidth="0.8" />
                  <line x1="84" y1="242" x2="84" y2="246.5" stroke="#a8a29e" strokeWidth="0.8" />
                  <line x1="94" y1="242" x2="94" y2="246.5" stroke="#a8a29e" strokeWidth="0.8" />

                  {/* Symmetrical Ukelele Wood Headstock */}
                  <g clipPath="url(#ukeleleHeadstockClip)">
                    <path 
                      d="M 58 242 C 48 235, 38 215, 38 180 C 38 120, 48 60, 80 60 C 112 60, 122 120, 122 180 C 122 215, 112 235, 102 242 Z" 
                      fill="url(#ukeKoaWood)" 
                    />
                    
                    {/* Flame Koa grain stripes */}
                    <path d="M 40 80 Q 80 85, 120 80" stroke="#3c1505" strokeWidth="3.0" opacity="0.32" fill="none" />
                    <path d="M 38 98 Q 80 104, 122 98" stroke="#3c1505" strokeWidth="3.5" opacity="0.35" fill="none" />
                    <path d="M 38 118 Q 80 125, 122 118" stroke="#3c1505" strokeWidth="2.5" opacity="0.32" fill="none" />
                    <path d="M 38 138 Q 80 146, 122 138" stroke="#3c1505" strokeWidth="3.5" opacity="0.38" fill="none" />
                    <path d="M 38 158 Q 80 166, 122 158" stroke="#3c1505" strokeWidth="3.0" opacity="0.30" fill="none" />
                    <path d="M 38 178 Q 80 187, 122 178" stroke="#3c1505" strokeWidth="4.0" opacity="0.36" fill="none" />
                    <path d="M 40 198 Q 80 206, 120 198" stroke="#3c1505" strokeWidth="2.5" opacity="0.31" fill="none" />
                    <path d="M 44 218 Q 80 225, 116 218" stroke="#3c1505" strokeWidth="3.5" opacity="0.34" fill="none" />

                    {/* Bevel highlight */}
                    <path 
                      d="M 57 240 C 49 233, 40 214, 40 180 C 40 122, 49 63, 80 63 C 111 63, 120 122, 120 180 C 120 214, 111 233, 103 240" 
                      fill="none" 
                      stroke="#fed7aa" 
                      strokeWidth="0.6" 
                      opacity="0.15" 
                    />
                    
                    {/* Gloss Lacquer varnish reflection */}
                    <path 
                      d="M 38 65 Q 80 95, 122 170 L 122 60 Z" 
                      fill="url(#glossReflectionUke)" 
                      opacity="0.22" 
                      pointerEvents="none" 
                    />
                  </g>
                  
                  {/* Outer edge stroke */}
                  <path 
                    d="M 58 242 C 48 235, 38 215, 38 180 C 38 120, 48 60, 80 60 C 112 60, 122 120, 122 180 C 122 215, 112 235, 102 242 Z" 
                    fill="none" 
                    stroke="#220b02" 
                    strokeWidth="1.2" 
                  />

                  {/* 4 Symmetrical Tuning Pegs with detailed base plates, brass gears, and pearloid keys */}
                  {[
                    // Left pegs
                    { y: 190, x: 46, keyX: 18, isLeft: true, idx: 4 },  // string 4 (g4)
                    { y: 120, x: 46, keyX: 18, isLeft: true, idx: 3 },  // string 3 (C4)
                    // Right pegs
                    { y: 120, x: 114, keyX: 142, isLeft: false, idx: 2 }, // string 2 (E4)
                    { y: 190, x: 114, keyX: 142, isLeft: false, idx: 1 }  // string 1 (A4)
                  ].map((peg) => {
                    const isPegActive = activeTarget?.index === peg.idx;
                    const isPegTuned = tunedStrings.includes(peg.idx) && (!isPegActive || !isListening || displayInTune);
                    return (
                      <g key={peg.idx}>
                        {/* Pearloid button and shadow */}
                        {peg.isLeft ? (
                          <g>
                            <ellipse cx="14.5" cy={peg.y + 0.8} rx="4.5" ry="5.8" fill="#000000" opacity="0.4" />
                            <ellipse cx="14" cy={peg.y} rx="4" ry="5.5" fill={isPegTuned ? "url(#pearloidTuned)" : "url(#pearloidKey)"} stroke={isPegTuned ? "#047857" : "#4b5563"} strokeWidth="0.3" />
                            <rect x="18" y={peg.y - 0.8} width="3" height="1.6" fill="url(#chromeShinyUke)" stroke="#111827" strokeWidth="0.25" />
                          </g>
                        ) : (
                          <g>
                            <ellipse cx="145.5" cy={peg.y + 0.8} rx="4.5" ry="5.8" fill="#000000" opacity="0.4" />
                            <ellipse cx="146" cy={peg.y} rx="4" ry="5.5" fill={isPegTuned ? "url(#pearloidTuned)" : "url(#pearloidKey)"} stroke={isPegTuned ? "#047857" : "#4b5563"} strokeWidth="0.3" />
                            <rect x="139" y={peg.y - 0.8} width="3" height="1.6" fill="url(#chromeShinyUke)" stroke="#111827" strokeWidth="0.25" />
                          </g>
                        )}
                        <line x1={peg.isLeft ? 21 : 114} x2={peg.isLeft ? 46 : 139} y1={peg.y} y2={peg.y} stroke="url(#chromeShinyUke)" strokeWidth="1.8" />
                        
                        {/* Chrome base plate */}
                        <polygon 
                          points={peg.isLeft 
                            ? `${46 - 4},${peg.y - 5} ${46 + 4},${peg.y - 5} ${46 + 5},${peg.y} ${46 + 4},${peg.y + 5} ${46 - 4},${peg.y + 5} ${46 - 5},${peg.y}`
                            : `${114 - 4},${peg.y - 5} ${114 + 4},${peg.y - 5} ${114 + 5},${peg.y} ${114 + 4},${peg.y + 5} ${114 - 4},${peg.y + 5} ${114 - 5},${peg.y}`
                          } 
                          fill="url(#chromeShinyUke)" 
                          stroke="#1f2937" 
                          strokeWidth="0.3" 
                        />

                        {/* Gold Gear */}
                        <circle cx={peg.x} cy={peg.y} r="3.2" fill="url(#brassUke)" stroke="#7c2d12" strokeWidth="0.25" />
                        <circle cx={peg.x} cy={peg.y} r="3.2" fill="none" stroke="#fef08a" strokeWidth="0.3" strokeDasharray="0.6,0.6" />
                        <circle cx={peg.x} cy={peg.y} r="1.0" fill="#374151" stroke="#1f2937" strokeWidth="0.25" />

                        {/* Post Washer on face */}
                        <ellipse cx={peg.x} cy={peg.y} rx="3.2" ry="2.0" fill="url(#chromeShinyUke)" stroke="#111827" strokeWidth="0.3" />

                        {/* Vertical post cylinder */}
                        <rect x={peg.x - 1.2} y={peg.y - 4.5} width="2.4" height="5.5" fill="url(#chromeShinyUke)" rx="0.3" stroke="#1f2937" strokeWidth="0.25" />

                        {/* String winding coils */}
                        <ellipse cx={peg.x} cy={peg.y + 0.3} rx="2.0" ry="0.8" fill="#9ca3af" stroke="#374151" strokeWidth="0.2" />
                        <ellipse cx={peg.x} cy={peg.y - 0.3} rx="2.0" ry="0.8" fill="#d1d5db" stroke="#374151" strokeWidth="0.2" />
                        <ellipse cx={peg.x} cy={peg.y - 0.9} rx="2.0" ry="0.8" fill="#e5e7eb" stroke="#374151" strokeWidth="0.2" />
                        
                        {/* Cut string tip sticking out */}
                        <path d={peg.isLeft ? `M ${peg.x + 2} ${peg.y - 1.5} Q ${peg.x + 4.5} ${peg.y - 3}, ${peg.x + 3.5} ${peg.y - 5}` : `M ${peg.x - 2} ${peg.y - 1.5} Q ${peg.x - 4.5} ${peg.y - 3}, ${peg.x - 3.5} ${peg.y - 5}`} fill="none" stroke="#9ca3af" strokeWidth="0.55" />

                        {isPegActive && (
                          <ellipse cx={peg.x} cy={peg.y} rx="6.5" ry="4.5" fill="none" stroke={displayInTune ? "#10b981" : "#3b82f6"} strokeWidth="1" className="animate-ping" />
                        )}
                      </g>
                    );
                  })}

                  {/* Strings */}
                  {[
                    { xNut: 64, pegX: 46, pegY: 190, idx: 4, t: selectedInst === 'ukulele_low_g' ? 1.8 : 1.5 }, // string 4
                    { xNut: 74, pegX: 46, pegY: 120, idx: 3, t: 1.9 }, // string 3 (C4)
                    { xNut: 84, pegX: 114, pegY: 120, idx: 2, t: 1.7 }, // string 2 (E4)
                    { xNut: 94, pegX: 114, pegY: 190, idx: 1, t: 1.3 }  // string 1 (A4)
                  ].map((str) => {
                    const isStrActive = activeTarget?.index === str.idx;
                    const isStrTuned = tunedStrings.includes(str.idx) && (!isStrActive || !isListening || displayInTune);
                    const vibrateClass = isStrActive && isListening && frequency ? 'animate-string-vibrate' : '';
                    return (
                      <path
                        key={str.idx}
                        d={`M ${str.xNut} 300 L ${str.xNut} 242 L ${str.pegX} ${str.pegY}`}
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
              className={`w-full py-10 mb-4 rounded-2xl text-base font-black transition-all active:scale-[0.98] flex items-center justify-center gap-3 cursor-pointer shadow-md ${
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
          <div className="absolute inset-0 z-30 flex items-center justify-center p-4 bg-stone-950/80 backdrop-blur-md rounded-[28px] animate-fade-in">
            <div className="bg-[#18181a] border border-emerald-500/30 p-6 rounded-3xl max-w-[260px] w-full flex flex-col items-center justify-center text-center shadow-2xl animate-scale-up" onClick={(e) => e.stopPropagation()}>
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
                className="mt-5 px-6 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 active:scale-[0.98] text-stone-950 font-black text-[10px] uppercase tracking-wider transition-all cursor-pointer shadow-md shadow-emerald-500/20"
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
