import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { Heart, ArrowLeft, Plus, Check, Minimize2, Maximize2, Info, ExternalLink, X, Share2, Printer, Link, Play, Square, Search, MoreVertical, ChevronDown, LayoutGrid, Pause, Mic, ChevronLeft, ChevronRight, Keyboard } from 'lucide-react';
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
  onNextSong,
  onPrevSong,
  hasNext,
  hasPrev,
  playlistIndex,
  playlistLength,
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
  const [autoplay, setAutoplay] = useState(() => {
    return localStorage.getItem('campfire_autoplay') === 'true';
  });
  const [autoplayTimer, setAutoplayTimer] = useState(null);

  useEffect(() => {
    if (autoplayTimer === null) return;
    if (autoplayTimer <= 0) {
      setAutoplayTimer(null);
      if (onNextSong) onNextSong();
      return;
    }
    const t = setTimeout(() => {
      setAutoplayTimer(prev => prev - 1);
    }, 1000);
    return () => clearTimeout(t);
  }, [autoplayTimer, onNextSong]);

  const triggerAutoplayNext = () => {
    if (autoplayTimer !== null) return;
    setAutoplayTimer(3);
  };
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
    setOverrideFontSize(false);
    setDetectionState('idle');
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
      if (overrideFontSize) {
        optimalFontSize = fontSize;
      } else {
        const minFontSize = 14.66; // 11 pt in pixels (1pt = 1.333px)
        let height = testLayout(1, fontSize, isCompact);

        if (height > availableHeight) {
          optimalFontSize = findOptimalSize(1, minFontSize, fontSize, isCompact);
        } else {
          optimalFontSize = fontSize;
        }
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
        if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 5) {
          setIsScrolling(false);
          if (autoplay && hasNext) {
            triggerAutoplayNext();
          }
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
  const [overrideFontSize, setOverrideFontSize] = useState(false);
  const [detectionState, setDetectionState] = useState('idle'); // 'idle', 'listening', 'done', 'error'
  const [detectionCountdown, setDetectionCountdown] = useState(5);
  const [detectedKey, setDetectedKey] = useState(null);
  const [detectedConfidence, setDetectedConfidence] = useState(0);
  const [detectionErrorMsg, setDetectionErrorMsg] = useState('');
  const [recordedAudioUrl, setRecordedAudioUrl] = useState(null);

  // Session Recording States & Refs
  const [isSessionRecording, setIsSessionRecording] = useState(false);
  const [sessionRecordDuration, setSessionRecordDuration] = useState(0);
  const [sessionAudioUrl, setSessionAudioUrl] = useState(null);
  const sessionRecorderRef = useRef(null);
  const sessionStreamRef = useRef(null);
  const sessionTimerRef = useRef(null);
  const sessionMimeTypeRef = useRef('audio/webm');

  // Bluetooth Pedal Configuration States
  const [showPedalConfig, setShowPedalConfig] = useState(false);
  const [recordingAction, setRecordingAction] = useState(null);
  const [pedalMappings, setPedalMappings] = useState(() => {
    const saved = localStorage.getItem('campfire_pedal_mappings');
    return saved ? JSON.parse(saved) : {
      pageUp: 'PageUp',
      pageDown: 'PageDown',
      keyUp: 'ArrowRight',
      keyDown: 'ArrowLeft',
      styleNext: ']',
      stylePrev: '[',
      tempoFast: '=',
      tempoSlow: '-',
      styleToggle: ' '
    };
  });
  const [importCode, setImportCode] = useState('');
  const [importStatus, setImportStatus] = useState('');
  const hiddenInputRef = useRef(null);

  // Audio Context and Scheduling refs
  const audioContextRef = useRef(null);
  const schedulerIntervalRef = useRef(null);
  const nextNoteTimeRef = useRef(0);
  const beatIndexRef = useRef(0);
  const audioPlayerRef = useRef(null); // Ref to HTML5 Audio Element for Slow Rock

  // List of drum styles
  const [DRUM_STYLES, setDrumStyles] = useState([
    { name: 'Boléro', bpm: 80, audioFile: 'Bolero_80bpm.m4a', originalBpm: 80 },
    { name: 'Slow', bpm: 60, audioFile: 'slowrock_60bpm.m4a', originalBpm: 60 },
    { name: 'Slow Rock', bpm: 60, audioFile: 'slowrock_60bpm.m4a', originalBpm: 60 },
    { name: 'Slow Surf', bpm: 60, audioFile: 'slowrock_60bpm.m4a', originalBpm: 60 },
    { name: 'Blues', bpm: 70, audioFile: 'Ballad_65bpm.m4a', originalBpm: 65 },
    { name: 'Ballad', bpm: 65, audioFile: 'Ballad_65bpm.m4a', originalBpm: 65 },
    { name: 'Chachacha', bpm: 80, audioFile: 'Chachacha_80bpm.m4a', originalBpm: 80 },
    { name: 'Disco', bpm: 120, audioFile: 'Disco_120bpm.m4a', originalBpm: 120 },
    { name: 'Rhumba', bpm: 80, audioFile: 'Bolero_80bpm.m4a', originalBpm: 80 },
    { name: 'Tango', bpm: 80, audioFile: 'Tango_80bpm.m4a', originalBpm: 80 },
    { name: 'Boston', bpm: 80, audioFile: 'Waltz_80bpm.m4a', originalBpm: 80 },
    { name: 'Fox', bpm: 120, audioFile: 'Disco_120bpm.m4a', originalBpm: 120 },
    { name: 'Rock', bpm: 110, audioFile: 'Disco_120bpm.m4a', originalBpm: 120 },
    { name: 'Valse', bpm: 80, audioFile: 'Waltz_80bpm.m4a', originalBpm: 80 },
    { name: 'Bossa Nova', bpm: 80, audioFile: 'Bolero_80bpm.m4a', originalBpm: 80 },
    { name: 'Pop', bpm: 80, audioFile: 'Ballad_65bpm.m4a', originalBpm: 65 },
    { name: 'Habanera', bpm: 80, audioFile: 'Tango_80bpm.m4a', originalBpm: 80 },
    { name: 'Twist', bpm: 120, audioFile: 'Disco_120bpm.m4a', originalBpm: 120 },
    { name: 'March', bpm: 100, audioFile: 'Chachacha_80bpm.m4a', originalBpm: 80 },
    { name: 'Pasodoble', bpm: 110, audioFile: 'Tango_80bpm.m4a', originalBpm: 80 },
    { name: 'Slow Ballad', bpm: 60, audioFile: 'Ballad_65bpm.m4a', originalBpm: 65 },
    { name: 'Rap', bpm: 90, audioFile: 'Ballad_65bpm.m4a', originalBpm: 65 },
    { name: 'Samba', bpm: 110, audioFile: 'Chachacha_80bpm.m4a', originalBpm: 80 },
    { name: 'Pop Ballad', bpm: 65, audioFile: 'Ballad_65bpm.m4a', originalBpm: 65 },
    { name: 'Rock Ballad', bpm: 75, audioFile: 'Ballad_65bpm.m4a', originalBpm: 65 }
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

  const detectPitch = (buffer, sampleRate) => {
    let bufferSize = buffer.length;
    let rms = 0;
    for (let i = 0; i < bufferSize; i++) {
      rms += buffer[i] * buffer[i];
    }
    rms = Math.sqrt(rms / bufferSize);
    if (rms < 0.003) return null;

    const maxLag = Math.min(bufferSize, Math.ceil(sampleRate / 70));
    const minLag = Math.floor(sampleRate / 600);

    const c = new Float32Array(maxLag);
    for (let i = 0; i < maxLag; i++) {
      let sum = 0;
      for (let j = 0; j < bufferSize - i; j++) {
        sum += buffer[j] * buffer[j + i];
      }
      c[i] = sum;
    }

    let d = 0;
    while (d < maxLag - 1 && c[d] > c[d + 1]) {
      d++;
    }

    let maxval = -1;
    let maxpos_temp = -1;
    for (let i = Math.max(d, minLag); i < maxLag; i++) {
      if (c[i] > maxval) {
        maxval = c[i];
        maxpos_temp = i;
      }
    }

    const estimatedFreq = maxpos_temp > 0 ? sampleRate / maxpos_temp : 0;
    const thresholdRatio = estimatedFreq > 220 ? 0.35 : 0.50;

    if (maxval < thresholdRatio * c[0]) {
      return null;
    }

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
  };

  const pearsonCorrelation = (x, y) => {
    let n = x.length;
    let sumX = 0, sumY = 0, sumXY = 0;
    let sumX2 = 0, sumY2 = 0;
    for (let i = 0; i < n; i++) {
      sumX += x[i];
      sumY += y[i];
      sumXY += x[i] * y[i];
      sumX2 += x[i] * x[i];
      sumY2 += y[i] * y[i];
    }
    let num = n * sumXY - sumX * sumY;
    let den = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    if (den === 0) return 0;
    return num / den;
  };

  const estimateKey = (pitchProfile, captureCount) => {
    if (captureCount < 10) {
      setDetectionErrorMsg('Không nghe rõ giọng hát/ngân nga. Hãy thử đặt micro gần hơn và hát to hơn!');
      setDetectionState('error');
      return;
    }

    const majorProfile = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
    const minorProfile = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
    
    // Scale-degree weights: Tonic (0) = 1.0, 5th (7) = 0.9, 3rd (3/4) = 0.8. In-scale = 0.5. Out-of-scale = -0.5.
    const majorScaleWeights = [1.0, -0.5, 0.5, -0.5, 0.8, 0.5, -0.5, 0.9, -0.5, 0.5, -0.5, 0.5];
    const minorScaleWeights = [1.0, -0.5, 0.5, 0.8, -0.5, 0.5, -0.5, 0.9, 0.5, -0.5, 0.5, -0.5];
    
    const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

    // Normalize pitch profile
    const totalPitches = pitchProfile.reduce((sum, val) => sum + val, 0);
    const normalizedProfile = new Float32Array(12);
    if (totalPitches > 0) {
      for (let i = 0; i < 12; i++) {
        normalizedProfile[i] = pitchProfile[i] / totalPitches;
      }
    }

    let bestKey = '';
    let maxScore = -2;

    for (let keyIdx = 0; keyIdx < 12; keyIdx++) {
      const shiftedMajor = new Float32Array(12);
      const shiftedMinor = new Float32Array(12);
      for (let i = 0; i < 12; i++) {
        shiftedMajor[(i + keyIdx) % 12] = majorProfile[i];
        shiftedMinor[(i + keyIdx) % 12] = minorProfile[i];
      }

      // Pearson correlation (good for polyphonic/accompaniment)
      const corrMajor = pearsonCorrelation(pitchProfile, shiftedMajor);
      const corrMinor = pearsonCorrelation(pitchProfile, shiftedMinor);

      // Scale-degree fit score (good for monophonic humming/singing)
      let scoreMajor = 0;
      let scoreMinor = 0;
      for (let i = 0; i < 12; i++) {
        const val = normalizedProfile[(i + keyIdx) % 12];
        scoreMajor += val * majorScaleWeights[i];
        scoreMinor += val * minorScaleWeights[i];
      }

      // Hybrid combination (40% correlation, 60% scale-degree fit)
      const hybridMajor = 0.4 * corrMajor + 0.6 * scoreMajor;
      const hybridMinor = 0.4 * corrMinor + 0.6 * scoreMinor;

      if (hybridMajor > maxScore) {
        maxScore = hybridMajor;
        bestKey = notes[keyIdx];
      }
      if (hybridMinor > maxScore) {
        maxScore = hybridMinor;
        bestKey = notes[keyIdx] + 'm';
      }
    }

    const confidence = Math.max(0, Math.min(100, Math.round(maxScore * 100)));
    setDetectedKey(bestKey);
    setDetectedConfidence(confidence);
    setDetectionState('done');
  };

  const analyzeRecordedAudio = async (blob) => {
    try {
      setDetectionState('processing');
      
      const arrayBuffer = await blob.arrayBuffer();
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 44100 });
      const decodedBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      
      const channelData = decodedBuffer.getChannelData(0); // mono
      const sampleRate = decodedBuffer.sampleRate;
      
      const windowSize = 2048;
      const hopSize = 1024; // 50% overlap
      const pitchProfile = new Float32Array(12);
      let captureCount = 0;
      
      const pitchHistory = [];
      const STABILITY_THRESHOLD = 0.5; // semitones
      
      for (let offset = 0; offset < channelData.length - windowSize; offset += hopSize) {
        const windowBuffer = channelData.subarray(offset, offset + windowSize);
        const pitch = detectPitch(windowBuffer, sampleRate);
        
        if (pitch && pitch > 60 && pitch < 1000) {
          const midi = 12 * Math.log2(pitch / 440) + 69;
          pitchHistory.push(midi);
        } else {
          pitchHistory.push(null);
        }
        
        // Pitch Stability Filter: Require pitch to be stable for 3 consecutive windows (~70ms)
        const len = pitchHistory.length;
        if (len >= 3) {
          const p1 = pitchHistory[len - 1];
          const p2 = pitchHistory[len - 2];
          const p3 = pitchHistory[len - 3];
          
          if (p1 !== null && p2 !== null && p3 !== null) {
            if (Math.abs(p1 - p2) <= STABILITY_THRESHOLD &&
                Math.abs(p2 - p3) <= STABILITY_THRESHOLD &&
                Math.abs(p1 - p3) <= STABILITY_THRESHOLD) {
              const noteIndex = Math.round(p1) % 12;
              pitchProfile[noteIndex] += 1;
              captureCount++;
            }
          }
        }
      }
      
      audioCtx.close();
      estimateKey(pitchProfile, captureCount);
      
    } catch (err) {
      console.error('Error in offline audio analysis:', err);
      setDetectionErrorMsg(`Lỗi xử lý âm thanh: ${err.message}`);
      setDetectionState('error');
    }
  };



  // Bluetooth Pedal Keydown Event Listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (recordingAction) {
        e.preventDefault();
        const mappedKey = e.key;
        setPedalMappings(prev => {
          const updated = { ...prev, [recordingAction]: mappedKey };
          localStorage.setItem('campfire_pedal_mappings', JSON.stringify(updated));
          return updated;
        });
        setRecordingAction(null);
        return;
      }

      if (document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
        return;
      }

      const key = e.key;
      if (key === pedalMappings.pageDown) {
        e.preventDefault();
        window.scrollBy({ top: window.innerHeight * 0.4, behavior: 'smooth' });
      } else if (key === pedalMappings.pageUp) {
        e.preventDefault();
        window.scrollBy({ top: -window.innerHeight * 0.4, behavior: 'smooth' });
      } else if (key === pedalMappings.keyUp) {
        e.preventDefault();
        setTransposeOffset(prev => prev + 1);
      } else if (key === pedalMappings.keyDown) {
        e.preventDefault();
        setTransposeOffset(prev => prev - 1);
      } else if (key === pedalMappings.styleNext) {
        e.preventDefault();
        const currentIndex = DRUM_STYLES.findIndex(s => s.name === currentRhythm);
        if (currentIndex !== -1) {
          const nextIndex = (currentIndex + 1) % DRUM_STYLES.length;
          const nextStyle = DRUM_STYLES[nextIndex];
          setCurrentRhythm(nextStyle.name);
          if (playingStyle) startBeat(nextStyle.name);
        }
      } else if (key === pedalMappings.stylePrev) {
        e.preventDefault();
        const currentIndex = DRUM_STYLES.findIndex(s => s.name === currentRhythm);
        if (currentIndex !== -1) {
          const prevIndex = (currentIndex - 1 + DRUM_STYLES.length) % DRUM_STYLES.length;
          const prevStyle = DRUM_STYLES[prevIndex];
          setCurrentRhythm(prevStyle.name);
          if (playingStyle) startBeat(prevStyle.name);
        }
      } else if (key === pedalMappings.tempoFast) {
        e.preventDefault();
        const activeStyleName = currentRhythm || DRUM_STYLES[0].name;
        const targetStyle = DRUM_STYLES.find(s => s.name === activeStyleName);
        if (targetStyle) {
          const newBpm = Math.min(200, targetStyle.bpm + 5);
          setDrumStyles(prev => prev.map(s => s.name === activeStyleName ? { ...s, bpm: newBpm } : s));
          if (playingStyle === activeStyleName && targetStyle.audioFile && audioPlayerRef.current) {
            audioPlayerRef.current.playbackRate = newBpm / targetStyle.originalBpm;
          }
        }
      } else if (key === pedalMappings.tempoSlow) {
        e.preventDefault();
        const activeStyleName = currentRhythm || DRUM_STYLES[0].name;
        const targetStyle = DRUM_STYLES.find(s => s.name === activeStyleName);
        if (targetStyle) {
          const newBpm = Math.max(40, targetStyle.bpm - 5);
          setDrumStyles(prev => prev.map(s => s.name === activeStyleName ? { ...s, bpm: newBpm } : s));
          if (playingStyle === activeStyleName && targetStyle.audioFile && audioPlayerRef.current) {
            audioPlayerRef.current.playbackRate = newBpm / targetStyle.originalBpm;
          }
        }
      } else if (key === pedalMappings.styleToggle) {
        e.preventDefault();
        if (playingStyle === currentRhythm) {
          stopBeat();
        } else if (currentRhythm) {
          startBeat(currentRhythm);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [pedalMappings, recordingAction, currentRhythm, playingStyle, DRUM_STYLES]);

  // Session Recording Handlers & Cleanups
  useEffect(() => {
    return () => {
      if (sessionTimerRef.current) clearInterval(sessionTimerRef.current);
      if (sessionStreamRef.current) {
        sessionStreamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const startSessionRecording = async () => {
    try {
      setSessionAudioUrl(null);
      setSessionRecordDuration(0);
      
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      });
      sessionStreamRef.current = stream;

      // Determine supported mimeType for recorder (especially for iOS Safari compatibility)
      let mimeType = 'audio/webm';
      if (typeof MediaRecorder.isTypeSupported === 'function') {
        if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        } else if (MediaRecorder.isTypeSupported('audio/webm')) {
          mimeType = 'audio/webm';
        } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
          mimeType = 'audio/ogg';
        }
      } else {
        // Fallback detection for iOS Safari
        const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
        if (isSafari) {
          mimeType = 'audio/mp4';
        }
      }
      sessionMimeTypeRef.current = mimeType;

      let chunks = [];
      const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 256000 });
      
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunks.push(e.data);
        }
      };
      
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: sessionMimeTypeRef.current });
        const url = URL.createObjectURL(blob);
        setSessionAudioUrl(url);
      };

      sessionRecorderRef.current = recorder;
      recorder.start();
      setIsSessionRecording(true);

      sessionTimerRef.current = setInterval(() => {
        setSessionRecordDuration(prev => prev + 1);
      }, 1000);

    } catch (err) {
      console.error('Failed to start session recording:', err);
      alert('Không thể bắt đầu ghi âm. Vui lòng cấp quyền truy cập micro.');
    }
  };

  const stopSessionRecording = () => {
    if (sessionRecorderRef.current && sessionRecorderRef.current.state !== 'inactive') {
      sessionRecorderRef.current.stop();
    }
    if (sessionStreamRef.current) {
      sessionStreamRef.current.getTracks().forEach(track => track.stop());
    }
    if (sessionTimerRef.current) {
      clearInterval(sessionTimerRef.current);
    }
    setIsSessionRecording(false);
  };

  const startKeyDetection = async () => {
    try {
      setDetectionErrorMsg('');
      setRecordedAudioUrl(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      });
      
      setDetectionState('listening');
      setDetectionCountdown(10);
      setDetectedKey(null);

      // Start recording media recorder
      let chunks = [];
      let recorder;
      try {
        recorder = new MediaRecorder(stream);
        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            chunks.push(e.data);
          }
        };
        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: 'audio/webm' });
          const url = URL.createObjectURL(blob);
          setRecordedAudioUrl(url);
          
          // Trigger offline post-processing analysis
          analyzeRecordedAudio(blob);
        };
        recorder.start();
      } catch (recErr) {
        console.error('MediaRecorder error:', recErr);
        setDetectionErrorMsg('Trình duyệt không hỗ trợ ghi âm MediaRecorder.');
        setDetectionState('error');
        stream.getTracks().forEach(t => t.stop());
        return;
      }

      let secondsLeft = 10;
      const interval = setInterval(() => {
        secondsLeft--;
        setDetectionCountdown(secondsLeft);
        if (secondsLeft <= 0) {
          clearInterval(interval);
          
          if (recorder && recorder.state !== 'inactive') {
            recorder.stop();
          }
          
          stream.getTracks().forEach(t => t.stop());
        }
      }, 1000);

    } catch (err) {
      console.error('Error starting key detection:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setDetectionErrorMsg('Trình duyệt bị từ chối quyền truy cập Micro. Hãy cấp quyền trong cài đặt!');
      } else if (err.name === 'SecurityError' || !window.isSecureContext) {
        setDetectionErrorMsg('Trình duyệt yêu cầu kết nối bảo mật (HTTPS) để sử dụng Micro trên điện thoại.');
      } else {
        setDetectionErrorMsg(`Không thể kết nối Micro: ${err.message || err.name}`);
      }
      setDetectionState('error');
    }
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

  const removeDiacritics = (str) => {
    if (!str) return '';
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  };

  const findMatchingStyle = (rhythmStr) => {
    if (!rhythmStr) return null;
    const normalizedTarget = removeDiacritics(rhythmStr);
    return DRUM_STYLES.find(s => {
      const normalizedName = removeDiacritics(s.name);
      return normalizedName.includes(normalizedTarget) || normalizedTarget.includes(normalizedName);
    });
  };

  const hasRhythmMatch = !!findMatchingStyle(currentRhythm);

  // Update current style selection state if the song updates
  useEffect(() => {
    const matchingStyle = findMatchingStyle(song.rhythm);
    setCurrentRhythm(matchingStyle ? matchingStyle.name : '');
    stopBeat();
  }, [song]);

  return (
    <div 
      onClick={(e) => {
        e.stopPropagation();
        triggerShowControls();
      }}
      onTouchStart={triggerShowControls}
      className="song-viewer-container flex flex-col min-h-screen text-stone-900 bg-stone-100 md:bg-white pb-28 animate-fade-in-opacity w-full md:max-w-[96vw] self-center mx-auto md:shadow-lg md:border-x md:border-stone-200/80 cursor-default relative" 
      ref={songContainerRef}
    >
            {isMobile ? (
        <header className="sticky top-0 z-30 bg-[#FFFBF6]/95 backdrop-blur border-b border-stone-200/60 flex items-center justify-between px-4 py-3 shadow-none">
          <div className="flex items-center gap-3 min-w-0 flex-grow mr-2">
            <button 
              onClick={onBack}
              className="p-1.5 hover:bg-stone-200/50 rounded-full transition text-stone-700 active:scale-95 shrink-0 animate-fade-in"
            >
              <ArrowLeft className="w-6 h-6 text-[#4B2E20]" />
            </button>
            <h1 className="font-bold text-[#4B2E20] text-lg select-none truncate min-w-0 flex-grow">{song.title}</h1>
          </div>
          
          <div className="flex items-center gap-2.5 shrink-0">
            {hasRhythmMatch && (
              <span 
                onClick={(e) => { e.stopPropagation(); setShowRhythmMenu(true); }}
                className="px-2 py-1 bg-orange-100 text-orange-800 text-[10px] font-black uppercase rounded-full tracking-wider border border-orange-200 select-none cursor-pointer active:scale-95 transition"
              >
                {currentRhythm}
              </span>
            )}

            {/* Play Button in mobile header (now opens the Rhythm Selector modal) */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowRhythmMenu(true);
              }}
              className={`w-8 h-8 flex items-center justify-center rounded-full transition-all active:scale-95 shadow-sm border ${
                !hasRhythmMatch
                  ? 'bg-stone-200 text-stone-400 border-stone-300 opacity-60'
                  : playingStyle 
                    ? 'bg-red-500 text-white border-red-550' 
                    : 'bg-orange-500 text-white border-orange-550'
              }`}
              title="Chọn điệu & Tốc độ"
            >
              {playingStyle ? <Pause className="w-3.5 h-3.5 fill-white text-white" /> : <Play className="w-3.5 h-3.5 fill-white text-white ml-0.5" />}
            </button>

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
                    <div className="fixed inset-0 z-45" onClick={() => setShowPlaylistMenu(false)}></div>
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
                        setShowRhythmMenu(true);
                      }}
                      className="w-full flex-shrink-0 flex items-center gap-2.5 p-2.5 hover:bg-stone-50 text-xs rounded-lg text-stone-700 transition-colors"
                    >
                      <LayoutGrid className="w-4 h-4 text-stone-500" />
                      <span>Chọn điệu (Rhythm Style)</span>
                    </button>
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
          <div className="relative flex items-center justify-center mx-2 shrink-0 gap-2">
            {/* Quick Play Button in desktop songview */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (!hasRhythmMatch) return;
                if (playingStyle === currentRhythm) {
                  stopBeat();
                } else {
                  if (currentRhythm) {
                    startBeat(currentRhythm);
                  }
                }
              }}
              disabled={!hasRhythmMatch}
              className={`w-7 h-7 flex items-center justify-center rounded-full transition-all active:scale-95 shadow-sm cursor-pointer border ${
                !hasRhythmMatch
                  ? 'bg-stone-200 text-stone-400 border-stone-300 opacity-50 cursor-not-allowed pointer-events-none'
                  : playingStyle 
                    ? 'bg-red-500 hover:bg-red-650 text-white border-red-550' 
                    : 'bg-orange-500 hover:bg-orange-600 text-white border-orange-550'
              }`}
              title={hasRhythmMatch ? (playingStyle ? "Dừng điệu" : "Phát điệu") : "Không có điệu phù hợp"}
            >
              {playingStyle ? <Pause className="w-3.5 h-3.5 fill-white text-white" /> : <Play className="w-3.5 h-3.5 fill-white text-white ml-0.5" />}
            </button>

            <button
              onClick={() => setShowRhythmMenu(!showRhythmMenu)}
              className="rhythm-trigger-button px-2.5 py-1.5 bg-stone-200/60 hover:bg-stone-200 border border-stone-300/60 rounded-full text-[10px] font-black text-stone-600 uppercase tracking-wider select-none cursor-pointer flex items-center gap-1 transition-all duration-150 active:scale-95 shadow-sm"
            >
              <span>{hasRhythmMatch ? currentRhythm.trim() : 'SELECT STYLE'}</span>
              {playingStyle && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>}
            </button>

             {showRhythmMenu && (
               <div 
                 style={{ padding: '24px' }}
                 className="rhythm-menu-container absolute left-1/2 -translate-x-1/2 mt-2 w-96 bg-white border border-stone-200 rounded-2xl shadow-2xl z-50 text-left top-full max-h-[460px] overflow-y-auto"
               >
                 {/* Top Controller Panel (Play/Pause & BPM Slider) */}
                 <div className="bg-stone-50 border border-stone-200/60 rounded-xl p-3 mb-3 flex flex-col gap-2">
                   <div className="flex items-center justify-between">
                     <div className="flex items-center gap-2.5">
                       {/* Big Play/Pause Button */}
                       <button
                         onClick={(e) => {
                           e.stopPropagation();
                           if (playingStyle === currentRhythm) {
                             stopBeat();
                           } else {
                             if (currentRhythm) {
                               startBeat(currentRhythm);
                             }
                           }
                         }}
                         className={`w-9 h-9 flex items-center justify-center rounded-full transition-all active:scale-95 shadow-sm ${
                           playingStyle === currentRhythm
                             ? 'bg-red-500 text-white'
                             : 'bg-orange-500 hover:bg-orange-600 text-white'
                         }`}
                       >
                         {playingStyle === currentRhythm ? (
                           <Pause className="w-4.5 h-4.5 fill-white text-white" />
                         ) : (
                           <Play className="w-4.5 h-4.5 fill-white text-white ml-0.5" />
                         )}
                       </button>
                       <div className="flex flex-col text-left min-w-0">
                         <span className="text-[9px] font-black tracking-wider text-stone-400 uppercase leading-none mb-1">
                           Selected Style
                         </span>
                         <span className="text-xs font-black text-stone-855 leading-none truncate max-w-[120px]">
                           {currentRhythm.trim() || 'Style'}
                         </span>
                       </div>
                     </div>

                     {/* BPM Speed Readout */}
                     <div className="text-right">
                       <span className="font-mono text-sm font-black text-orange-600">
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

                 {/* Session Recorder Panel */}
                 <div className="bg-[#FFF6E9] border border-[#F1E4D2] rounded-xl p-3 mb-3.5 flex flex-col gap-2 select-none">
                   <div className="flex items-center justify-between border-b border-[#F1E4D2]/60 pb-1.5">
                     <span className="text-[10px] uppercase font-black tracking-widest text-[#4B2E20] flex items-center gap-1.5">
                       <Mic className="w-3.5 h-3.5 text-orange-500" />
                       Ghi âm buổi hát / Session Record
                     </span>
                   </div>

                   {!isSessionRecording && !sessionAudioUrl && (
                     <button
                       onClick={(e) => {
                         e.stopPropagation();
                         startSessionRecording();
                       }}
                       className="w-full py-2 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-lg transition active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                     >
                       <span className="w-2 h-2 rounded-full bg-white animate-pulse"></span>
                       Bắt đầu ghi âm
                     </button>
                   )}

                   {isSessionRecording && (
                     <div className="flex items-center justify-between gap-3">
                       <div className="flex items-center gap-1.5">
                         <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-pulse"></span>
                         <span className="text-xs font-mono font-black text-stone-850">
                           {Math.floor(sessionRecordDuration / 60).toString().padStart(2, '0')}:
                           {(sessionRecordDuration % 60).toString().padStart(2, '0')}
                         </span>
                       </div>
                       <button
                         onClick={(e) => {
                           e.stopPropagation();
                           stopSessionRecording();
                         }}
                         className="px-4 py-1.5 bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs rounded-lg transition active:scale-95 cursor-pointer"
                       >
                         Dừng ghi âm
                       </button>
                     </div>
                   )}

                   {sessionAudioUrl && !isSessionRecording && (
                     <div className="flex flex-col gap-2">
                       <div className="flex items-center gap-2">
                         <audio src={sessionAudioUrl} controls className="w-full h-8 rounded-lg outline-none bg-white/50" />
                       </div>
                       <div className="flex gap-2">
                         <a
                           href={sessionAudioUrl}
                           download={`HaCungNhau_Session_${new Date().toISOString().slice(0, 10)}.${sessionMimeTypeRef.current.split('/')[1] || 'webm'}`}
                           onClick={(e) => e.stopPropagation()}
                           className="flex-grow py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-center font-bold text-xs rounded-lg transition flex items-center justify-center gap-1 cursor-pointer shadow-sm"
                         >
                           Tải xuống (.{sessionMimeTypeRef.current.split('/')[1] || 'webm'})
                         </a>
                         <button
                           onClick={(e) => {
                             e.stopPropagation();
                             startSessionRecording();
                           }}
                           className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 border border-stone-250 text-stone-700 font-bold text-xs rounded-lg transition active:scale-95 cursor-pointer"
                         >
                           Ghi âm lại
                         </button>
                       </div>
                     </div>
                   )}
                 </div>

                 {/* List Header */}
                 <div className="flex items-center justify-between border-b border-stone-150 pb-2 mb-2">
                   <span className="text-[10px] uppercase font-black tracking-widest text-stone-400">DRUM STYLES</span>
                   <button 
                     onClick={(e) => { e.stopPropagation(); setShowRhythmMenu(false); }} 
                     className="text-[10px] font-black uppercase text-stone-500 hover:text-stone-700 bg-stone-100 hover:bg-stone-200 px-3 py-1 rounded-full transition-colors active:scale-95"
                   >
                     Done
                   </button>
                 </div>

                 {/* List Container */}
                 <div className="flex flex-col gap-1 mt-2">
                   {DRUM_STYLES.map(style => {
                     const isSelected = currentRhythm === style.name;
                     return (
                        <div 
                          key={style.name}
                          onClick={(e) => {
                            e.stopPropagation();
                            setCurrentRhythm(style.name);
                            
                            if (playingStyle) {
                              startBeat(style.name);
                            }
                          }}
                          className={`w-full flex items-center justify-between py-2.5 px-1 cursor-pointer transition-all ${
                            isSelected 
                              ? 'font-bold text-orange-600' 
                              : 'text-stone-700 hover:font-bold hover:text-stone-900'
                          }`}
                        >
                          <span className="text-sm">{style.name}</span>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[10px] text-stone-400">
                              {style.bpm} BPM
                            </span>
                            {isSelected && (
                              <Check className="w-4 h-4 text-orange-600 shrink-0 font-bold" />
                            )}
                          </div>
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

            {/* Bluetooth Pedal Settings Trigger */}
            <button
              onClick={() => setShowPedalConfig(true)}
              className="p-1.5 rounded-full hover:bg-stone-200 text-stone-400 hover:text-stone-700 transition-colors"
              title="Bluetooth Pedal Settings"
            >
              <Keyboard className="w-4.5 h-4.5" />
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
        {playlistLength > 0 && (
          <div className="mx-auto w-full md:max-w-xl mb-4 bg-stone-50 border border-stone-200/80 rounded-xl px-4 py-2 flex items-center justify-between gap-4 select-none font-sans text-xs shadow-xs mt-2">
            <button
              onClick={onPrevSong}
              disabled={!hasPrev}
              className={`p-1.5 rounded-full transition flex items-center justify-center border ${
                hasPrev 
                  ? 'bg-white border-stone-200 hover:bg-stone-100 text-[#4B2E20] cursor-pointer' 
                  : 'bg-stone-50 border-stone-150 text-stone-300 cursor-not-allowed'
              }`}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-3">
              <span className="font-extrabold text-[#4B2E20] uppercase tracking-wider text-[10px]">
                Bài hát: {playlistIndex + 1} / {playlistLength}
              </span>
              <div className="h-4 w-px bg-stone-300"></div>
              <label className="flex items-center gap-1.5 cursor-pointer font-bold text-stone-600">
                <input
                  type="checkbox"
                  checked={autoplay}
                  onChange={(e) => {
                    const val = e.target.checked;
                    setAutoplay(val);
                    localStorage.setItem('campfire_autoplay', val ? 'true' : 'false');
                  }}
                  className="rounded border-stone-350 text-orange-600 focus:ring-orange-500 w-3.5 h-3.5"
                />
                <span>Tự động phát (Autoplay)</span>
              </label>
            </div>
            <button
              onClick={onNextSong}
              disabled={!hasNext}
              className={`p-1.5 rounded-full transition flex items-center justify-center border ${
                hasNext 
                  ? 'bg-white border-stone-200 hover:bg-stone-100 text-[#4B2E20] cursor-pointer' 
                  : 'bg-stone-50 border-stone-150 text-stone-300 cursor-not-allowed'
              }`}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

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

          {/* Pill 2: Font Size Controls */}
          <div 
            onClick={(e) => { e.stopPropagation(); triggerShowControls(); }}
            onTouchStart={(e) => { e.stopPropagation(); triggerShowControls(); }}
            className="flex items-center gap-1 bg-white/95 border border-stone-200 rounded-full px-2.5 py-1 shadow-lg pointer-events-auto backdrop-blur-sm"
          >
            <button 
              onClick={() => {
                setFontSize(prev => Math.max(10, prev - 1));
                setOverrideFontSize(true);
              }}
              className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-stone-100 text-stone-750 active:scale-90 transition font-bold text-sm"
            >
              A-
            </button>
            <span className="px-2.5 py-1 bg-stone-100 border border-stone-200/60 rounded-full text-xs font-mono font-black text-[#4B2E20] min-w-[38px] text-center">
              {fontSize}px
            </span>
            <button 
              onClick={() => {
                setFontSize(prev => Math.min(30, prev + 1));
                setOverrideFontSize(true);
              }}
              className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-stone-100 text-stone-750 active:scale-90 transition font-bold text-sm"
            >
              A+
            </button>
          </div>

          {/* Button 3: Compact mode Grid Toggle */}
          <button
            onClick={(e) => { e.stopPropagation(); triggerShowControls(); setIsCompact(!isCompact); }}
            onTouchStart={(e) => { e.stopPropagation(); triggerShowControls(); }}
            className={`w-11 h-11 flex items-center justify-center bg-white/95 border border-stone-200 rounded-full shadow-lg hover:bg-stone-100 text-stone-700 active:scale-90 transition pointer-events-auto backdrop-blur-sm`}
          >
            <LayoutGrid className="w-5 h-5" />
          </button>

          {/* Button 4: Bluetooth Pedal Config Modal Toggle */}
          <button
            onClick={(e) => { e.stopPropagation(); triggerShowControls(); setShowPedalConfig(true); }}
            onTouchStart={(e) => { e.stopPropagation(); triggerShowControls(); }}
            className={`w-11 h-11 flex items-center justify-center bg-white/95 border border-stone-200 rounded-full shadow-lg hover:bg-stone-100 text-stone-700 active:scale-90 transition pointer-events-auto backdrop-blur-sm`}
            title="Bluetooth Pedal Settings"
          >
            <Keyboard className="w-5 h-5" />
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
            className="fixed bottom-20 left-1/2 -translate-x-1/2 w-[90vw] max-w-sm bg-white border border-stone-200 rounded-2xl shadow-2xl p-4 z-50 animate-fade-in-opacity text-center select-none pointer-events-auto"
          >
            <div className="flex items-center justify-between border-b border-stone-100 pb-2 mb-3">
              <span className="text-[10px] uppercase font-black tracking-widest text-stone-400">Chọn tông (Key Selection - v1.6.0)</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setTransposeOffset(0);
                  setTimeout(() => {
                    setShowKeySelector(false);
                  }, 50);
                }}
                onTouchStart={(e) => e.stopPropagation()}
                className="text-[10px] font-black uppercase text-orange-600 animate-fade-in"
              >
                Reset
              </button>
            </div>

            {/* Key Detection Panel */}
            <div className="mb-4 p-3 bg-stone-50 border border-stone-200/60 rounded-xl flex flex-col items-center justify-center">
              {detectionState === 'idle' && (
                <button
                  onClick={(e) => { e.stopPropagation(); startKeyDetection(); }}
                  onTouchStart={(e) => e.stopPropagation()}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl transition-all active:scale-[0.98] font-bold text-sm shadow-sm cursor-pointer border border-orange-550"
                >
                  <Mic className="w-4.5 h-4.5" />
                  <span>Key Detection (Hum to Dò Tông)</span>
                </button>
              )}

              {detectionState === 'processing' && (
                <div className="w-full flex flex-col items-center justify-center py-3">
                  <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mb-2"></div>
                  <span className="text-xs font-bold text-stone-750">Đang phân tích giọng hát...</span>
                  <span className="text-[10px] text-stone-400 mt-0.5">Vui lòng đợi trong giây lát</span>
                </div>
              )}

              {detectionState === 'listening' && (
                <div className="w-full flex flex-col items-center justify-center py-1.5 animate-pulse">
                  <Mic className="w-5 h-5 text-red-500 mb-1.5 animate-bounce" />
                  <span className="text-xs font-bold text-stone-755">Đang lắng nghe giọng hát... {detectionCountdown}s</span>
                  <span className="text-[10px] text-stone-400 mt-0.5">Hãy ngân nga hoặc hát một đoạn nhạc thật to</span>
                </div>
              )}

              {detectionState === 'done' && (
                <div className="w-full flex flex-col items-center gap-2.5">
                  <div className="text-center">
                    <span className="text-[10px] uppercase font-black tracking-widest text-stone-400 block mb-0.5">Tông phát hiện</span>
                    <span className="font-mono text-xl font-black text-orange-600">
                      {detectedKey}
                    </span>
                    <span className="text-[10px] text-stone-400 block mt-0.5">Độ khớp: {detectedConfidence}%</span>
                  </div>
                  <div className="flex gap-2 w-full">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const cleanSongKey = song.key.replace('m', '').replace(' ', '');
                        const originalVal = NOTE_TO_SEMITONE[cleanSongKey] || 0;
                        const targetVal = NOTE_TO_SEMITONE[detectedKey.replace('m', '')] || 0;
                        let diff = targetVal - originalVal;
                        if (diff > 6) diff -= 12;
                        if (diff < -5) diff += 12;
                        setTransposeOffset(diff);
                        
                        setTimeout(() => {
                          setShowKeySelector(false);
                          setDetectionState('idle');
                        }, 50);
                      }}
                      onTouchStart={(e) => e.stopPropagation()}
                      className="flex-grow py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-bold transition-all active:scale-95 border border-green-750 shadow-sm"
                    >
                      Áp dụng tông
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); startKeyDetection(); }}
                      onTouchStart={(e) => e.stopPropagation()}
                      className="px-3 py-2 bg-stone-200 hover:bg-stone-300 text-stone-700 rounded-lg text-xs font-bold transition-all active:scale-95"
                    >
                      Thử lại
                    </button>
                  </div>
                </div>
              )}

              {detectionState === 'error' && (
                <div className="w-full flex flex-col items-center gap-2 py-1">
                  <span className="text-xs text-red-500 font-semibold text-center">{detectionErrorMsg || 'Không nghe rõ, hãy hát to hơn hoặc kiểm tra Micro!'}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); startKeyDetection(); }}
                    onTouchStart={(e) => e.stopPropagation()}
                    className="w-full py-2 bg-stone-900 hover:bg-stone-850 text-white rounded-lg text-xs font-bold transition-all active:scale-95"
                  >
                    Thử lại / Try Again
                  </button>
                </div>
              )}
            </div>

            {/* Reference Tones Group */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setTransposeOffset(0);
                  setTimeout(() => setShowKeySelector(false), 50);
                }}
                onTouchStart={(e) => e.stopPropagation()}
                className="flex flex-col items-center justify-center py-2.5 bg-[#fdfbf7] active:scale-95 transition-all rounded-xl border border-amber-250/70 cursor-pointer shadow-sm"
              >
                <span className="text-[9px] uppercase tracking-wider text-amber-805 font-extrabold mb-1">Tone Gốc</span>
                <span className="font-mono font-black text-amber-900 text-sm leading-none">{song.key}</span>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setTransposeOffset(-5);
                  setTimeout(() => setShowKeySelector(false), 50);
                }}
                onTouchStart={(e) => e.stopPropagation()}
                className="flex flex-col items-center justify-center py-2.5 bg-blue-50/45 active:scale-95 transition-all rounded-xl border border-blue-200/80 cursor-pointer shadow-sm"
              >
                <span className="text-[9px] uppercase tracking-wider text-blue-805 font-extrabold mb-1">Tông Nam</span>
                <span className="font-mono font-black text-blue-900 text-sm leading-none">
                  {transposeChord(song.key, -5)}
                </span>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setTransposeOffset(0);
                  setTimeout(() => setShowKeySelector(false), 50);
                }}
                onTouchStart={(e) => e.stopPropagation()}
                className="flex flex-col items-center justify-center py-2.5 bg-rose-50/45 active:scale-95 transition-all rounded-xl border border-rose-200/80 cursor-pointer shadow-sm"
              >
                <span className="text-[9px] uppercase tracking-wider text-rose-805 font-extrabold mb-1">Tông Nữ</span>
                <span className="font-mono font-black text-rose-900 text-sm leading-none">
                  {transposeChord(song.key, 0)}
                </span>
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
                    className={`py-3.5 px-2 text-sm font-mono font-black rounded-xl border transition ${
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

      {/* Centered Mobile Rhythm Selector Modal Popup */}
      {isMobile && showRhythmMenu && (
        <>
          <div className="fixed inset-0 z-45 bg-black/40 backdrop-blur-xs" onClick={(e) => { e.stopPropagation(); setShowRhythmMenu(false); }} onTouchStart={(e) => e.stopPropagation()}></div>
          <div 
            onClick={(e) => e.stopPropagation()} 
            onTouchStart={(e) => e.stopPropagation()}
            style={{ padding: '24px' }}
            className="rhythm-menu-container fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-sm bg-white border border-stone-200 rounded-2xl shadow-2xl z-50 animate-fade-in text-left pointer-events-auto max-h-[70vh] overflow-y-auto select-none"
          >
            {/* Top Controller Panel (Play/Pause & BPM Slider) */}
            <div className="bg-stone-50 border border-stone-200/60 rounded-xl p-3 mb-4 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  {/* Big Play/Pause Button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (playingStyle === currentRhythm) {
                        stopBeat();
                      } else {
                        if (currentRhythm) {
                          startBeat(currentRhythm);
                        }
                      }
                    }}
                    onTouchStart={(e) => e.stopPropagation()}
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
                  onClick={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                  className="flex-grow h-1 bg-stone-200 rounded-lg appearance-none cursor-pointer accent-orange-500"
                />
                <span className="text-[9px] font-bold text-stone-400">200</span>
              </div>
            </div>

            {/* Session Recorder Panel (Mobile) */}
            <div className="bg-[#FFF6E9] border border-[#F1E4D2] rounded-xl p-3 mb-4 flex flex-col gap-2 select-none">
              <div className="flex items-center justify-between border-b border-[#F1E4D2]/60 pb-1.5">
                <span className="text-[10px] uppercase font-black tracking-widest text-[#4B2E20] flex items-center gap-1.5">
                  <Mic className="w-3.5 h-3.5 text-orange-500" />
                  Ghi âm buổi hát / Session Record
                </span>
              </div>

              {!isSessionRecording && !sessionAudioUrl && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    startSessionRecording();
                  }}
                  onTouchStart={(e) => {
                    e.stopPropagation();
                    startSessionRecording();
                  }}
                  className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-lg transition active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <span className="w-2 h-2 rounded-full bg-white animate-pulse"></span>
                  Bắt đầu ghi âm
                </button>
              )}

              {isSessionRecording && (
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-pulse"></span>
                    <span className="text-xs font-mono font-black text-stone-850">
                      {Math.floor(sessionRecordDuration / 60).toString().padStart(2, '0')}:
                      {(sessionRecordDuration % 60).toString().padStart(2, '0')}
                    </span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      stopSessionRecording();
                    }}
                    onTouchStart={(e) => {
                      e.stopPropagation();
                      stopSessionRecording();
                    }}
                    className="px-4 py-1.5 bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs rounded-lg transition active:scale-95 cursor-pointer"
                  >
                    Dừng ghi âm
                  </button>
                </div>
              )}

              {sessionAudioUrl && !isSessionRecording && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <audio src={sessionAudioUrl} controls className="w-full h-8 rounded-lg outline-none bg-white/50" />
                  </div>
                  <div className="flex gap-2">
                    <a
                      href={sessionAudioUrl}
                      download={`HaCungNhau_Session_${new Date().toISOString().slice(0, 10)}.${sessionMimeTypeRef.current.split('/')[1] || 'webm'}`}
                      onClick={(e) => e.stopPropagation()}
                      onTouchStart={(e) => e.stopPropagation()}
                      className="flex-grow py-2 bg-orange-500 hover:bg-orange-600 text-white text-center font-bold text-xs rounded-lg transition flex items-center justify-center gap-1 cursor-pointer shadow-sm"
                    >
                      Tải xuống (.{sessionMimeTypeRef.current.split('/')[1] || 'webm'})
                    </a>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        startSessionRecording();
                      }}
                      onTouchStart={(e) => {
                        e.stopPropagation();
                        startSessionRecording();
                      }}
                      className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 border border-stone-250 text-stone-700 font-bold text-xs rounded-lg transition active:scale-95 cursor-pointer"
                    >
                      Ghi âm lại
                    </button>
                  </div>
                </div>
              )}
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

            {/* Style list with highlighting */}
            <div className="flex flex-col gap-3 mt-2.5">
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
                      className={`w-full flex items-center justify-between py-2.5 px-1 cursor-pointer transition-all ${
                        isSelected 
                          ? 'font-bold text-orange-600' 
                          : 'text-stone-700 hover:font-bold hover:text-stone-900'
                      }`}
                    >
                      <span className="text-sm">{style.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-stone-400">
                          {style.bpm} BPM
                        </span>
                        {isSelected && (
                          <Check className="w-4 h-4 text-orange-600 shrink-0 font-bold" />
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
      {/* Bluetooth Pedal Mapping Settings Modal */}
      {showPedalConfig && (
        <>
          <div 
            className="fixed inset-0 z-45 bg-black/40 backdrop-blur-xs" 
            onClick={() => { setShowPedalConfig(false); setRecordingAction(null); }}
            onTouchStart={(e) => { e.stopPropagation(); setShowPedalConfig(false); setRecordingAction(null); }}
          ></div>
          <div 
            onClick={(e) => e.stopPropagation()} 
            onTouchStart={(e) => e.stopPropagation()}
            style={{ padding: '24px' }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-md bg-white border border-stone-200 rounded-2xl shadow-2xl z-50 animate-fade-in text-left pointer-events-auto max-h-[85vh] overflow-y-auto select-none"
          >
            {/* Hidden input to capture physical keyboard keys on iPad Safari */}
            <input
              ref={hiddenInputRef}
              type="text"
              inputMode="none"
              onKeyDown={(e) => {
                if (recordingAction) {
                  e.preventDefault();
                  const mappedKey = e.key;
                  setPedalMappings(prev => {
                    const updated = { ...prev, [recordingAction]: mappedKey };
                    localStorage.setItem('campfire_pedal_mappings', JSON.stringify(updated));
                    return updated;
                  });
                  setRecordingAction(null);
                  if (hiddenInputRef.current) {
                    hiddenInputRef.current.blur();
                  }
                }
              }}
              style={{
                position: 'absolute',
                left: '-9999px',
                top: '-9999px',
                width: '10px',
                height: '10px',
                opacity: 0.01,
                border: 'none',
              }}
              aria-hidden="true"
            />

            <div className="flex items-center justify-between border-b border-stone-150 pb-3 mb-4">
              <div className="flex flex-col text-left">
                <span className="text-[10px] uppercase font-black tracking-widest text-stone-400">Bluetooth Page Turner Setup</span>
                <h3 className="text-base font-black text-stone-900 mt-0.5">Cài đặt Bàn đạp Pedal</h3>
              </div>
              <button 
                onClick={() => { setShowPedalConfig(false); setRecordingAction(null); }} 
                className="text-stone-400 hover:text-stone-600 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-stone-500 leading-relaxed mb-4 bg-stone-50 border border-stone-100 rounded-xl p-3">
              Hầu hết các bàn đạp Bluetooth (như PageTurner) hoạt động như bàn phím không dây. Nhấp vào <strong>Ghi nhận (Map)</strong>, sau đó nhấn nút trên Pedal của bạn để gán lệnh tương ứng.
            </p>

            <div className="flex flex-col gap-3.5 max-h-[40vh] overflow-y-auto pr-1">
              {[
                { key: 'pageDown', label: 'Cuộn xuống / Page Down', desc: 'Cuộn sheet nhạc xuống dưới' },
                { key: 'pageUp', label: 'Cuộn lên / Page Up', desc: 'Cuộn sheet nhạc lên trên' },
                { key: 'keyUp', label: 'Tăng tông / Key Up (+1)', desc: 'Tăng tông bài hát lên nửa cung' },
                { key: 'keyDown', label: 'Giảm tông / Key Down (-1)', desc: 'Giảm tông bài hát xuống nửa cung' },
                { key: 'styleNext', label: 'Điệu tiếp theo / Next Style', desc: 'Chuyển sang điệu trống tiếp theo' },
                { key: 'stylePrev', label: 'Điệu trước / Prev Style', desc: 'Chuyển về điệu trống trước đó' },
                { key: 'tempoFast', label: 'Tăng tốc độ / Tempo +5', desc: 'Tăng tốc độ nhịp điệu trống' },
                { key: 'tempoSlow', label: 'Giảm tốc độ / Tempo -5', desc: 'Giảm tốc độ nhịp điệu trống' },
                { key: 'styleToggle', label: 'Phát/Dừng điệu / Start-Stop Beat', desc: 'Bật hoặc tắt nhịp trống đệm' }
              ].map(item => {
                const isListening = recordingAction === item.key;
                return (
                  <div key={item.key} className="flex items-center justify-between gap-3 border-b border-stone-100 pb-3">
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-bold text-stone-800">{item.label}</span>
                      <span className="text-[10px] text-stone-400 leading-none mt-1 truncate">{item.desc}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`font-mono text-xs font-black px-2.5 py-1 rounded-md border ${
                        isListening 
                          ? 'bg-red-50 border-red-200 text-red-700 animate-pulse' 
                          : 'bg-stone-50 border-stone-200 text-stone-700'
                      }`}>
                        {isListening ? 'Ấn nút pedal...' : (pedalMappings[item.key] === ' ' ? 'Space' : pedalMappings[item.key] || 'Chưa gán')}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const nextAction = isListening ? null : item.key;
                          setRecordingAction(nextAction);
                          e.currentTarget.blur();
                          if (nextAction && hiddenInputRef.current) {
                            hiddenInputRef.current.focus();
                          }
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition select-none cursor-pointer ${
                          isListening
                            ? 'bg-stone-800 hover:bg-stone-900 text-white'
                            : 'bg-[#FFF6E9] hover:bg-[#FFE8CC] border border-[#FFE8CC]/60 text-[#FF8A00]'
                        }`}
                      >
                        {isListening ? 'Hủy' : 'Map'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Sync Configuration between devices */}
            <div className="mt-4 pt-3 border-t border-stone-150">
              <span className="text-[10px] uppercase font-black tracking-widest text-stone-400 block mb-1">Đồng bộ giữa các thiết bị / Sync across devices</span>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Dán mã cấu hình tại đây..."
                  value={importCode}
                  onChange={(e) => setImportCode(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  className="flex-grow text-[11px] px-2.5 py-1.5 border border-stone-200 rounded-lg bg-stone-50 text-stone-700 font-mono outline-none"
                />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    try {
                      const decoded = JSON.parse(atob(importCode.trim()));
                      if (decoded && typeof decoded === 'object') {
                        setPedalMappings(decoded);
                        localStorage.setItem('campfire_pedal_mappings', JSON.stringify(decoded));
                        setImportStatus('Đã đồng bộ thành công!');
                        setImportCode('');
                        setTimeout(() => setImportStatus(''), 3000);
                      } else {
                        throw new Error();
                      }
                    } catch (err) {
                      setImportStatus('Mã cấu hình không hợp lệ!');
                      setTimeout(() => setImportStatus(''), 3000);
                    }
                  }}
                  className="px-3 py-1.5 bg-[#FFF6E9] border border-[#FFE8CC] text-[#FF8A00] text-xs font-bold rounded-lg transition active:scale-95 cursor-pointer shrink-0"
                >
                  Nhập / Import
                </button>
              </div>
              
              <div className="mt-3">
                <span className="text-[9px] font-bold text-stone-400 block mb-1">Mã cấu hình hiện tại / Current Config Code:</span>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={btoa(JSON.stringify(pedalMappings))}
                    onClick={(e) => {
                      e.stopPropagation();
                      e.target.select();
                    }}
                    className="flex-grow text-[9px] px-2.5 py-1 border border-stone-250 rounded-lg bg-stone-50 text-stone-500 font-mono outline-none select-all"
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      try {
                        const code = btoa(JSON.stringify(pedalMappings));
                        navigator.clipboard.writeText(code);
                        setImportStatus('Đã sao chép!');
                        setTimeout(() => setImportStatus(''), 3000);
                      } catch (err) {
                        setImportStatus('Hãy bôi đen và sao chép thủ công!');
                        setTimeout(() => setImportStatus(''), 3000);
                      }
                    }}
                    className="px-2.5 py-1 bg-stone-100 hover:bg-stone-200 border border-stone-250 text-stone-700 text-[10px] font-bold rounded-lg transition shrink-0 cursor-pointer"
                  >
                    Sao chép / Copy
                  </button>
                </div>
                {importStatus && (
                  <div className="text-right mt-1.5">
                    <span className="text-[10px] font-bold text-green-600 animate-pulse">{importStatus}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-between items-center mt-5 pt-3 border-t border-stone-150 gap-3">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const defaults = {
                    pageUp: 'PageUp',
                    pageDown: 'PageDown',
                    keyUp: 'ArrowRight',
                    keyDown: 'ArrowLeft',
                    styleNext: ']',
                    stylePrev: '[',
                    tempoFast: '=',
                    tempoSlow: '-',
                    styleToggle: ' '
                  };
                  setPedalMappings(defaults);
                  localStorage.setItem('campfire_pedal_mappings', JSON.stringify(defaults));
                }}
                className="px-3.5 py-2 text-stone-500 hover:text-stone-850 hover:bg-stone-50 text-xs font-bold rounded-lg border border-stone-250 transition cursor-pointer"
              >
                Khôi phục Mặc định
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setShowPedalConfig(false); }}
                className="px-5 py-2 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold rounded-lg transition cursor-pointer shadow-sm"
              >
                Hoàn tất
              </button>
            </div>
          </div>
        </>
      )}

      {autoplayTimer !== null && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-[#1e1b4b] text-white border border-indigo-900 px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-3 animate-bounce select-none font-sans text-xs">
          <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-ping"></span>
          <span>Chuyển bài kế tiếp sau <strong className="text-red-400 font-black font-mono text-sm">{autoplayTimer}s</strong>...</span>
          <button 
            onClick={() => setAutoplayTimer(null)}
            className="px-2 py-0.5 bg-stone-800 hover:bg-stone-750 text-stone-300 font-bold rounded text-[10px] cursor-pointer"
          >
            Hủy / Stop
          </button>
        </div>
      )}
    </div>
  );
}
