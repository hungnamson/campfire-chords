import React, { useState, useEffect, useRef } from 'react';
import { Heart, ArrowLeft, Plus, Check, Minimize2, Maximize2, Info } from 'lucide-react';
import { transposeChord } from '../utils/transposer';
import ChordDiagram from './ChordDiagram';

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
  instrument
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

  // Reset states when song changes
  useEffect(() => {
    setIsScrolling(false);
    setActiveChord(null);
    setShowSongInfo(false);
    setKeepScreenAwake(true);
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
    <div className="song-viewer-container flex flex-col min-h-screen text-stone-900 bg-stone-100 pb-28 animate-fade-in" ref={songContainerRef}>
      {/* Sub Header / Action bar */}
      <header className={`sticky top-0 z-30 bg-[#f5f3ef]/90 backdrop-blur border-b border-stone-200 flex items-center justify-between shadow-sm transition-all duration-200 ${
        isCompact ? 'px-3 py-1.5' : 'px-4 py-3'
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
              isCompact ? 'text-sm' : 'text-base'
            }`}>{song.title}</h1>
            <p className={`text-stone-500 truncate max-w-[100px] xs:max-w-[150px] sm:max-w-xs transition-all duration-205 ${
              isCompact ? 'text-[10px]' : 'text-xs'
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
              song.isFavorite ? 'text-red-600' : 'text-stone-400 hover:text-stone-700'
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

      {/* Main card container */}
      <main className={`flex-grow transition-all duration-200 ${isCompact ? 'px-3.5 py-2 md:p-3' : 'px-4.5 py-4 md:p-6'}`}>
        <div className={`max-w-4xl mx-auto bg-white border border-stone-200/85 rounded-2xl shadow-md select-text transition-all duration-200 ${
          isCompact ? 'py-3 px-[24px] sm:px-6' : 'py-6 px-[32px] sm:px-[34px] md:py-8'
        }`}>
          {/* Inline chords song sheet */}
          <div 
            className="song-lyrics-sheet select-text" 
            style={{ fontSize: `${fontSize}px` }}
          >
            {lines.map((line, index) => {
              const parsed = parseLine(line);

              if (parsed.isEmpty) {
                return <div key={index} className={isCompact ? "h-2" : "h-5"}></div>;
              }

              if (parsed.isComment) {
                return (
                  <div key={index} className={`comment-line ${isCompact ? 'compact' : ''}`}>
                    {parsed.text}
                  </div>
                );
              }

              return (
                <div key={index} className={`lyric-line-inline ${isCompact ? 'compact' : ''}`}>
                  {parsed.chunks.map((chunk, chunkIdx) => (
                    <React.Fragment key={chunkIdx}>
                      {chunk.chord && (
                        <span
                          onClick={(e) => handleChordClick(chunk.chord, e)}
                          className={`chord-inline ${isCompact ? 'compact' : ''}`}
                        >
                          {isCompact ? chunk.chord : `[${chunk.chord}]`}
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
          <div className="bg-white border border-stone-200/80 rounded-2xl max-w-sm w-full p-5 shadow-2xl relative select-none" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-stone-100 pb-3 mb-4">
              <div>
                <h3 className="font-bold text-stone-900 text-base leading-tight">{song.title}</h3>
                <p className="text-xs text-stone-500 mt-1">{song.artist}</p>
              </div>
              <button
                onClick={() => setShowSongInfo(false)}
                className="p-1 rounded-full hover:bg-stone-100 text-stone-400 hover:text-stone-750 transition"
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
