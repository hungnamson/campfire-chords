import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { Heart, ArrowLeft, Plus, Check, Minimize2, Maximize2, Info, ExternalLink, X } from 'lucide-react';
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
  onSaveToLibrary,
  isSavingToLibrary,
}) {
  const [isScrolling, setIsScrolling] = useState(false);
  const [scrollSpeed, setScrollSpeed] = useState(3); // 1 to 10
  const [activeChord, setActiveChord] = useState(null);
  const [showPlaylistMenu, setShowPlaylistMenu] = useState(false);
  const [popupPosition, setPopupPosition] = useState({ x: 0, y: 0 });
  const [showSongInfo, setShowSongInfo] = useState(false);
  const [keepScreenAwake, setKeepScreenAwake] = useState(true);
  const wakeLockRef = useRef(null);



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
      // Mobile Mode: 1 column, fit to screen size
      
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
    if (localIsCompact && !hasChords) {
      return { isEmpty: true };
    }

    const chunks = [];

    if (localIsCompact) {
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
    const handleClose = () => setActiveChord(null);
    window.addEventListener('click', handleClose);
    window.addEventListener('scroll', handleClose);
    return () => {
      window.removeEventListener('click', handleClose);
      window.removeEventListener('scroll', handleClose);
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

  return (
    <div className="song-viewer-container flex flex-col min-h-screen text-stone-900 bg-stone-100 md:bg-white pb-28 animate-fade-in w-full md:w-[90vw] md:max-w-[90vw] self-center mx-auto md:shadow-lg md:border-x md:border-stone-200/80 cursor-default" ref={songContainerRef} onClick={(e) => e.stopPropagation()}>
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

        {song.rhythm && song.rhythm.trim() && song.rhythm.toLowerCase().trim() !== 'chưa xác định' && (
          <div className="flex items-center justify-center mx-2 shrink-0">
            <span className="px-2.5 py-0.5 bg-stone-200/50 border border-stone-300/60 rounded-full text-[10px] font-black text-stone-600 uppercase tracking-wider select-none">
              {song.rhythm.trim()}
            </span>
          </div>
        )}

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
                if (localIsCompact) return null;
                return <div key={index} className="h-5"></div>;
              }

              if (parsed.isComment) {
                return (
                  <div key={index} className={`comment-line ${(localIsCompact || isMobile) ? 'compact' : ''}`}>
                    {parsed.text}
                  </div>
                );
              }

              return (
                <div key={index} className={`lyric-line-inline ${(localIsCompact || isMobile) ? 'compact' : ''}`}>
                  {parsed.chunks.map((chunk, chunkIdx) => (
                    <React.Fragment key={chunkIdx}>
                      {chunk.chord && (
                        <span
                          onClick={(e) => handleChordClick(chunk.chord, e)}
                          className={`chord-inline ${(localIsCompact || isMobile) ? 'compact' : ''}`}
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
    </div>
  );
}
