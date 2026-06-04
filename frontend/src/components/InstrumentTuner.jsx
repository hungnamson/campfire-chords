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

// Autocorrelation algorithm for pitch detection with parabolic interpolation refinement
function autoCorrelate(buffer, sampleRate) {
  let SIZE = buffer.length;
  let rms = 0;

  for (let i = 0; i < SIZE; i++) {
    let val = buffer[i];
    rms += val * val;
  }
  rms = Math.sqrt(rms / SIZE);
  if (rms < 0.005) return -1; // Safe lower threshold for quiet inputs

  let c = new Float32Array(SIZE);
  for (let i = 0; i < SIZE; i++) {
    for (let j = 0; j < SIZE - i; j++) {
      c[i] = c[i] + buffer[j] * buffer[j + i];
    }
  }

  let d = 0;
  while (c[d] > c[d + 1]) d++;
  let maxval = -1, maxpos = -1;
  for (let i = d; i < SIZE; i++) {
    if (c[i] > maxval) {
      maxval = c[i];
      maxpos = i;
    }
  }
  let T0 = maxpos;

  // Parabolic interpolation for sub-sample refinement
  if (T0 > 0 && T0 < SIZE - 1) {
    let x1 = c[T0 - 1], x2 = c[T0], x3 = c[T0 + 1];
    let a = (x1 + x3 - 2 * x2) / 2;
    let b = (x3 - x1) / 2;
    if (a) T0 = T0 - b / (2 * a);
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

  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const audioStreamRef = useRef(null);
  const animationFrameRef = useRef(null);

  const oscillatorRef = useRef(null);
  const oscGainRef = useRef(null);

  // Sync selected instrument with default string
  useEffect(() => {
    setSelectedString(INSTRUMENT_TUNINGS[selectedInst].strings[0]);
    if (tunerMode === 'auto') {
      setDetectedString(INSTRUMENT_TUNINGS[selectedInst].strings[0]);
    }
  }, [selectedInst]);

  // Start tuner automatically when modal opens, and stop when closed/unmounted
  useEffect(() => {
    if (isOpen) {
      startTuner();
    } else {
      stopTuner();
      stopReferenceTone();
    }
    return () => {
      stopTuner();
      stopReferenceTone();
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
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      const audioCtx = audioCtxRef.current;
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
    try {
      setErrorMsg('');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;

      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      const audioCtx = audioCtxRef.current;
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      analyserRef.current = analyser;

      setIsListening(true);
      const bufferLength = analyser.fftSize;
      const dataArray = new Float32Array(bufferLength);

      const updatePitch = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getFloat32TimeDomainData(dataArray);

        const detectedFreq = autoCorrelate(dataArray, audioCtx.sampleRate);
        if (detectedFreq !== -1 && detectedFreq > 50 && detectedFreq < 600) {
          setFrequency(detectedFreq);

          let target = null;
          if (tunerMode === 'manual') {
            target = selectedString;
          } else {
            // Find closest target string frequency
            const currentStrings = INSTRUMENT_TUNINGS[selectedInst].strings;
            let closest = currentStrings[0];
            let minDist = Math.abs(detectedFreq - closest.freq);

            for (let i = 1; i < currentStrings.length; i++) {
              const dist = Math.abs(detectedFreq - currentStrings[i].freq);
              if (dist < minDist) {
                minDist = dist;
                closest = currentStrings[i];
              }
            }
            target = closest;
            setDetectedString(closest);
          }

          if (target) {
            const centsDev = 1200 * Math.log2(detectedFreq / target.freq);
            setCents(centsDev);
          }
        } else {
          // Clear active detected pitch when there is silence or no pitch, returning dial to center
          setFrequency(null);
          setCents(0);
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
    analyserRef.current = null;
    setIsListening(false);
    setFrequency(null);
    setCents(0);
  }

  function toggleListening() {
    if (isListening) {
      stopTuner();
    } else {
      startTuner();
    }
  }

  function handleClose() {
    stopTuner();
    stopReferenceTone();
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
                      transformOrigin: '150px 135px',
                      transition: 'transform 0.1s ease-out'
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
          <div className="pt-2">
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
          </div>
        </div>
      </div>
    </div>
  );
}
