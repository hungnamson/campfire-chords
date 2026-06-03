import React, { useState, useEffect, useRef } from 'react';
import { Heart, ArrowLeft, Plus, Check, Minimize2, Maximize2 } from 'lucide-react';
import { transposeChord } from '../utils/transposer';
import ChordDiagram from './ChordDiagram';

export default function SongViewer({ song, onBack, onToggleFavorite, playlists, onAddSongToPlaylist, transposeOffset, setTransposeOffset }) {
  const [fontSize, setFontSize] = useState(() => {
    const saved = localStorage.getItem('campfire_font_size');
    return saved ? parseInt(saved, 10) : 16;
  });
  const [isScrolling, setIsScrolling] = useState(false);
  const [scrollSpeed, setScrollSpeed] = useState(3); // 1 to 10
  const [activeChord, setActiveChord] = useState(null);
  const [showPlaylistMenu, setShowPlaylistMenu] = useState(false);
  const [isCompact, setIsCompact] = useState(() => {
    const saved = localStorage.getItem('campfire_is_compact');
    return saved === 'true';
  });

  const scrollIntervalRef = useRef(null);
  const songContainerRef = useRef(null);

  // Persist font size and compact state changes
  useEffect(() => {
    localStorage.setItem('campfire_font_size', fontSize);
  }, [fontSize]);

  useEffect(() => {
    localStorage.setItem('campfire_is_compact', isCompact);
  }, [isCompact]);

  // Reset states when song changes
  useEffect(() => {
    setIsScrolling(false);
    setActiveChord(null);
  }, [song]);

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
      setActiveChord(chord);
    }
  };

  // Close chord popup when clicking anywhere else
  useEffect(() => {
    const handleClose = () => setActiveChord(null);
    window.addEventListener('click', handleClose);
    return () => window.removeEventListener('click', handleClose);
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

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Font Group */}
          <div className="flex items-center gap-1 bg-white border border-stone-200 rounded-lg p-0.5 shadow-sm">
            <button 
              onClick={() => setFontSize(prev => Math.max(10, prev - 1))}
              className="w-7 h-7 flex items-center justify-center rounded hover:bg-stone-100 text-stone-600 active:scale-95 transition font-semibold text-xs"
              title="Decrease font size"
            >
              A-
            </button>
            <span className="text-[10px] font-mono font-bold text-stone-400 min-w-[26px] text-center">
              {fontSize}px
            </span>
            <button 
              onClick={() => setFontSize(prev => Math.min(30, prev + 1))}
              className="w-7 h-7 flex items-center justify-center rounded hover:bg-stone-100 text-stone-600 active:scale-95 transition font-semibold text-xs"
              title="Increase font size"
            >
              A+
            </button>
          </div>

          {/* Compact View Toggle */}
          <button 
            onClick={() => setIsCompact(!isCompact)}
            className={`w-7 h-7 flex items-center justify-center border rounded-lg active:scale-95 transition shadow-sm ${
              isCompact 
                ? 'bg-amber-50 border-amber-200 text-amber-600' 
                : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-100'
            }`}
            title={isCompact ? "Standard View" : "Compact View"}
          >
            {isCompact ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
          </button>

          <div className="h-5 w-px bg-stone-200 mx-0.5 sm:mx-1"></div>

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
      <main className={`flex-grow transition-all duration-200 ${isCompact ? 'p-2 md:p-3' : 'p-4 md:p-6'}`}>
        <div className={`max-w-4xl mx-auto bg-white border border-stone-200/85 rounded-2xl shadow-md select-text transition-all duration-200 ${
          isCompact ? 'p-3 md:p-4' : 'p-6 md:p-8'
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
                          [{chunk.chord}]
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

      {/* Popover Chord Diagram */}
      {activeChord && (
        <div 
          className="fixed bottom-24 right-6 z-50 shadow-2xl animate-fade-in"
          onClick={(e) => e.stopPropagation()}
        >
          <ChordDiagram chord={activeChord} />
        </div>
      )}
    </div>
  );
}
