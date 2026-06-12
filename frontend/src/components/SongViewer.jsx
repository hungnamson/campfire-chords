import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { Heart, ArrowLeft, Plus, Check, Minimize2, Maximize2, Info, ExternalLink, X, Share2, Printer, Link, Play, Square, Search, MoreVertical, ChevronDown, LayoutGrid, Pause } from 'lucide-react';
import { transposeChord, NOTE_TO_SEMITONE } from '../utils/transposer';
import ChordDiagram from './ChordDiagram';
import BrandLogo from './BrandLogo';

// Custom YouTube Icon Component
const Youtube = (props) => (
  <svg
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth="2"
    fill="none"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={props.className}
    style={props.style}
    {...props}
  >
    <path d="M22.54 6.42a2.78 2.78 0 0 0-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46a2.78 2.78 0 0 0-1.95 1.96A29 29 0 0 0 1 11.54a29 29 0 0 0 .46 5.12 2.78 2.78 0 0 0 1.95 1.96C5.12 19 12 19 12 19s6.88 0 8.59-.46a2.78 2.78 0 0 0 1.95-1.96 29 29 0 0 0 .46-5.12 29 29 0 0 0-.46-5.12z" />
    <polygon points="9.75 15.02 15.5 11.54 9.75 8.07 9.75 15.02" />
  </svg>
);

export default function SongViewer({ 
  song, 
  onBack, 
  onToggleFavorite, 
  playlists, 
  onAddSongToPlaylist, 
  transposeOffset, 
  setTransposeOffset,
  fontSize,
  setFontSize,
  isCompact,
  setIsCompact,
  instrument,
  onSaveToLibrary,
  isSavingToLibrary,
}) {
  const [isScrolling, setIsScrolling] = useState(false);
  const [scrollSpeed, setScrollSpeed] = useState(3); // 1 to 10
  const [activeChord, setActiveChord] = useState(null);
  const [showPlaylistMenu, setShowPlaylistMenu] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const trackFeatureUse = (featureName) => {
    fetch('/api/analytics/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'feature_use', featureName })
    }).catch(console.error);
  };
  const [popupPosition, setPopupPosition] = useState({ x: 0, y: 0 });
  const [showSongInfo, setShowSongInfo] = useState(false);
  const [showKeySelector, setShowKeySelector] = useState(false);
  const [keepScreenAwake, setKeepScreenAwake] = useState(true);
  const wakeLockRef = useRef(null);

  const [showMobileControls, setShowMobileControls] = useState(true);
  const hideControlsTimeoutRef = useRef(null);

  const triggerShowControls = () => {
    setShowMobileControls(true);
    if (hideControlsTimeoutRef.current) {
      clearTimeout(hideControlsTimeoutRef.current);
    }
    hideControlsTimeoutRef.current = setTimeout(() => {
      setShowMobileControls(false);
    }, 5000);
  };

  useEffect(() => {
    triggerShowControls();
    return () => {
      if (hideControlsTimeoutRef.current) {
        clearTimeout(hideControlsTimeoutRef.current);
      }
    };
  }, [song]);



  const scrollIntervalRef = useRef(null);
  const songContainerRef = useRef(null);
  const sheetRef = useRef(null);

  // Responsive dynamic layout states
  const [localFontSize, setLocalFontSize] = useState(fontSize);
  const [localIsCompact, setLocalIsCompact] = useState(isCompact);
  const [localColumns, setLocalColumns] = useState(1);
  const [windowSize, setWindowSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight
  });

  // Track window resizing for automatic fit recalculation
  useEffect(() => {
    let timeoutId;
    const handleResize = () => {
      // Debounce window size updates slightly to improve render performance during dragging
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        setWindowSize({
          width: window.innerWidth,
          height: window.innerHeight
        });
      }, 50);
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(timeoutId);
    };
  }, []);

  // Reset states when song changes
  useEffect(() => {
    setIsScrolling(false);
    setActiveChord(null);
    setShowSongInfo(false);
    setKeepScreenAwake(true);

  }, [song]);



  // Recalculate best fit layout
  const adjustLayout = () => {
    const sheet = sheetRef.current;
    if (!sheet) return;

    // Check sheet visibility and layout height
    const initialRect = sheet.getBoundingClientRect();
    if (initialRect.height === 0) return; // Skip measurement if content is not rendered yet

    // Detect if mobile layout (< 768px width)
    const isMobile = windowSize.width < 768;

    // Retrieve dynamically rendered bottom navigation height
    const bottomNav = document.querySelector('nav');
    const navHeight = bottomNav ? bottomNav.getBoundingClientRect().height : 80;

    // Get current top position of lyrics content card
    const rect = sheet.getBoundingClientRect();
    const topOffset = rect.top > 0 ? rect.top : (isMobile ? 60 : 75);

    // Calculate vertical space remaining inside viewport
    const bottomMargin = isMobile ? 24 : 48;
    const availableHeight = windowSize.height - topOffset - navHeight - bottomMargin;

    if (availableHeight <= 100) return;

    // Store original styles to restore after testing sizes
    const originalFontSize = sheet.style.fontSize;
    const originalColumnCount = sheet.style.columnCount;
    const originalTransition = sheet.style.transition;
    const originalClassName = sheet.className;

    // Turn off transitions during measurement loop to avoid flickering
    sheet.style.transition = 'none';

    let optimalFontSize = fontSize;
    let optimalColumns = 1;
    let optimalIsCompact = isCompact;

    // Helper to test layouts synchronously and return the actual layout height of the sheet
    const testLayout = (cols, size, compact = false) => {
      let className = 'song-lyrics-sheet select-text max-w-[96%] mx-auto w-full';
      if (cols === 2) className += ' song-lyrics-sheet-cols-2';
      else if (cols === 3) className += ' song-lyrics-sheet-cols-3';
      if (compact) className += ' song-lyrics-sheet-compact';
      
      sheet.className = className;
      sheet.style.columnCount = cols.toString();
      sheet.style.fontSize = `${size}px`;
      
      // Force a reflow and get the actual layout height (balanced) of the columns container
      return sheet.getBoundingClientRect().height;
    };

    // Helper to binary search for the largest font size (in steps of 0.25px) that fits within availableHeight
    const findOptimalSize = (cols, minSize, maxSize, compact = false) => {
      let low = Math.round(minSize * 4);
      let high = Math.round(maxSize * 4);
      let optimal = minSize;

      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const size = mid / 4;
        const height = testLayout(cols, size, compact);

        if (height <= availableHeight) {
          optimal = size;
          low = mid + 1; // Try to make it larger
        } else {
          high = mid - 1; // Need to make it smaller
        }
      }
      return optimal;
    };

    if (isMobile) {
      // Mobile Mode: 1 column, fit to screen size
      const minFontSize = 14.66; // 11 pt in pixels (1pt = 1.333px)
      let height = testLayout(1, fontSize, isCompact);

      if (height > availableHeight) {
        optimalFontSize = findOptimalSize(1, minFontSize, fontSize, isCompact);
      } else {
        optimalFontSize = fontSize;
      }
      optimalIsCompact = isCompact;
    } else {
      // Tablet & Desktop: try to fit screen respecting user's manual isCompact selection
      
      // First test 1 column at current base fontSize in the chosen mode
      let height1 = testLayout(1, fontSize, isCompact);

      if (height1 <= availableHeight) {
        // Fits in 1 column: scale up to fill screen (up to 50px)
        optimalFontSize = findOptimalSize(1, fontSize, 50, isCompact);
        optimalColumns = 1;
      } else {
        // Try 2 columns in the chosen mode
        let height2 = testLayout(2, fontSize, isCompact);

        if (height2 <= availableHeight) {
          // Fits in 2 columns: scale up to fill screen (up to 36px)
          optimalFontSize = findOptimalSize(2, fontSize, 36, isCompact);
          optimalColumns = 2;
        } else {
          // Doesn't fit in 2 columns: try to scale down font size down to min readable size
          const minSize = isCompact ? 14 : 16;
          let heightAtMin = testLayout(2, minSize, isCompact);
          if (heightAtMin <= availableHeight) {
            optimalFontSize = findOptimalSize(2, minSize, fontSize, isCompact);
            optimalColumns = 2;
          } else {
            // Keep it at minimum size and let it scroll
            optimalFontSize = minSize;
            optimalColumns = 2;
          }
        }
      }
      optimalIsCompact = isCompact;
    }

    // Restore original manual styles so React controls layout
    sheet.className = originalClassName;
    sheet.style.fontSize = originalFontSize;
    sheet.style.columnCount = originalColumnCount;
    sheet.style.transition = originalTransition;

    setLocalFontSize(optimalFontSize);
    setLocalColumns(optimalColumns);
    setLocalIsCompact(optimalIsCompact);
  };

  // Trigger fitting in layout phase (runs synchronously on resize, font size changes, etc.)
  useLayoutEffect(() => {
    adjustLayout();
  }, [song, fontSize, isCompact, windowSize, instrument, transposeOffset]);

  // Trigger fitting after mount/paint to guarantee stable measurements (runs only on new song load)
  useEffect(() => {
    adjustLayout();
    const handle = requestAnimationFrame(adjustLayout);
    const timeoutId = setTimeout(adjustLayout, 150);
    return () => {
      cancelAnimationFrame(handle);
      clearTimeout(timeoutId);
    };
  }, [song]);

  // Dynamically calculate recommended singer tones based on the original key
  const getSingerTones = (keyStr) => {
    if (!keyStr) return null;
    try {
      const maleLow = transposeChord(keyStr, -7);
      const maleMed = transposeChord(keyStr, -5);
      const maleHigh = transposeChord(keyStr, -3);
      
      const femaleLow = transposeChord(keyStr, -2);
      const femaleMed = transposeChord(keyStr, 0);
      const femaleHigh = transposeChord(keyStr, 2);

      return {
        male: `${maleLow} / ${maleMed} / ${maleHigh}`,
        female: `${femaleLow} / ${femaleMed} / ${femaleHigh}`
      };
    } catch {
      return {
        male: 'Chưa xác định',
        female: 'Chưa xác định'
      };
    }
  };

  // Handle Autoscroll animation
  useEffect(() => {
    if (isScrolling) {
      const step = 0.5; // pixel per frame
      const intervalMs = Math.max(10, 100 - (scrollSpeed * 9));

      const scrollFn = () => {
        if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight) {
          setIsScrolling(false);
          return;
        }
        window.scrollBy(0, step);
      };

      scrollIntervalRef.current = setInterval(scrollFn, intervalMs);
    } else {
      if (scrollIntervalRef.current) {
        clearInterval(scrollIntervalRef.current);
      }
    }

    return () => {
      if (scrollIntervalRef.current) {
        clearInterval(scrollIntervalRef.current);
      }
    };
  }, [isScrolling, scrollSpeed]);

  // Prevent screen from dimming/sleeping while viewing song
  useEffect(() => {
    let active = true;
    let clickListenerActive = false;

    const requestWakeLock = async () => {
      if (!keepScreenAwake || !('wakeLock' in navigator)) return;
      try {
        if (wakeLockRef.current) {
          await wakeLockRef.current.release();
          wakeLockRef.current = null;
        }
        wakeLockRef.current = await navigator.wakeLock.request('screen');
        console.log('Screen Wake Lock acquired successfully.');
        
        // Remove gesture listeners once successfully acquired
        if (clickListenerActive) {
          document.removeEventListener('click', handleUserInteraction);
          document.removeEventListener('touchstart', handleUserInteraction);
          clickListenerActive = false;
        }
      } catch (err) {
        console.warn('Failed to acquire Screen Wake Lock:', err);
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
          console.log('Screen Wake Lock released.');
        } catch (err) {
          console.warn('Failed to release Screen Wake Lock:', err);
        }
      }
    };

    // Try to acquire immediately (for browsers that support it without gesture)
    requestWakeLock();

    // Set up gesture listeners for browsers (like iOS Safari) that require interaction
    if (keepScreenAwake && !wakeLockRef.current) {
      document.addEventListener('click', handleUserInteraction);
      document.addEventListener('touchstart', handleUserInteraction);
      clickListenerActive = true;
    }

    // Re-request wake lock when screen becomes visible again
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && keepScreenAwake && active) {
        await requestWakeLock();
        if (!wakeLockRef.current && !clickListenerActive) {
          document.addEventListener('click', handleUserInteraction);
          document.addEventListener('touchstart', handleUserInteraction);
          clickListenerActive = true;
        }
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
  }, [keepScreenAwake, song]);

  // Parse ChordPro line into text chunks and chords for inline rendering
  function parseLine(line) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      return { isEmpty: true };
    }

    // Identify headings, comments, or annotations
    const isComment = (trimmed.startsWith('[') && trimmed.endsWith(']') && !/^[A-G]/i.test(trimmed.slice(1, -1))) ||
                      (trimmed.endsWith(':') && trimmed.length < 25) ||
                      trimmed.toLowerCase().startsWith('intro') ||
                      trimmed.toLowerCase().startsWith('outro') ||
                      trimmed.toLowerCase().startsWith('đk') ||
                      trimmed.toLowerCase().startsWith('chorus') ||
                      trimmed.toLowerCase().startsWith('capo');

    if (isComment) {
      return { isComment: true, text: line };
    }

    // Split line by chord brackets
    const parts = line.split(/\[([^\]]+)\]/);
    const hasChords = parts.length > 1;

    // In compact mode, hide lines that contain no chords
    if (isCompact && !hasChords) {
      return { isEmpty: true };
    }

    const chunks = [];

    if (isCompact) {
      const getLastWord = (text) => {
        const t = text.trim();
        if (!t) return '';
        const words = t.split(/\s+/).filter(Boolean);
        return words[words.length - 1] || '';
      };

      const getFirstWord = (text) => {
        const t = text.trim();
        if (!t) return '';
        const words = t.split(/\s+/).filter(Boolean);
        return words[0] || '';
      };

      // Keep only last word of the segment before the first chord
      const firstText = parts[0] || '';
      const prevWord = getLastWord(firstText);
      chunks.push({ chord: '', text: prevWord });

      for (let j = 1; j < parts.length; j += 2) {
        const chordVal = parts[j];
        const followingText = parts[j + 1] || '';
        
        let textVal = '';
        if (followingText.trim().length > 0) {
          const words = followingText.trim().split(/\s+/).filter(Boolean);
          if (words.length <= 2) {
            textVal = words.join(' ');
          } else {
            const isLastChord = j === parts.length - 2;
            if (isLastChord) {
              textVal = words[0];
            } else {
              textVal = `${words[0]}...${words[words.length - 1]}`;
            }
          }
        }

        if (!/^[A-G]/i.test(chordVal.trim())) {
          chunks.push({ chord: '', text: `[${chordVal}]${textVal}` });
        } else {
          const transposed = transposeChord(chordVal.trim(), transposeOffset);
          chunks.push({ chord: transposed, text: textVal });
        }
      }
    } else {
      // Standard Mode: Keep all text and chords
      chunks.push({ chord: '', text: parts[0] || '' });
      for (let j = 1; j < parts.length; j += 2) {
        const chordVal = parts[j];
        const textVal = parts[j + 1] || '';
        if (!/^[A-G]/i.test(chordVal.trim())) {
          chunks.push({ chord: '', text: `[${chordVal}]${textVal}` });
        } else {
          const transposed = transposeChord(chordVal.trim(), transposeOffset);
          chunks.push({ chord: transposed, text: textVal });
        }
      }
    }

    return { isComment: false, chunks };
  }

  const lines = song.chordPro.split('\n');

  // Handle chord diagram popup triggers
  const handleChordClick = (chord, e) => {
    e.stopPropagation();
    if (activeChord === chord) {
      setActiveChord(null);
    } else {
      const rect = e.currentTarget.getBoundingClientRect();
      setPopupPosition({
        x: rect.left + rect.width / 2,
        y: rect.bottom
      });
      setActiveChord(chord);
    }
  };

  // Close chord popup when clicking anywhere else or scrolling
  useEffect(() => {
    const handleClose = (e) => {
      // Don't close if clicking directly on a chord trigger
      if (e.target.closest('.chord-inline')) return;
      setActiveChord(null);
    };
    window.addEventListener('click', handleClose);
    window.addEventListener('scroll', handleClose);
    window.addEventListener('touchstart', handleClose);
    return () => {
      window.removeEventListener('click', handleClose);
      window.removeEventListener('scroll', handleClose);
      window.removeEventListener('touchstart', handleClose);
    };
  }, []);

  const isMobile = windowSize.width < 768;

  const cleanArtist = (song.artist && song.artist.trim() !== '0-9' && song.artist.toLowerCase().trim() !== 'khuyết danh') ? song.artist.trim() : '';
  const cleanComposer = (song.composer && song.composer.trim() !== '0-9' && song.composer.toLowerCase().trim() !== 'khuyết danh') ? song.composer.trim() : '';
  
  const displayMeta = (() => {
    if (cleanArtist && cleanComposer) {
      if (cleanArtist.toLowerCase() === cleanComposer.toLowerCase()) {
        return cleanArtist;
      }
      return `${cleanArtist} • Sáng tác: ${cleanComposer}`;
    }
    return cleanArtist || cleanComposer || '';
  })();

  // State for rhythm style list popover and play state
  const [showRhythmMenu, setShowRhythmMenu] = useState(false);
  const [currentRhythm, setCurrentRhythm] = useState(song.rhythm || '');
  const [playingStyle, setPlayingStyle] = useState(null); // name of style currently playing
  const [showBpmSelector, setShowBpmSelector] = useState(null); // Name of style showing BPM options

  // Audio Context and Scheduling refs
  const audioContextRef = useRef(null);
  const schedulerIntervalRef = useRef(null);
  const nextNoteTimeRef = useRef(0);
  const beatIndexRef = useRef(0);
  const audioPlayerRef = useRef(null); // Ref to HTML5 Audio Element for Slow Rock

  // List of drum styles
  const [DRUM_STYLES, setDrumStyles] = useState([
    { name: 'Slow / Slow Rock', bpm: 60, audioFile: 'slowrock_60bpm.m4a', originalBpm: 60 },
    { name: 'Bolero / Rhumba', bpm: 80, audioFile: 'Bolero_80bpm.m4a', originalBpm: 80 },
    { name: 'Tango', bpm: 80, audioFile: 'Tango_80bpm.m4a', originalBpm: 80 },
    { name: 'Chachacha', bpm: 80, audioFile: 'Chachacha_80bpm.m4a', originalBpm: 80 },
    { name: 'Ballad', bpm: 65, audioFile: 'Ballad_65bpm.m4a', originalBpm: 65 },
    { name: 'Disco', bpm: 120, audioFile: 'Disco_120bpm.m4a', originalBpm: 120 },
    { name: 'Waltz & 3/4', bpm: 80, audioFile: 'Waltz_80bpm.m4a', originalBpm: 80 }
  ]);

  // Helper sound synthesis functions using Web Audio API
  const playKick = (ctx, time) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.3);
    
    gain.gain.setValueAtTime(1, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.3);

    osc.start(time);
    osc.stop(time + 0.3);
  };

  const playSnare = (ctx, time) => {
    // White noise generator
    const bufferSize = ctx.sampleRate * 0.2;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'highpass';
    noiseFilter.frequency.value = 1000;

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.3, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, time + 0.2);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(ctx.destination);

    // Tone oscillator
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = 'triangle';
    osc.connect(oscGain);
    oscGain.connect(ctx.destination);

    osc.frequency.setValueAtTime(180, time);
    oscGain.gain.setValueAtTime(0.5, time);
    oscGain.gain.exponentialRampToValueAtTime(0.01, time + 0.1);

    noise.start(time);
    noise.stop(time + 0.2);
    osc.start(time);
    osc.stop(time + 0.1);
  };

  const playHat = (ctx, time, accent = false) => {
    const bufferSize = ctx.sampleRate * 0.05;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 10000;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(accent ? 0.2 : 0.08, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.05);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    noise.start(time);
    noise.stop(time + 0.05);
  };

  // Main scheduler that executes beat triggers based on selected style patterns
  const scheduleNextBeats = () => {
    if (!audioContextRef.current) return;
    const ctx = audioContextRef.current;
    
    // Look ahead 100ms
    while (nextNoteTimeRef.current < ctx.currentTime + 0.1) {
      const styleObj = DRUM_STYLES.find(s => s.name === playingStyle);
      if (!styleObj) break;

      const time = nextNoteTimeRef.current;
      const beat = beatIndexRef.current;

      // Handle custom rhythmic styles
      if (playingStyle === 'Boston' || playingStyle === 'Valse') {
        // 3/4 styles: 6 steps (eighth notes)
        // Kick on 1, Snare on 3 & 5 (or 2 & 3 in quarter notes)
        const isKick = beat === 0;
        const isSnare = beat === 2 || beat === 4;
        const isHat = beat % 2 === 0;

        if (isKick) playKick(ctx, time);
        if (isSnare) playSnare(ctx, time);
        if (isHat) playHat(ctx, time, beat === 0);

        const stepDuration = 60 / styleObj.bpm / 2; // eighth notes
        nextNoteTimeRef.current += stepDuration;
        beatIndexRef.current = (beat + 1) % 6;
      } 
      else if (playingStyle === 'Disco') {
        // 4/4 Disco: Four-on-the-floor kick, Snare on 2 & 4, off-beat open-ish hats
        // 8 steps (eighth notes)
        const isKick = beat % 2 === 0;
        const isSnare = beat === 2 || beat === 6;
        const isHat = beat % 2 !== 0; // Offbeat hat

        if (isKick) playKick(ctx, time);
        if (isSnare) playSnare(ctx, time);
        if (isHat) playHat(ctx, time, true);

        const stepDuration = 60 / styleObj.bpm / 2;
        nextNoteTimeRef.current += stepDuration;
        beatIndexRef.current = (beat + 1) % 8;
      }
      else if (playingStyle === 'Bolero') {
        // 4/4 Bolero: Complex Latin pattern
        // 8 steps (eighth notes)
        // Kick on 1, 3, 5, 7. Snare on 3, 4, 7, 8
        const isKick = beat === 0 || beat === 4;
        const isSnare = beat === 2 || beat === 3 || beat === 6 || beat === 7;
        const isHat = beat % 2 === 0;

        if (isKick) playKick(ctx, time);
        if (isSnare) playSnare(ctx, time);
        if (isHat) playHat(ctx, time, beat === 0);

        const stepDuration = 60 / styleObj.bpm / 2;
        nextNoteTimeRef.current += stepDuration;
        beatIndexRef.current = (beat + 1) % 8;
      }
      else if (playingStyle === 'Rhumba') {
        // 4/4 Rhumba / Bossa rhythmic feel
        const isKick = beat === 0 || beat === 3 || beat === 6;
        const isSnare = beat === 2 || beat === 4 || beat === 7;
        const isHat = true;

        if (isKick) playKick(ctx, time);
        if (isSnare) playSnare(ctx, time);
        if (isHat) playHat(ctx, time, beat % 2 === 0);

        const stepDuration = 60 / styleObj.bpm / 2;
        nextNoteTimeRef.current += stepDuration;
        beatIndexRef.current = (beat + 1) % 8;
      }
      else if (playingStyle === 'Chachacha') {
        // 4/4 Cha Cha Cha: Kick on 1, 2, 3, 4; Snare roll on double steps
        const isKick = beat % 2 === 0;
        const isSnare = beat === 2 || beat === 6 || beat === 7;
        const isHat = true;

        if (isKick) playKick(ctx, time);
        if (isSnare) playSnare(ctx, time);
        if (isHat) playHat(ctx, time, beat % 2 === 0);

        const stepDuration = 60 / styleObj.bpm / 2;
        nextNoteTimeRef.current += stepDuration;
        beatIndexRef.current = (beat + 1) % 8;
      }
      else {
        // Standard 4/4 Ballad: Kick on 1 & 3, Snare on 2 & 4, Hats on all 8ths
        // 8 steps (eighth notes)
        const isKick = beat === 0 || beat === 4;
        const isSnare = beat === 2 || beat === 6;
        const isHat = true;

        if (isKick) playKick(ctx, time);
        if (isSnare) playSnare(ctx, time);
        if (isHat) playHat(ctx, time, beat % 4 === 0);

        const stepDuration = 60 / styleObj.bpm / 2; // eighth notes
        nextNoteTimeRef.current += stepDuration;
        beatIndexRef.current = (beat + 1) % 8;
      }
    }
  };

  const startBeat = (styleName) => {
    stopBeat();

    const styleObj = DRUM_STYLES.find(s => s.name === styleName);
    if (!styleObj) return;

    if (styleObj.audioFile) {
      // Create persistent audio element if not exists
      if (!audioPlayerRef.current) {
        audioPlayerRef.current = new Audio();
      } else {
        audioPlayerRef.current.pause();
      }
      
      audioPlayerRef.current.src = `/assets/audio/${styleObj.audioFile}`;
      audioPlayerRef.current.load();
      audioPlayerRef.current.loop = true;
      
      const targetPlaybackRate = styleObj.bpm / styleObj.originalBpm;
      
      // Safari requires metadata to be loaded or play promise to resolve before setting playbackRate
      const applyPlaybackRate = () => {
        if (audioPlayerRef.current) {
          audioPlayerRef.current.playbackRate = targetPlaybackRate;
        }
      };
      
      audioPlayerRef.current.addEventListener('canplay', applyPlaybackRate, { once: true });
      audioPlayerRef.current.addEventListener('loadedmetadata', applyPlaybackRate, { once: true });
      
      audioPlayerRef.current.play()
        .then(() => {
          applyPlaybackRate();
        })
        .catch(err => {
          console.log('Audio play failed:', err);
        });
      
      // Set immediately as fallback
      audioPlayerRef.current.playbackRate = targetPlaybackRate;
      setPlayingStyle(styleName);
    } else {
      // Fallback for synthesizers (e.g. Boston style)
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      setPlayingStyle(styleName);
      nextNoteTimeRef.current = ctx.currentTime + 0.05;
      beatIndexRef.current = 0;

      // Run scheduler loop every 25ms
      schedulerIntervalRef.current = setInterval(scheduleNextBeats, 25);
    }
  };

  const stopBeat = () => {
    if (schedulerIntervalRef.current) {
      clearInterval(schedulerIntervalRef.current);
      schedulerIntervalRef.current = null;
    }
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current.currentTime = 0;
    }
    setPlayingStyle(null);
  };

  // Clean up Web Audio resources on unmount
  useEffect(() => {
    return () => {
      if (schedulerIntervalRef.current) {
        clearInterval(schedulerIntervalRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
      }
    };
  }, []);

  // Close rhythm menu popover on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      const isInsideBtnOrMenu = e.target.closest('.rhythm-menu-container') || e.target.closest('.rhythm-trigger-button');
      if (!isInsideBtnOrMenu) {
        setShowRhythmMenu(false);
        setShowBpmSelector(null);
      }
    };
    if (showRhythmMenu) {
      window.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('touchstart', handleClickOutside);
    };
  }, [showRhythmMenu]);

  // Update current style selection state if the song updates
  useEffect(() => {
    const matchingStyle = DRUM_STYLES.find(s => 
      s.name.toLowerCase().includes((song.rhythm || '').toLowerCase()) || 
      (song.rhythm || '').toLowerCase().includes(s.name.toLowerCase())
    );
    setCurrentRhythm(matchingStyle ? matchingStyle.name : (song.rhythm || ''));
    stopBeat();
  }, [song]);

  return (
    <div 
      onClick={(e) => {
        e.stopPropagation();
        triggerShowControls();
      }}
      onTouchStart={triggerShowControls}
      className="song-viewer-container flex flex-col min-h-screen text-stone-900 bg-stone-100 md:bg-white pb-28 animate-fade-in w-full md:max-w-[96vw] self-center mx-auto md:shadow-lg md:border-x md:border-stone-200/80 cursor-default relative" 
      ref={songContainerRef}
    >
      {/* Header bar */}
      {isMobile ? (
        <header className="sticky top-0 z-30 bg-[#FFFBF6]/95 backdrop-blur border-b border-stone-200/60 flex items-center justify-between px-4 py-3 shadow-none">
          <div className="flex items-center gap-3">
            <button 
              onClick={onBack}
              className="p-1.5 hover:bg-stone-200/50 rounded-full transition text-stone-700 active:scale-95 shrink-0 animate-fade-in"
            >
              <ArrowLeft className="w-6 h-6 text-[#4B2E20]" />
            </button>
            <h1 className="font-bold text-[#4B2E20] text-lg select-none truncate max-w-[180px] xs:max-w-xs">{song.title}</h1>
          </div>
          
          <div className="flex items-center gap-3 shrink-0">
            {/* Search Trigger Button */}
            <button
              onClick={() => {
                onBack();
                // Trigger focus search input
                setTimeout(() => {
                  const searchInput = document.querySelector('input[type="text"]') || document.getElementById('search-input');
                  if (searchInput) searchInput.focus();
                }, 150);
              }}
              className="p-1.5 rounded-full hover:bg-stone-100 text-[#4B2E20] active:scale-95 transition"
            >
              <Search className="w-5 h-5" />
            </button>

            {/* Favorite Button */}
            {!song.isOnline && (
              <button
                onClick={() => onToggleFavorite(song.id)}
                className={`p-1.5 rounded-full hover:bg-stone-100 transition active:scale-95 ${
                  song.isFavorite ? 'text-red-500' : 'text-[#4B2E20]'
                }`}
              >
                <Heart className="w-5 h-5" fill={song.isFavorite ? "currentColor" : "none"} />
              </button>
            )}

            {/* Setlist Button (Plus) */}
            {!song.isOnline && (
              <div className="relative">
                <button
                  onClick={() => setShowPlaylistMenu(!showPlaylistMenu)}
                  className="p-1.5 rounded-full hover:bg-stone-100 text-[#4B2E20] active:scale-95 transition"
                >
                  <Plus className="w-5 h-5" />
                </button>
                {showPlaylistMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowPlaylistMenu(false)}></div>
                    <div className="absolute right-0 mt-2 w-48 bg-white border border-stone-200 rounded-xl shadow-2xl z-50 p-2 text-left">
                      <p className="text-[10px] uppercase font-bold tracking-wider text-stone-400 p-2">Add to setlist</p>
                      {playlists.length === 0 ? (
                        <p className="text-xs text-stone-400 p-2 italic">No setlists created</p>
                      ) : (
                        playlists.map(pl => {
                          const hasSong = pl.songIds.includes(song.id);
                          return (
                            <button
                              key={pl.id}
                              onClick={() => {
                                onAddSongToPlaylist(pl.id, song.id);
                                setShowPlaylistMenu(false);
                              }}
                              className="w-full flex items-center justify-between p-2.5 hover:bg-stone-50 text-xs rounded-lg transition-colors text-stone-700"
                            >
                              <span>{pl.name}</span>
                              {hasSong && <Check className="w-3.5 h-3.5 text-green-600" />}
                            </button>
                          );
                        })
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* More Options Button (MoreVertical) */}
            <div className="relative">
              <button
                onClick={() => setShowShareMenu(!showShareMenu)}
                className="p-1.5 rounded-full hover:bg-stone-100 text-[#4B2E20] active:scale-95 transition"
              >
                <MoreVertical className="w-5 h-5" />
              </button>
              {showShareMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowShareMenu(false)}></div>
                  <div className="absolute right-0 mt-2 w-48 bg-white border border-stone-200 rounded-xl shadow-2xl z-50 p-2 text-left">
                    <button
                      onClick={() => {
                        setShowShareMenu(false);
                        setShowSongInfo(true);
                      }}
                      className="w-full flex items-center gap-2.5 p-2.5 hover:bg-stone-50 text-xs rounded-lg text-stone-700 transition-colors"
                    >
                      <Info className="w-4 h-4 text-stone-500" />
                      <span>Thông tin bài hát (Info)</span>
                    </button>
                    {navigator.share && (
                      <button
                        onClick={async () => {
                          setShowShareMenu(false);
                          trackFeatureUse('share');
                          try {
                            await navigator.share({
                              title: song.title,
                              text: `Hợp âm bài hát: ${song.title} - ${song.artist || ''}`,
                              url: window.location.origin + '?song=' + song.id
                            });
                          } catch (err) {
                            console.log('Share canceled/failed:', err);
                          }
                        }}
                        className="w-full flex items-center gap-2.5 p-2.5 hover:bg-stone-50 text-xs rounded-lg text-stone-700 transition-colors"
                      >
                        <Share2 className="w-4 h-4 text-stone-500" />
                        <span>Chia sẻ...</span>
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setShowShareMenu(false);
                        trackFeatureUse('print');
                        window.print();
                      }}
                      className="w-full flex items-center gap-2.5 p-2.5 hover:bg-stone-50 text-xs rounded-lg text-stone-700 transition-colors"
                    >
                      <Printer className="w-4 h-4 text-stone-500" />
                      <span>In bản nhạc (Print)</span>
                    </button>
                    <button
                      onClick={async () => {
                        setShowShareMenu(false);
                        trackFeatureUse('share');
                        const shareUrl = window.location.origin + '?song=' + song.id;
                        try {
                          await navigator.clipboard.writeText(shareUrl);
                          alert('Đã sao chép liên kết vào bộ nhớ tạm!');
                        } catch (err) {
                          console.error('Failed to copy text: ', err);
                        }
                      }}
                      className="w-full flex items-center gap-2.5 p-2.5 hover:bg-stone-50 text-xs rounded-lg text-stone-700 transition-colors"
                    >
                      <Link className="w-4 h-4 text-stone-500" />
                      <span>Sao chép liên kết</span>
                    </button>
                    <button
                      onClick={() => {
                        setShowShareMenu(false);
                        window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(song.title + ' ' + song.artist)}`, '_blank');
                      }}
                      className="w-full flex items-center gap-2.5 p-2.5 hover:bg-stone-50 text-xs rounded-lg text-stone-700 transition-colors"
                    >
                      <Youtube className="w-4 h-4 text-red-500" />
                      <span>Tìm trên YouTube</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>
      ) : (
        <header className={`sticky top-0 z-30 bg-[#f5f3ef]/90 backdrop-blur border-b border-stone-200 flex items-center justify-between shadow-sm transition-all duration-200 ${
          localIsCompact ? 'px-3 py-1' : 'py-2 song-viewer-padding-x'
        }`}>
          <div className="flex items-center gap-2">
            <button 
              onClick={onBack}
              className="p-2 hover:bg-stone-200 rounded-full transition-colors text-stone-600 hover:text-stone-900 shrink-0"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h1 className={`font-bold text-stone-900 truncate max-w-[100px] xs:max-w-[150px] sm:max-w-xs transition-all duration-200 ${
                  localIsCompact ? 'text-sm' : 'text-base'
                }`}>{song.title}</h1>
                {song.isOnline && (
                  <span className="shrink-0 px-1.5 py-0.5 bg-blue-50 text-blue-600 border border-blue-200 rounded text-[9px] font-black uppercase tracking-wider select-none animate-pulse">
                    Online
                  </span>
                )}
              </div>
              {displayMeta && (
                <p className={`text-stone-500 truncate max-w-[100px] xs:max-w-[150px] sm:max-w-xs transition-all duration-205 ${
                  localIsCompact ? 'text-[10px]' : 'text-xs'
                }`}>
                  {displayMeta}
                </p>
              )}
            </div>
          </div>

          {/* Dropdown Rhythm Button and Popover list */}
          <div className="relative flex items-center justify-center mx-2 shrink-0">
            <button
              onClick={() => setShowRhythmMenu(!showRhythmMenu)}
              className="rhythm-trigger-button px-2.5 py-1.5 bg-stone-200/60 hover:bg-stone-200 border border-stone-300/60 rounded-full text-[10px] font-black text-stone-600 uppercase tracking-wider select-none cursor-pointer flex items-center gap-1 transition-all duration-150 active:scale-95 shadow-sm"
            >
              <span>{currentRhythm.trim() || 'SELECT STYLE'}</span>
              {playingStyle && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>}
            </button>

             {showRhythmMenu && (
               <div className="rhythm-menu-container absolute left-1/2 -translate-x-1/2 mt-2 w-80 bg-white border border-stone-200 rounded-xl shadow-2xl z-50 p-2.5 text-left top-full max-h-96 overflow-y-auto">
                 <p className="text-[11px] uppercase font-black tracking-wider text-stone-400 p-2 border-b border-stone-100 flex items-center justify-between">
                   <span>Drum Styles</span>
                   {playingStyle && (
                     <button 
                       onClick={(e) => { e.stopPropagation(); stopBeat(); }} 
                       className="text-red-500 hover:text-red-700 font-bold text-xs"
                     >
                       Dừng
                     </button>
                   )}
                 </p>
                 <div className="space-y-1.5 mt-2">
                   {DRUM_STYLES.map(style => {
                     const isStylePlaying = playingStyle === style.name;
                     return (
                       <div key={style.name} className="relative">
                         <div 
                           onClick={() => {
                             setCurrentRhythm(style.name);
                             setShowRhythmMenu(false);
                             setShowBpmSelector(null);
                           }}
                           className={`w-full flex items-center justify-between py-4.5 px-3.5 hover:bg-stone-50 text-sm rounded-lg transition-colors cursor-pointer text-stone-700 ${
                             currentRhythm === style.name ? 'bg-stone-100/70 font-semibold' : ''
                           }`}
                         >
                           <div className="flex items-center gap-3">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (isStylePlaying) {
                                    stopBeat();
                                  } else {
                                    startBeat(style.name);
                                  }
                                }}
                                className={`p-3 rounded-full transition-all active:scale-90 ${
                                  isStylePlaying 
                                    ? 'bg-red-500 text-white shadow-sm' 
                                    : 'bg-stone-100 hover:bg-stone-200 text-stone-600'
                                }`}
                              >
                                {isStylePlaying ? (
                                  <Pause className="w-8 h-8 fill-white" />
                                ) : (
                                  <Play className="w-8 h-8 fill-stone-600 text-stone-600" />
                                )}
                              </button>
                              <span className="font-semibold text-stone-800 text-base">{style.name}</span>
                           </div>
                           
                           {/* BPM Selector Trigger Badge */}
                           <button
                             onClick={(e) => {
                               e.stopPropagation();
                               setShowBpmSelector(showBpmSelector === style.name ? null : style.name);
                             }}
                             className="font-mono text-xs font-bold text-stone-500 bg-stone-100 hover:bg-stone-200 border border-stone-200/85 px-3 py-1.5 rounded-full transition-colors active:scale-95 shrink-0"
                           >
                             {style.bpm} BPM
                           </button>
                         </div>

                         {/* Incremental Speed List Popover (Bigger targets) */}
                         {showBpmSelector === style.name && (
                           <div className="absolute right-0 top-full mt-1.5 w-32 bg-white border border-stone-200 rounded-lg shadow-xl z-55 max-h-48 overflow-y-auto p-1.5 border border-stone-200/90 divide-y divide-stone-100">
                             {Array.from({ length: 21 }, (_, idx) => 40 + idx * 5).map(bpmVal => (
                               <button
                                 key={bpmVal}
                                 onClick={(e) => {
                                   e.stopPropagation();
                                   // Update BPM for the selected style
                                   setDrumStyles(prev => prev.map(s => s.name === style.name ? { ...s, bpm: bpmVal } : s));
                                   setShowBpmSelector(null);
                                   
                                   // Update playing audio speed on the fly if active
                                   if (isStylePlaying) {
                                     if (style.audioFile && audioPlayerRef.current) {
                                       audioPlayerRef.current.playbackRate = bpmVal / style.originalBpm;
                                     }
                                   }
                                 }}
                                 className={`w-full text-left px-3.5 py-3 text-xs font-medium hover:bg-stone-100 transition-colors ${
                                   style.bpm === bpmVal ? 'text-emerald-600 font-bold bg-emerald-50/50' : 'text-stone-700'
                                 }`}
                               >
                                 {bpmVal} BPM
                               </button>
                             ))}
                           </div>
                         )}
                       </div>
                     );
                   })}
                 </div>
               </div>
             )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* YouTube Search Button */}
            <button
              onClick={() => {
                window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(song.title + ' ' + song.artist)}`, '_blank');
              }}
              className="p-1.5 rounded-full hover:bg-red-50 text-stone-400 hover:text-red-600 transition-colors"
              title="Search on YouTube"
            >
              <Youtube className="w-4.5 h-4.5" />
            </button>

            {/* Share/Print Menu Trigger */}
            <div className="relative">
              <button
                onClick={() => setShowShareMenu(!showShareMenu)}
                className="p-1.5 rounded-full hover:bg-stone-200 text-stone-400 hover:text-stone-700 transition-colors"
                title="Share or Print"
              >
                <Share2 className="w-4.5 h-4.5" />
              </button>
              {showShareMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowShareMenu(false)}></div>
                  <div className="absolute right-0 mt-2 w-48 bg-white border border-stone-200 rounded-lg shadow-xl z-50 p-1.5 text-left">
                    {navigator.share && (
                      <button
                        onClick={async () => {
                          setShowShareMenu(false);
                          trackFeatureUse('share');
                          try {
                            await navigator.share({
                              title: song.title,
                              text: `Hợp âm bài hát: ${song.title} - ${song.artist || ''}`,
                              url: window.location.origin + '?song=' + song.id
                            });
                          } catch (err) {
                            console.log('Share canceled/failed:', err);
                          }
                        }}
                        className="w-full flex items-center gap-2 p-2 hover:bg-stone-50 text-xs rounded text-stone-700 transition-colors"
                      >
                        <Share2 className="w-3.5 h-3.5 text-stone-500" />
                        <span>Chia sẻ ứng dụng...</span>
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setShowShareMenu(false);
                        trackFeatureUse('print');
                        window.print();
                      }}
                      className="w-full flex items-center gap-2 p-2 hover:bg-stone-50 text-xs rounded text-stone-700 transition-colors"
                    >
                      <Printer className="w-3.5 h-3.5 text-stone-500" />
                      <span>In bản nhạc (Print)</span>
                    </button>
                    <button
                      onClick={async () => {
                        setShowShareMenu(false);
                        trackFeatureUse('share');
                        const shareUrl = window.location.origin + '?song=' + song.id;
                        try {
                          await navigator.clipboard.writeText(shareUrl);
                          alert('Đã sao chép liên kết vào bộ nhớ tạm!');
                        } catch (err) {
                          console.error('Failed to copy text: ', err);
                        }
                      }}
                      className="w-full flex items-center gap-2 p-2 hover:bg-stone-50 text-xs rounded text-stone-700 transition-colors"
                    >
                      <Link className="w-3.5 h-3.5 text-stone-500" />
                      <span>Sao chép liên kết</span>
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Song Info Button */}
            <button
              onClick={() => setShowSongInfo(true)}
              className="p-1.5 rounded-full hover:bg-stone-200 text-stone-400 hover:text-stone-700 transition-colors animate-fade-in"
              title="Song Info"
            >
              <Info className="w-4.5 h-4.5" />
            </button>

            {/* Favorite Button */}
            {!song.isOnline && (
              <button
                onClick={() => onToggleFavorite(song.id)}
                className={`p-1.5 rounded-full hover:bg-stone-200 transition-colors ${
                  song.isFavorite ? 'text-red-600' : 'text-stone-400 hover:text-stone-800'
                }`}
              >
                <Heart className="w-4.5 h-4.5" fill={song.isFavorite ? "currentColor" : "none"} />
              </button>
            )}

            {/* Add to Playlist / Save to Library Button */}
            {song.isOnline ? (
              <button
                onClick={() => onSaveToLibrary(song)}
                disabled={isSavingToLibrary}
                className={`px-2.5 py-1.5 rounded text-xs font-bold flex items-center gap-1 transition-all text-white shadow-sm active:scale-95 ${
                  isSavingToLibrary 
                    ? 'bg-blue-400 cursor-not-allowed' 
                    : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700'
                }`}
              >
                {isSavingToLibrary ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Đang lưu...
                  </>
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5" /> Lưu thư viện
                  </>
                )}
              </button>
            ) : (
              <div className="relative">
                <button
                  onClick={() => setShowPlaylistMenu(!showPlaylistMenu)}
                  className="px-2.5 py-1.5 bg-stone-200 hover:bg-stone-300 active:scale-95 rounded text-xs font-semibold flex items-center gap-1 transition-all text-stone-700"
                >
                  <Plus className="w-3.5 h-3.5" /> Setlist
                </button>
                
                {showPlaylistMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowPlaylistMenu(false)}></div>
                    <div className="absolute right-0 mt-2 w-48 bg-white border border-stone-200 rounded shadow-2xl z-50 p-2 text-left">
                      <p className="text-[10px] uppercase font-bold tracking-wider text-stone-400 p-2">Add to setlist</p>
                      {playlists.length === 0 ? (
                        <p className="text-xs text-stone-400 p-2 italic">No setlists created</p>
                      ) : (
                        playlists.map(pl => {
                          const hasSong = pl.songIds.includes(song.id);
                          return (
                            <button
                              key={pl.id}
                              onClick={() => {
                                onAddSongToPlaylist(pl.id, song.id);
                                setShowPlaylistMenu(false);
                              }}
                              className="w-full flex items-center justify-between p-2 hover:bg-stone-100 text-xs rounded transition-colors text-stone-700"
                            >
                              <span>{pl.name}</span>
                              {hasSong && <Check className="w-3.5 h-3.5 text-green-600" />}
                            </button>
                          );
                        })
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </header>
      )}



      <main className={`flex-grow flex flex-col transition-all duration-200 ${localIsCompact ? 'px-3.5 py-2 md:p-3' : 'px-4.5 py-4 md:p-0 bg-white'}`}>
        <div className={`flex-grow bg-white select-text transition-all duration-200 w-full ${
          localIsCompact 
            ? 'py-3 px-[24px] sm:px-6 w-full md:max-w-full mx-auto border border-stone-200/85 md:border-none rounded-xl md:rounded-none shadow-md md:shadow-none bg-white' 
            : 'py-6 md:py-8 mx-auto border-none shadow-none rounded-none song-viewer-padding-x'
        }`}>
          {/* Inline chords song sheet */}
          <div 
            ref={sheetRef}
            className={`song-lyrics-sheet select-text max-w-[96%] mx-auto w-full ${localIsCompact ? 'song-lyrics-sheet-compact' : ''} ${localColumns === 2 ? 'song-lyrics-sheet-cols-2' : localColumns === 3 ? 'song-lyrics-sheet-cols-3' : ''}`}
            style={{ fontSize: `${localFontSize}px` }}
          >
            {lines.map((line, index) => {
              const parsed = parseLine(line);

              if (parsed.isEmpty) {
                if (localIsCompact) return null;
                return <div key={index} className="h-5"></div>;
              }

              if (parsed.isComment) {
                return (
                  <div key={index} className={`comment-line ${isMobile ? 'compact' : ''}`}>
                    {parsed.text}
                  </div>
                );
              }

              return (
                <div key={index} className={`lyric-line-inline ${isMobile ? 'compact' : ''}`}>
                  {parsed.chunks.map((chunk, chunkIdx) => (
                    <React.Fragment key={chunkIdx}>
                      {chunk.chord && (
                        <span
                          onClick={(e) => handleChordClick(chunk.chord, e)}
                          className={`chord-inline ${isMobile ? 'compact' : ''}`}
                        >
                          {chunk.chord}
                        </span>
                      )}
                      {chunk.text}
                    </React.Fragment>
                  ))}
                </div>
              );
            })}
          </div>

        </div>
      </main>

      {/* Popover Chord Diagram (Anchored under clicked chord) */}
      {activeChord && (
        <div 
          className="fixed z-50 shadow-2xl animate-fade-in"
          style={{
            left: `${Math.max(10, Math.min(window.innerWidth - (instrument === 'piano' ? 210 : 150), popupPosition.x - (instrument === 'piano' ? 100 : 70)))}px`,
            top: `${popupPosition.y + 8}px`
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <ChordDiagram chord={activeChord} instrument={instrument} />
        </div>
      )}

      {/* Song Info Modal Overlay */}
      {showSongInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm animate-fade-in" onClick={() => setShowSongInfo(false)}>
          <div className="bg-white border border-stone-200/80 rounded-xl max-w-sm w-full p-5 shadow-2xl relative select-none" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-stone-100 pb-3 mb-4">
              <div>
                <h3 className="font-bold text-stone-900 text-base leading-tight">{song.title}</h3>
                {cleanArtist && <p className="text-xs text-stone-500 mt-1">{cleanArtist}</p>}
              </div>
              <button
                onClick={() => setShowSongInfo(false)}
                className="p-1 rounded-full hover:bg-stone-100 text-stone-400 hover:text-stone-800 transition"
              >
                <Plus className="w-4.5 h-4.5 rotate-45" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="space-y-3.5 text-xs text-stone-700">
              {/* Composer */}
              {cleanComposer && (
                <div className="flex justify-between items-center py-1.5 border-b border-stone-100">
                  <span className="font-semibold text-stone-500">Tác giả / Composer</span>
                  <span className="font-bold text-stone-950">{cleanComposer}</span>
                </div>
              )}

              {/* Rhythm */}
              <div className="flex justify-between items-center py-1.5 border-b border-stone-100">
                <span className="font-semibold text-stone-500">Điệu / Rhythm</span>
                <span className="font-bold text-stone-950 capitalize">{song.rhythm || 'Chưa xác định'}</span>
              </div>

              {/* Original Key */}
              <div className="flex justify-between items-center py-1.5 border-b border-stone-100">
                <span className="font-semibold text-stone-500">Tông gốc / Original Key</span>
                <span className="px-1.5 py-0.5 bg-stone-100 border border-stone-200 font-mono text-[10px] font-bold text-stone-600 rounded">
                  {song.key}
                </span>
              </div>

              {/* Current Key */}
              <div className="flex justify-between items-center py-1.5 border-b border-stone-100">
                <span className="font-semibold text-stone-500">Tông hiện tại / Current Key</span>
                <span className="px-1.5 py-0.5 bg-blue-50 border border-blue-100 font-mono text-[10px] font-bold text-blue-800 rounded">
                  {transposeChord(song.key, transposeOffset)}
                </span>
              </div>

              {/* Singer Tones */}
              <div className="space-y-2 pt-1">
                <span className="font-semibold text-stone-500 block mb-1">Tông ca sĩ gợi ý / Reference Tones</span>
                
                {/* Male Tones */}
                <div className="flex justify-between items-center bg-stone-50 border border-stone-200/40 rounded-lg px-2.5 py-1.5">
                  <span className="text-[10px] font-black uppercase text-stone-500">Tông Nam (Male)</span>
                  <span className="font-mono text-[11px] font-bold text-blue-dark">
                    {getSingerTones(song.key)?.male}
                  </span>
                </div>

                {/* Female Tones */}
                <div className="flex justify-between items-center bg-stone-50 border border-stone-200/40 rounded-lg px-2.5 py-1.5">
                  <span className="text-[10px] font-black uppercase text-stone-500">Tông Nữ (Female)</span>
                  <span className="font-mono text-[11px] font-bold text-blue-dark">
                    {getSingerTones(song.key)?.female}
                  </span>
                </div>
              </div>

              {/* Genre (Thể loại) */}
              <div className="flex justify-between items-center py-1.5 border-b border-stone-100 pt-2">
                <span className="font-semibold text-stone-500">Thể loại / Genre</span>
                <span className="font-bold text-stone-950">Nhạc trẻ / Trữ tình / Pop</span>
              </div>

              {/* Screen Wake Lock Toggle */}
              <div className="flex justify-between items-center py-2.5 border-b border-stone-100">
                <div className="flex flex-col text-left">
                  <span className="font-semibold text-stone-600 flex items-center gap-1.5 text-xs">
                    <span className={`w-1.5 h-1.5 rounded-full ${keepScreenAwake ? 'bg-green-500 animate-pulse' : 'bg-stone-300'}`}></span>
                    Giữ màn hình sáng / Prevent Sleep
                  </span>
                  <span className="text-[10px] text-stone-400 mt-0.5">
                    {keepScreenAwake ? 'Màn hình sẽ luôn bật khi xem sheet' : 'Tự động tắt theo cài đặt điện thoại'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setKeepScreenAwake(!keepScreenAwake)}
                  className={`w-10 h-6 flex items-center rounded-full p-0.5 cursor-pointer transition-colors duration-200 focus:outline-none shrink-0 ${
                    keepScreenAwake ? 'bg-amber-600' : 'bg-stone-300'
                  }`}
                  aria-label="Toggle screen wake lock"
                >
                  <div
                    className={`bg-white w-5 h-5 rounded-full shadow-sm transform duration-200 ${
                      keepScreenAwake ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  ></div>
                </button>
              </div>

              {/* YouTube Search in Modal */}
              <div className="flex justify-between items-center py-2.5 border-b border-stone-100">
                <div className="flex flex-col text-left min-w-0 flex-grow pr-2">
                  <span className="font-semibold text-stone-600 flex items-center gap-1.5 text-xs">
                    <Youtube className="w-4 h-4 text-red-500 fill-red-500 shrink-0" />
                    YouTube
                  </span>
                  <span className="text-[10px] text-stone-400 mt-0.5">
                    Tìm bài hát trên YouTube
                  </span>
                </div>
                <button
                  onClick={() => {
                    window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(song.title + ' ' + song.artist)}`, '_blank');
                  }}
                  className="px-2.5 py-1.5 bg-red-50 border border-red-200 text-red-700 text-[10px] font-bold rounded-lg hover:bg-red-100 transition active:scale-95 shrink-0 flex items-center gap-1"
                >
                  <ExternalLink className="w-3 h-3" /> Tìm YouTube
                </button>
              </div>
            </div>

            {/* Modal Footer / Close Action */}
            <div className="mt-5 pt-3 border-t border-stone-100">
              <button
                onClick={() => setShowSongInfo(false)}
                className="w-full py-2 bg-stone-900 hover:bg-stone-800 text-white rounded-lg text-xs font-bold transition active:scale-[0.98]"
              >
                Đóng / Close
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Floating mobile controls bar at the bottom */}
      {isMobile && (
        <div 
          className={`fixed bottom-[50px] left-0 right-0 z-40 flex items-center justify-center gap-2 px-4 select-none pointer-events-none transition-all duration-300 ease-in-out ${
            showMobileControls 
              ? 'opacity-100 translate-y-0 pointer-events-auto' 
              : 'opacity-0 translate-y-4 pointer-events-none'
          }`}
        >
          {/* Pill 1: Transpose Controls */}
          <div 
            onClick={(e) => { e.stopPropagation(); triggerShowControls(); }}
            onTouchStart={(e) => { e.stopPropagation(); triggerShowControls(); }}
            className="flex items-center gap-1 bg-white/95 border border-stone-200 rounded-full px-2.5 py-1 shadow-lg pointer-events-auto backdrop-blur-sm"
          >
            <button 
              onClick={() => setTransposeOffset(prev => prev - 1)}
              className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-stone-100 text-stone-750 active:scale-90 transition font-bold text-lg"
            >
              -
            </button>
            <button
              onClick={() => setShowKeySelector(!showKeySelector)}
              className="px-2.5 py-1 bg-stone-100 border border-stone-200/60 rounded-full text-xs font-mono font-black text-[#4B2E20] active:scale-95 transition min-w-[38px] text-center"
            >
              {transposeChord(song.key, transposeOffset)}
            </button>
            <button 
              onClick={() => setTransposeOffset(prev => prev + 1)}
              className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-stone-100 text-stone-750 active:scale-90 transition font-bold text-lg"
            >
              +
            </button>
          </div>

          {/* Pill 2: Rhythm / Beat Controls */}
          <div 
            onClick={(e) => { e.stopPropagation(); triggerShowControls(); }}
            onTouchStart={(e) => { e.stopPropagation(); triggerShowControls(); }}
            className="flex items-center gap-1.5 bg-white/95 border border-stone-200 rounded-full pl-2 pr-3.5 py-1 shadow-lg pointer-events-auto backdrop-blur-sm"
          >
            <button
              onClick={() => {
                if (playingStyle === currentRhythm) {
                  stopBeat();
                } else {
                  startBeat(currentRhythm || 'Slow / Slow Rock');
                }
              }}
              className={`w-9 h-9 flex items-center justify-center rounded-full transition-all active:scale-90 ${
                playingStyle 
                  ? 'bg-red-500 text-white shadow-sm' 
                  : 'bg-stone-100 hover:bg-stone-200 text-stone-700'
              }`}
            >
              {playingStyle ? (
                <Pause className="w-4 h-4 fill-white text-white" />
              ) : (
                <Play className="w-4 h-4 fill-stone-700 text-stone-700 ml-0.5" />
              )}
            </button>
            <div 
              onClick={() => setShowRhythmMenu(!showRhythmMenu)}
              className="flex flex-col text-left cursor-pointer select-none pr-0.5"
            >
              <span className="text-[10px] font-black text-stone-800 leading-none">
                {currentRhythm.trim() || 'Style'}
              </span>
              <span className="text-[9px] font-mono font-bold text-stone-500 mt-0.5 leading-none">
                {(DRUM_STYLES.find(s => s.name === currentRhythm) || DRUM_STYLES[0]).bpm} BPM
              </span>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-stone-400 shrink-0 -ml-0.5" />
          </div>

          {/* Button 3: Compact mode Grid Toggle */}
          <button
            onClick={(e) => { e.stopPropagation(); triggerShowControls(); setIsCompact(!isCompact); }}
            onTouchStart={(e) => { e.stopPropagation(); triggerShowControls(); }}
            className={`w-11 h-11 flex items-center justify-center bg-white/95 border border-stone-200 rounded-full shadow-lg hover:bg-stone-100 text-stone-700 active:scale-90 transition pointer-events-auto backdrop-blur-sm`}
          >
            <LayoutGrid className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Mobile Key Selector Modal Popup */}
      {isMobile && showKeySelector && (
        <>
          <div className="fixed inset-0 z-45" onClick={(e) => { e.stopPropagation(); setShowKeySelector(false); }} onTouchStart={(e) => e.stopPropagation()}></div>
          <div 
            onClick={(e) => e.stopPropagation()} 
            onTouchStart={(e) => e.stopPropagation()}
            className="fixed bottom-20 left-1/2 -translate-x-1/2 w-[90vw] max-w-sm bg-white border border-stone-200 rounded-2xl shadow-2xl p-4 z-50 animate-fade-in text-center select-none pointer-events-auto"
          >
            <div className="flex items-center justify-between border-b border-stone-100 pb-2 mb-3">
              <span className="text-[10px] uppercase font-black tracking-widest text-stone-400">Chọn tông (Key Selection)</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setTransposeOffset(0);
                  setTimeout(() => {
                    setShowKeySelector(false);
                  }, 50);
                }}
                onTouchStart={(e) => e.stopPropagation()}
                className="text-[10px] font-black uppercase text-orange-600"
              >
                Reset
              </button>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].map(keyNote => {
                const cleanSongKey = song.key.replace('m', '').replace(' ', '');
                const originalVal = NOTE_TO_SEMITONE[cleanSongKey] || 0;
                const targetVal = NOTE_TO_SEMITONE[keyNote] || 0;
                let diff = targetVal - originalVal;
                if (diff > 6) diff -= 12;
                if (diff < -5) diff += 12;
                
                const transposedDisplay = transposeChord(song.key, diff);
                const isSelected = transposeChord(song.key, transposeOffset) === transposedDisplay;
                
                return (
                  <button
                    key={keyNote}
                    onClick={(e) => {
                      e.stopPropagation();
                      setTransposeOffset(diff);
                      setTimeout(() => {
                        setShowKeySelector(false);
                      }, 50);
                    }}
                    onTouchStart={(e) => e.stopPropagation()}
                    className={`py-2 px-1 text-xs font-mono font-bold rounded-lg border transition ${
                      isSelected 
                        ? 'bg-orange-500 text-white border-orange-500' 
                        : 'bg-stone-50 border-stone-200/80 hover:bg-stone-100 text-stone-700'
                    }`}
                  >
                    {transposedDisplay}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Mobile Rhythm Style Selector Popup */}
      {isMobile && showRhythmMenu && (
        <>
          <div className="fixed inset-0 z-45" onClick={(e) => { e.stopPropagation(); setShowRhythmMenu(false); }} onTouchStart={(e) => e.stopPropagation()}></div>
          <div 
            onClick={(e) => e.stopPropagation()} 
            onTouchStart={(e) => e.stopPropagation()}
            className="fixed bottom-20 left-1/2 -translate-x-1/2 w-[95vw] max-w-sm bg-white border border-stone-200 rounded-2xl shadow-2xl p-5 z-50 animate-fade-in text-left pointer-events-auto max-h-[70vh] overflow-y-auto"
          >
            {/* Top Controller Panel (Play/Pause & BPM Slider) */}
            <div className="bg-stone-50 border border-stone-200/60 rounded-xl p-3 mb-4 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  {/* Big Play/Pause Button */}
                  <button
                    onClick={() => {
                      if (playingStyle === currentRhythm) {
                        stopBeat();
                      } else {
                        if (currentRhythm) {
                          startBeat(currentRhythm);
                        }
                      }
                    }}
                    className={`w-11 h-11 flex items-center justify-center rounded-full transition-all active:scale-95 shadow-sm ${
                      playingStyle === currentRhythm
                        ? 'bg-red-500 text-white'
                        : 'bg-orange-500 hover:bg-orange-600 text-white'
                    }`}
                  >
                    {playingStyle === currentRhythm ? (
                      <Pause className="w-5 h-5 fill-white text-white" />
                    ) : (
                      <Play className="w-5 h-5 fill-white text-white ml-0.5" />
                    )}
                  </button>
                  <div className="flex flex-col text-left min-w-0">
                    <span className="text-[9px] font-black tracking-wider text-stone-400 uppercase leading-none mb-1">
                      Selected Style
                    </span>
                    <span className="text-xs font-black text-stone-850 leading-none truncate max-w-[130px]">
                      {currentRhythm.trim() || 'Style'}
                    </span>
                  </div>
                </div>

                {/* BPM Speed Readout */}
                <div className="text-right">
                  <span className="font-mono text-base font-black text-orange-600">
                    {(DRUM_STYLES.find(s => s.name === currentRhythm) || DRUM_STYLES[0]).bpm}
                  </span>
                  <span className="text-[9px] font-black text-stone-400 uppercase ml-0.5">BPM</span>
                </div>
              </div>

              {/* Slider Controls */}
              <div className="flex items-center gap-2 mt-1 px-1">
                <span className="text-[9px] font-bold text-stone-400">40</span>
                <input 
                  type="range"
                  min="40"
                  max="200"
                  step="5"
                  value={(DRUM_STYLES.find(s => s.name === currentRhythm) || DRUM_STYLES[0]).bpm}
                  onChange={(e) => {
                    const newBpm = parseInt(e.target.value);
                    const activeStyleName = currentRhythm || DRUM_STYLES[0].name;
                    
                    // Update state
                    setDrumStyles(prev => prev.map(s => s.name === activeStyleName ? { ...s, bpm: newBpm } : s));
                    
                    // Live playback update if playing
                    if (playingStyle === activeStyleName) {
                      const targetStyle = DRUM_STYLES.find(s => s.name === activeStyleName);
                      if (targetStyle && targetStyle.audioFile && audioPlayerRef.current) {
                        audioPlayerRef.current.playbackRate = newBpm / targetStyle.originalBpm;
                      }
                    }
                  }}
                  className="flex-grow h-1 bg-stone-200 rounded-lg appearance-none cursor-pointer accent-orange-500"
                />
                <span className="text-[9px] font-bold text-stone-400">200</span>
              </div>
            </div>

            {/* List Header */}
            <div className="flex items-center justify-between border-b border-stone-150 pb-2 mb-2">
              <span className="text-[10px] uppercase font-black tracking-widest text-stone-400">DRUM STYLES</span>
              <button 
                onClick={(e) => { e.stopPropagation(); setShowRhythmMenu(false); }} 
                onTouchStart={(e) => { e.stopPropagation(); setShowRhythmMenu(false); }}
                className="text-[10px] font-black uppercase text-stone-500 hover:text-stone-700 bg-stone-100 hover:bg-stone-200 px-3 py-1 rounded-full transition-colors active:scale-95"
              >
                Xong / Done
              </button>
            </div>

            {/* Style list with highlighting, without play buttons on individual lines */}
            <div className="space-y-2 mt-1">
              {DRUM_STYLES.map(style => {
                const isSelected = currentRhythm === style.name;
                return (
                  <div key={style.name} className="relative">
                    <div 
                      onClick={(e) => {
                        e.stopPropagation();
                        setCurrentRhythm(style.name);
                        
                        // If loop was already active, switch loop and update play state automatically
                        if (playingStyle) {
                          startBeat(style.name);
                        }
                      }}
                      onTouchStart={(e) => e.stopPropagation()}
                      className={`w-full flex items-center justify-between py-3.5 px-3 rounded-xl transition-all cursor-pointer border ${
                        isSelected 
                          ? 'bg-orange-50/50 border-orange-200 font-bold text-orange-950 shadow-sm' 
                          : 'bg-white border-stone-150 text-stone-700 hover:border-stone-200'
                      }`}
                    >
                      <span className="text-sm font-semibold">{style.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-stone-400 bg-stone-100/80 px-2 py-0.5 rounded border border-stone-200/40">
                          {style.bpm} BPM
                        </span>
                        {isSelected && (
                          <Check className="w-4 h-4 text-orange-600 shrink-0" />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Subtle Watermarks in Unused Space (Left & Right margins) */}
      <div className="hidden xl:flex absolute left-4 top-[40%] -translate-y-1/2 opacity-[0.025] select-none pointer-events-none flex-col items-center justify-center text-center max-w-[150px]">
        <BrandLogo className="w-24 h-24 mb-2" />
        <span className="text-[10px] font-black uppercase tracking-widest text-[#4B2E20] font-display">HátCùngNhau</span>
      </div>
      <div className="hidden xl:flex absolute right-4 top-[40%] -translate-y-1/2 opacity-[0.025] select-none pointer-events-none flex-col items-center justify-center text-center max-w-[150px]">
        <BrandLogo className="w-24 h-24 mb-2" />
        <span className="text-[10px] font-black uppercase tracking-widest text-[#4B2E20] font-display">HátCùngNhau</span>
      </div>
    </div>
  );
}
