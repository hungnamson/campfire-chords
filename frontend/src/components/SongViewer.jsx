import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { Heart, ArrowLeft, Plus, Check, Minimize2, Maximize2, Info, Tv, Music, Edit2, ExternalLink, X } from 'lucide-react';
import { transposeChord } from '../utils/transposer';
import ChordDiagram from './ChordDiagram';

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
  isCompact,
  instrument,
  onUpdateYoutubeUrl
}) {
  const [isScrolling, setIsScrolling] = useState(false);
  const [scrollSpeed, setScrollSpeed] = useState(3); // 1 to 10
  const [activeChord, setActiveChord] = useState(null);
  const [showPlaylistMenu, setShowPlaylistMenu] = useState(false);
  const [popupPosition, setPopupPosition] = useState({ x: 0, y: 0 });
  const [showSongInfo, setShowSongInfo] = useState(false);
  const [keepScreenAwake, setKeepScreenAwake] = useState(true);
  const wakeLockRef = useRef(null);

  const [showYoutubePanel, setShowYoutubePanel] = useState(false);
  const [playerMode, setPlayerMode] = useState('video'); // 'video' | 'audio'
  const [youtubeUrlInput, setYoutubeUrlInput] = useState('');
  const [isEditingLink, setIsEditingLink] = useState(false);
  const [isSavingLink, setIsSavingLink] = useState(false);

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
    setShowYoutubePanel(false);
    setPlayerMode('video');
    setYoutubeUrlInput(song.youtubeUrl || '');
    setIsEditingLink(false);
  }, [song]);

  // Helper to extract YouTube video ID from URL
  const extractYoutubeId = (url) => {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

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
    const testLayout = (cols, size) => {
      if (cols === 1) {
        sheet.className = 'song-lyrics-sheet select-text';
      } else if (cols === 2) {
        sheet.className = 'song-lyrics-sheet select-text song-lyrics-sheet-cols-2';
      } else if (cols === 3) {
        sheet.className = 'song-lyrics-sheet select-text song-lyrics-sheet-cols-3';
      }
      sheet.style.columnCount = cols.toString();
      sheet.style.fontSize = `${size}px`;
      
      // Force a reflow and get the actual layout height (balanced) of the columns container
      return sheet.getBoundingClientRect().height;
    };

    // Helper to binary search for the largest font size (in steps of 0.25px) that fits within availableHeight
    const findOptimalSize = (cols, minSize, maxSize) => {
      let low = Math.round(minSize * 4);
      let high = Math.round(maxSize * 4);
      let optimal = minSize;

      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const size = mid / 4;
        const height = testLayout(cols, size);

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
      // Mobile Mode: default to compact view, 1 column, fit to screen size
      optimalIsCompact = true;
      
      const minFontSize = 14.66; // 11 pt in pixels (1pt = 1.333px)
      let height = testLayout(1, fontSize);

      if (height > availableHeight) {
        // If standard size doesn't fit, search between minFontSize and fontSize
        optimalFontSize = findOptimalSize(1, minFontSize, fontSize);
      } else {
        optimalFontSize = fontSize;
      }
    } else {
      // Tablet & Desktop: try to fit screen. If too long, use 2 columns or 3 columns. If short, scale up font size
      optimalIsCompact = false; // Always use regular text mode for desktop/tablet

      // First test 1 column at current base fontSize
      let height1 = testLayout(1, fontSize);

      if (height1 <= availableHeight) {
        // Fits in 1 column: scale up to fill screen (up to 26px)
        optimalFontSize = findOptimalSize(1, fontSize, 26);
        optimalColumns = 1;
      } else {
        // Doesn't fit in 1 column: try 2 columns at base fontSize
        let height2 = testLayout(2, fontSize);

        if (height2 <= availableHeight) {
          // Fits in 2 columns: scale up to fill screen (up to 22px)
          optimalFontSize = findOptimalSize(2, fontSize, 22);
          optimalColumns = 2;
        } else {
          // Doesn't fit in 2 columns at base size.
          // Let's try 2 columns at the minimum reasonable size (14px)
          let heightAt14 = testLayout(2, 14);
          if (heightAt14 <= availableHeight) {
            // Fits in 2 columns at a size >= 14px! Find the best size between 14px and base fontSize
            optimalFontSize = findOptimalSize(2, 14, fontSize);
            optimalColumns = 2;
          } else {
            // Doesn't fit in 2 columns even at 14px: try 3 columns at base fontSize
            let height3 = testLayout(3, fontSize);

            if (height3 <= availableHeight) {
              // Fits in 3 columns: scale up to fill screen (up to 20px)
              optimalFontSize = findOptimalSize(3, fontSize, 20);
              optimalColumns = 3;
            } else {
              // Doesn't fit in 3 columns at base size.
              // Try to scale down in 3 columns from base size down to 12px
              let heightAt12 = testLayout(3, 12);
              if (heightAt12 <= availableHeight) {
                optimalFontSize = findOptimalSize(3, 12, fontSize);
                optimalColumns = 3;
              } else {
                optimalFontSize = 12;
                optimalColumns = 3;
              }
            }
          }
        }
      }
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
                      (trimmed.endsWith(':') && trimmed.length < 25);

    if (isComment) {
      return { isComment: true, text: line };
    }

    // Split line by chord brackets
    const parts = line.split(/\[([^\]]+)\]/);
    const chunks = [];

    // Push preceding text chunk
    chunks.push({ chord: '', text: parts[0] || '' });

    for (let j = 1; j < parts.length; j += 2) {
      const chordVal = parts[j];
      const textVal = parts[j + 1] || '';

      if (!/^[A-G]/i.test(chordVal.trim())) {
        // Treat as plain text comment if not matching chord pattern
        chunks.push({ chord: '', text: `[${chordVal}]${textVal}` });
      } else {
        // Transpose the chord on the fly
        const transposed = transposeChord(chordVal.trim(), transposeOffset);
        chunks.push({ chord: transposed, text: textVal });
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
    const handleClose = () => setActiveChord(null);
    window.addEventListener('click', handleClose);
    window.addEventListener('scroll', handleClose);
    return () => {
      window.removeEventListener('click', handleClose);
      window.removeEventListener('scroll', handleClose);
    };
  }, []);

  return (
    <div className="song-viewer-container flex flex-col min-h-screen text-stone-900 bg-stone-100 md:bg-white pb-28 animate-fade-in w-full md:w-[90vw] md:max-w-[90vw] mx-auto md:shadow-lg md:border-x md:border-stone-200/80 cursor-default" ref={songContainerRef} onClick={(e) => e.stopPropagation()}>
      {/* Sub Header / Action bar */}
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
            <h1 className={`font-bold text-stone-900 truncate max-w-[100px] xs:max-w-[150px] sm:max-w-xs transition-all duration-200 ${
              localIsCompact ? 'text-sm' : 'text-base'
            }`}>{song.title}</h1>
            <p className={`text-stone-500 truncate max-w-[100px] xs:max-w-[150px] sm:max-w-xs transition-all duration-205 ${
              localIsCompact ? 'text-[10px]' : 'text-xs'
            }`}>
              {song.artist}{song.composer ? ` • Sáng tác: ${song.composer}` : ''}
            </p>
          </div>
        </div>

        {song.rhythm && song.rhythm.trim() && song.rhythm.toLowerCase().trim() !== 'chưa xác định' && (
          <div className="flex items-center justify-center mx-2 shrink-0">
            <span className="px-2.5 py-0.5 bg-stone-200/50 border border-stone-300/60 rounded-full text-[10px] font-black text-stone-600 uppercase tracking-wider select-none">
              {song.rhythm.trim()}
            </span>
          </div>
        )}

        <div className="flex items-center gap-2 shrink-0">
          {/* YouTube Jam Button */}
          <button
            onClick={() => {
              setShowYoutubePanel(!showYoutubePanel);
              if (!showYoutubePanel) {
                setYoutubeUrlInput(song.youtubeUrl || '');
                setIsEditingLink(false);
              }
            }}
            className={`p-1.5 rounded-full hover:bg-stone-200 transition-colors ${
              song.youtubeUrl 
                ? 'text-red-650 bg-red-50 hover:bg-red-100/80 animate-[pulse-glow_2s_infinite]' 
                : 'text-stone-400 hover:text-stone-750'
            }`}
            title={song.youtubeUrl ? "Jam with YouTube" : "Link YouTube Video"}
          >
            <Youtube className="w-4.5 h-4.5" fill={song.youtubeUrl ? "currentColor" : "none"} />
          </button>

          {/* Song Info Button */}
          <button
            onClick={() => setShowSongInfo(true)}
            className="p-1.5 rounded-full hover:bg-stone-200 text-stone-400 hover:text-stone-700 transition-colors animate-fade-in"
            title="Song Info"
          >
            <Info className="w-4.5 h-4.5" />
          </button>

          {/* Favorite Button */}
          <button
            onClick={() => onToggleFavorite(song.id)}
            className={`p-1.5 rounded-full hover:bg-stone-200 transition-colors ${
              song.isFavorite ? 'text-red-600' : 'text-stone-400 hover:text-stone-800'
            }`}
          >
            <Heart className="w-4.5 h-4.5" fill={song.isFavorite ? "currentColor" : "none"} />
          </button>

          {/* Add to Playlist button */}
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
        </div>
      </header>

      {/* YouTube Panel */}
      {showYoutubePanel && (
        <div className="bg-stone-900 text-stone-100 border-b border-stone-850 shadow-inner overflow-hidden select-none animate-slide-down">
          <div className="max-w-4xl mx-auto p-4 flex flex-col gap-3">
            {/* Header of the panel */}
            <div className="flex items-center justify-between border-b border-stone-800 pb-2">
              <div className="flex items-center gap-2">
                <Youtube className="w-5 h-5 text-red-500 fill-red-500 shrink-0" />
                <span className="text-xs font-bold uppercase tracking-wider text-stone-400">
                  YouTube Jam Session
                </span>
              </div>
              <div className="flex items-center gap-2">
                {song.youtubeUrl && !isEditingLink && (
                  <>
                    {playerMode === 'video' ? (
                      <button
                        onClick={() => setPlayerMode('audio')}
                        className="px-2.5 py-1 bg-stone-800 hover:bg-stone-750 active:scale-95 rounded text-[11px] font-semibold flex items-center gap-1.5 transition text-stone-300"
                        title="Minimize to background audio"
                      >
                        <Music className="w-3.5 h-3.5" /> Ẩn Video
                      </button>
                    ) : (
                      <button
                        onClick={() => setPlayerMode('video')}
                        className="px-2.5 py-1 bg-stone-800 hover:bg-stone-750 active:scale-95 rounded text-[11px] font-semibold flex items-center gap-1.5 transition text-stone-300"
                        title="Restore video view"
                      >
                        <Tv className="w-3.5 h-3.5" /> Hiện Video
                      </button>
                    )}
                    <button
                      onClick={() => setIsEditingLink(true)}
                      className="p-1 hover:bg-stone-800 rounded text-stone-400 hover:text-stone-200 transition"
                      title="Edit YouTube link"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  </>
                )}
                <button
                  onClick={() => setShowYoutubePanel(false)}
                  className="p-1 hover:bg-stone-800 rounded text-stone-400 hover:text-stone-200 transition"
                  title="Close player"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Panel Content */}
            {!song.youtubeUrl || isEditingLink ? (
              /* LINKING FORM */
              <div className="py-1">
                <p className="text-xs text-stone-400 mb-3 text-left">
                  Chưa liên kết video YouTube cho bài hát này. Hãy dán link hoặc tìm kiếm trên YouTube để cùng chơi nhạc nhé!
                </p>
                <form 
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (isSavingLink) return;
                    setIsSavingLink(true);
                    const success = await onUpdateYoutubeUrl(song.id, youtubeUrlInput);
                    setIsSavingLink(false);
                    if (success) {
                      setIsEditingLink(false);
                    } else {
                      alert('Không thể lưu link. Vui lòng kiểm tra lại.');
                    }
                  }}
                  className="flex flex-col sm:flex-row gap-2"
                >
                  <input
                    type="url"
                    required
                    placeholder="Dán link YouTube (ví dụ: https://www.youtube.com/watch?v=...)"
                    value={youtubeUrlInput}
                    onChange={(e) => setYoutubeUrlInput(e.target.value)}
                    className="flex-grow px-3 py-2 bg-stone-950 border border-stone-800 rounded-lg text-xs text-stone-105 placeholder-stone-600 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
                  />
                  <div className="flex gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(song.title + ' ' + song.artist)}`, '_blank');
                      }}
                      className="px-3.5 py-2 bg-stone-800 hover:bg-stone-750 text-stone-200 text-xs font-semibold rounded-lg transition shrink-0 flex items-center gap-1.5"
                    >
                      <ExternalLink className="w-3.5 h-3.5" /> Tìm YouTube
                    </button>
                    <button
                      type="submit"
                      disabled={isSavingLink}
                      className="px-4 py-2 bg-red-650 hover:bg-red-600 text-white text-xs font-bold rounded-lg transition disabled:bg-stone-700 shrink-0"
                    >
                      {isSavingLink ? 'Đang lưu...' : 'Lưu Link'}
                    </button>
                    {isEditingLink && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsEditingLink(false);
                          setYoutubeUrlInput(song.youtubeUrl || '');
                        }}
                        className="px-3 py-2 bg-stone-800 hover:bg-stone-750 text-stone-300 text-xs font-semibold rounded-lg transition shrink-0"
                      >
                        Hủy
                      </button>
                    )}
                  </div>
                </form>
              </div>
            ) : (
              /* IFRAME EMBED PLAYER */
              (() => {
                const videoId = extractYoutubeId(song.youtubeUrl);
                if (!videoId) {
                  return (
                    <div className="py-4 text-center">
                      <p className="text-xs text-red-400 mb-2">Đường dẫn YouTube không hợp lệ.</p>
                      <button
                        onClick={() => setIsEditingLink(true)}
                        className="px-3 py-1.5 bg-stone-850 hover:bg-stone-800 text-xs font-bold rounded text-stone-200 transition"
                      >
                        Đổi link
                      </button>
                    </div>
                  );
                }

                return (
                  <div className="flex flex-col items-center justify-center py-1">
                    {/* VIDEO CONTAINER */}
                    <div className={`w-full max-w-xl aspect-video rounded-lg overflow-hidden shadow-2xl bg-black border border-stone-800 transition-all duration-300 ${
                      playerMode === 'audio' ? 'youtube-iframe-hidden' : 'block'
                    }`}>
                      <iframe
                        src={`https://www.youtube.com/embed/${videoId}?enablejsapi=1&autoplay=0`}
                        title={`YouTube video player for ${song.title}`}
                        frameBorder="0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowFullScreen
                        className="w-full h-full"
                      ></iframe>
                    </div>

                    {/* AUDIO STATUS BLOCK (Visible only in audio mode) */}
                    {playerMode === 'audio' && (
                      <div className="w-full max-w-md bg-stone-950 border border-stone-800 rounded-xl p-3 flex items-center justify-between gap-4 shadow-lg animate-fade-in">
                        <div className="flex items-center gap-3 min-w-0">
                          {/* Pulsing visualizer icon */}
                          <div className="flex items-end gap-[2px] h-3.5 w-4 shrink-0">
                            <span className="w-[3px] bg-red-500 rounded-t-sm animate-[eq-bar-1_1s_ease-in-out_infinite]"></span>
                            <span className="w-[3px] bg-red-500 rounded-t-sm animate-[eq-bar-2_0.8s_ease-in-out_infinite]"></span>
                            <span className="w-[3px] bg-red-500 rounded-t-sm animate-[eq-bar-3_1.2s_ease-in-out_infinite]"></span>
                          </div>
                          <div className="min-w-0 text-left">
                            <p className="text-[10px] text-stone-400 font-medium truncate uppercase tracking-wider">Đang phát nhạc nền...</p>
                            <p className="text-xs text-stone-200 font-bold truncate">{song.title} - {song.artist}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => setPlayerMode('video')}
                          className="px-2.5 py-1 bg-stone-800 hover:bg-stone-750 active:scale-95 rounded text-[10px] font-bold text-stone-200 transition shrink-0 uppercase tracking-wider"
                        >
                          Xem Video
                        </button>
                      </div>
                    )}
                  </div>
                );
              })()
            )}
          </div>
        </div>
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
            className={`song-lyrics-sheet select-text ${localColumns === 2 ? 'song-lyrics-sheet-cols-2' : localColumns === 3 ? 'song-lyrics-sheet-cols-3' : ''}`}
            style={{ fontSize: `${localFontSize}px` }}
          >
            {lines.map((line, index) => {
              const parsed = parseLine(line);

              if (parsed.isEmpty) {
                return <div key={index} className={localIsCompact ? "h-2" : "h-5"}></div>;
              }

              if (parsed.isComment) {
                return (
                  <div key={index} className={`comment-line ${localIsCompact ? 'compact' : ''}`}>
                    {parsed.text}
                  </div>
                );
              }

              return (
                <div key={index} className={`lyric-line-inline ${localIsCompact ? 'compact' : ''}`}>
                  {parsed.chunks.map((chunk, chunkIdx) => (
                    <React.Fragment key={chunkIdx}>
                      {chunk.chord && (
                        <span
                          onClick={(e) => handleChordClick(chunk.chord, e)}
                          className={`chord-inline ${localIsCompact ? 'compact' : ''}`}
                        >
                          {localIsCompact ? chunk.chord : `[${chunk.chord}]`}
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
                <p className="text-xs text-stone-500 mt-1">{song.artist}</p>
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
              <div className="flex justify-between items-center py-1.5 border-b border-stone-100">
                <span className="font-semibold text-stone-500">Tác giả / Composer</span>
                <span className="font-bold text-stone-950">{song.composer || 'Khuyết danh'}</span>
              </div>

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

              {/* YouTube Link status in Modal */}
              <div className="flex justify-between items-center py-2.5 border-b border-stone-100">
                <div className="flex flex-col text-left min-w-0 flex-grow pr-2">
                  <span className="font-semibold text-stone-600 flex items-center gap-1.5 text-xs">
                    <Youtube className="w-4 h-4 text-red-500 fill-red-500 shrink-0" />
                    Video liên kết / Jam Video
                  </span>
                  <span className="text-[10px] text-stone-400 mt-0.5 truncate block w-full max-w-[200px]" title={song.youtubeUrl || 'Chưa liên kết video'}>
                    {song.youtubeUrl ? song.youtubeUrl : 'Chưa liên kết video'}
                  </span>
                </div>
                {song.youtubeUrl ? (
                  <button
                    onClick={() => {
                      setShowSongInfo(false);
                      setShowYoutubePanel(true);
                      setPlayerMode('video');
                    }}
                    className="px-2.5 py-1.5 bg-red-50 border border-red-200 text-red-700 text-[10px] font-bold rounded-lg hover:bg-red-100 transition active:scale-95 shrink-0"
                  >
                    Mở Player
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setShowSongInfo(false);
                      setShowYoutubePanel(true);
                      setIsEditingLink(true);
                    }}
                    className="px-2.5 py-1.5 bg-stone-100 border border-stone-200 text-stone-750 text-[10px] font-bold rounded-lg hover:bg-stone-200 transition active:scale-95 shrink-0"
                  >
                    Thêm Link
                  </button>
                )}
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
    </div>
  );
}
