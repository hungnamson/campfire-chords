import React from 'react';

// Fret positions for standard guitar chords (6 values for strings: E, A, D, G, B, e)
// -1 represents a muted/unplayed string. 0 represents an open string.
// fingers: finger numbers (1=index, 2=middle, 3=ring, 4=pinky, 0=none)
// bar: starting fret of the barre (optional)
const CHORD_DB = {
  // Major chords
  'C': { frets: [-1, 3, 2, 0, 1, 0], fingers: [0, 3, 2, 0, 1, 0] },
  'D': { frets: [-1, -1, 0, 2, 3, 2], fingers: [0, 0, 0, 1, 3, 2] },
  'E': { frets: [0, 2, 2, 1, 0, 0], fingers: [0, 2, 3, 1, 0, 0] },
  'F': { frets: [1, 3, 3, 2, 1, 1], fingers: [1, 3, 4, 2, 1, 1], bar: 1 },
  'G': { frets: [3, 2, 0, 0, 0, 3], fingers: [3, 2, 0, 0, 0, 4] },
  'A': { frets: [-1, 0, 2, 2, 2, 0], fingers: [0, 0, 1, 2, 3, 0] },
  'B': { frets: [-1, 2, 4, 4, 4, 2], fingers: [0, 1, 2, 3, 4, 1], bar: 2 },

  // Sharp/Flat Majors
  'C#': { frets: [-1, 4, 6, 6, 6, 4], fingers: [0, 1, 3, 3, 3, 1], bar: 4 },
  'D#': { frets: [-1, 6, 8, 8, 8, 6], fingers: [0, 1, 3, 3, 3, 1], bar: 6 },
  'F#': { frets: [2, 4, 4, 3, 2, 2], fingers: [1, 3, 4, 2, 1, 1], bar: 2 },
  'G#': { frets: [4, 6, 6, 5, 4, 4], fingers: [1, 3, 4, 2, 1, 1], bar: 4 },
  'A#': { frets: [-1, 1, 3, 3, 3, 1], fingers: [0, 1, 3, 3, 3, 1], bar: 1 },

  // Minor chords
  'Cm': { frets: [-1, 3, 5, 5, 4, 3], fingers: [0, 1, 3, 4, 2, 1], bar: 3 },
  'Dm': { frets: [-1, -1, 0, 2, 3, 1], fingers: [0, 0, 0, 2, 3, 1] },
  'Em': { frets: [0, 2, 2, 0, 0, 0], fingers: [0, 2, 3, 0, 0, 0] },
  'Fm': { frets: [1, 3, 3, 1, 1, 1], fingers: [1, 3, 4, 1, 1, 1], bar: 1 },
  'Gm': { frets: [3, 5, 5, 3, 3, 3], fingers: [1, 3, 4, 1, 1, 1], bar: 3 },
  'Am': { frets: [-1, 0, 2, 2, 1, 0], fingers: [0, 0, 2, 3, 1, 0] },
  'Bm': { frets: [-1, 2, 4, 4, 3, 2], fingers: [0, 1, 3, 4, 2, 1], bar: 2 },

  // Sharp/Flat Minors
  'C#m': { frets: [-1, 4, 6, 6, 5, 4], fingers: [0, 1, 3, 4, 2, 1], bar: 4 },
  'D#m': { frets: [-1, 6, 8, 8, 7, 6], fingers: [0, 1, 3, 4, 2, 1], bar: 6 },
  'F#m': { frets: [2, 4, 4, 2, 2, 2], fingers: [1, 3, 4, 1, 1, 1], bar: 2 },
  'G#m': { frets: [4, 6, 6, 4, 4, 4], fingers: [1, 3, 4, 1, 1, 1], bar: 4 },
  'A#m': { frets: [-1, 1, 3, 3, 2, 1], fingers: [0, 1, 3, 4, 2, 1], bar: 1 },

  // Seventh chords
  'C7': { frets: [-1, 3, 2, 3, 1, 0], fingers: [0, 3, 2, 4, 1, 0] },
  'D7': { frets: [-1, -1, 0, 2, 1, 2], fingers: [0, 0, 0, 2, 1, 3] },
  'E7': { frets: [0, 2, 0, 1, 3, 0], fingers: [0, 2, 0, 1, 4, 0] },
  'F7': { frets: [1, 3, 1, 2, 1, 1], fingers: [1, 3, 1, 2, 1, 1], bar: 1 },
  'G7': { frets: [3, 2, 0, 0, 0, 1], fingers: [3, 2, 0, 0, 0, 1] },
  'A7': { frets: [-1, 0, 2, 0, 2, 0], fingers: [0, 0, 1, 0, 2, 0] },
  'B7': { frets: [-1, 2, 1, 2, 0, 2], fingers: [0, 2, 1, 3, 0, 4] },

  // Sharp/Flat Sevenths
  'C#7': { frets: [-1, 4, 6, 4, 6, 4], fingers: [0, 1, 3, 1, 4, 1], bar: 4 },
  'D#7': { frets: [-1, 6, 8, 6, 8, 6], fingers: [0, 1, 3, 1, 4, 1], bar: 6 },
  'F#7': { frets: [2, 4, 2, 3, 2, 2], fingers: [1, 3, 1, 2, 1, 1], bar: 2 },
  'G#7': { frets: [4, 6, 4, 5, 4, 4], fingers: [1, 3, 1, 2, 1, 1], bar: 4 },
  'A#7': { frets: [-1, 1, 3, 1, 3, 1], fingers: [0, 1, 3, 1, 4, 1], bar: 1 },

  // Minor Seventh chords
  'Am7': { frets: [-1, 0, 2, 0, 1, 0], fingers: [0, 0, 2, 0, 1, 0] },
  'Dm7': { frets: [-1, -1, 0, 2, 1, 1], fingers: [0, 0, 0, 2, 1, 1], bar: 1 },
  'Em7': { frets: [0, 2, 0, 0, 0, 0], fingers: [0, 2, 0, 0, 0, 0] },
  'Bm7': { frets: [-1, 2, 4, 2, 3, 2], fingers: [0, 1, 3, 1, 2, 1], bar: 2 },

  // Major Seventh & Suspended
  'Cmaj7': { frets: [-1, 3, 2, 0, 0, 0], fingers: [0, 3, 2, 0, 0, 0] },
  'Fmaj7': { frets: [-1, -1, 3, 2, 1, 0], fingers: [0, 0, 3, 2, 1, 0] },
  'Dsus4': { frets: [-1, -1, 0, 2, 3, 3], fingers: [0, 0, 0, 1, 3, 4] },
  'Asus4': { frets: [-1, 0, 2, 2, 3, 0], fingers: [0, 0, 1, 2, 4, 0] }
};

// Fret positions for standard ukulele G-C-E-A chords (4 strings)
const UKULELE_DB = {
  // Major chords
  'C': { frets: [0, 0, 0, 3], fingers: [0, 0, 0, 3] },
  'D': { frets: [2, 2, 2, 0], fingers: [1, 2, 3, 0] },
  'E': { frets: [4, 4, 4, 2], fingers: [3, 3, 3, 1], bar: 2 },
  'F': { frets: [2, 0, 1, 0], fingers: [2, 0, 1, 0] },
  'G': { frets: [0, 2, 3, 2], fingers: [0, 1, 3, 2] },
  'A': { frets: [2, 1, 0, 0], fingers: [2, 1, 0, 0] },
  'B': { frets: [4, 3, 2, 2], fingers: [3, 2, 1, 1], bar: 2 },

  // Sharp/Flat Majors
  'C#': { frets: [1, 1, 1, 4], fingers: [1, 1, 1, 4], bar: 1 },
  'D#': { frets: [3, 3, 3, 1], fingers: [3, 3, 3, 1], bar: 3 },
  'F#': { frets: [3, 1, 2, 1], fingers: [3, 1, 2, 1], bar: 1 },
  'G#': { frets: [5, 3, 4, 3], fingers: [3, 1, 2, 1], bar: 3 },
  'A#': { frets: [1, 2, 1, 1], fingers: [1, 2, 1, 1], bar: 1 },

  // Minor chords
  'Cm': { frets: [0, 3, 3, 3], fingers: [0, 1, 1, 1], bar: 3 },
  'Dm': { frets: [2, 2, 1, 0], fingers: [2, 3, 1, 0] },
  'Em': { frets: [0, 4, 3, 2], fingers: [0, 3, 2, 1] },
  'Fm': { frets: [1, 0, 1, 3], fingers: [1, 0, 2, 4] },
  'Gm': { frets: [0, 2, 3, 1], fingers: [0, 2, 3, 1] },
  'Am': { frets: [2, 0, 0, 0], fingers: [2, 0, 0, 0] },
  'Bm': { frets: [4, 2, 2, 2], fingers: [3, 1, 1, 1], bar: 2 },

  // Sharp/Flat Minors
  'C#m': { frets: [1, 1, 0, 4], fingers: [1, 1, 0, 4] },
  'D#m': { frets: [3, 3, 2, 1], fingers: [3, 4, 2, 1] },
  'F#m': { frets: [2, 1, 2, 0], fingers: [2, 1, 3, 0] },
  'G#m': { frets: [4, 3, 4, 2], fingers: [3, 2, 4, 1] },
  'A#m': { frets: [3, 1, 1, 1], fingers: [3, 1, 1, 1], bar: 1 },

  // Seventh chords
  'C7': { frets: [0, 0, 0, 1], fingers: [0, 0, 0, 1] },
  'D7': { frets: [2, 0, 2, 0], fingers: [1, 0, 2, 0] },
  'E7': { frets: [1, 2, 0, 2], fingers: [1, 2, 0, 3] },
  'F7': { frets: [2, 3, 1, 0], fingers: [2, 3, 1, 0] },
  'G7': { frets: [0, 2, 1, 2], fingers: [0, 2, 1, 3] },
  'A7': { frets: [1, 0, 0, 0], fingers: [1, 0, 0, 0] },
  'B7': { frets: [2, 3, 2, 2], fingers: [1, 2, 1, 1], bar: 2 },

  // Sharp/Flat Sevenths
  'C#7': { frets: [1, 1, 1, 2], fingers: [1, 1, 1, 2], bar: 1 },
  'D#7': { frets: [3, 1, 3, 1], fingers: [3, 1, 3, 1], bar: 1 },
  'F#7': { frets: [2, 4, 2, 4], fingers: [1, 3, 2, 4] },
  'G#7': { frets: [1, 3, 2, 3], fingers: [1, 3, 2, 4] },
  'A#7': { frets: [1, 2, 0, 1], fingers: [1, 3, 0, 2] },

  // Minor Seventh chords
  'Am7': { frets: [0, 0, 0, 0], fingers: [0, 0, 0, 0] },
  'Dm7': { frets: [2, 2, 1, 3], fingers: [2, 3, 1, 4] },
  'Em7': { frets: [0, 2, 0, 2], fingers: [0, 1, 0, 2] },
  'Bm7': { frets: [2, 2, 2, 2], fingers: [1, 1, 1, 1], bar: 2 },

  // Major Seventh & Suspended
  'Cmaj7': { frets: [0, 0, 0, 2], fingers: [0, 0, 0, 2] },
  'Fmaj7': { frets: [2, 4, 1, 3], fingers: [2, 4, 1, 3] },
  'Dsus4': { frets: [0, 2, 3, 0], fingers: [0, 1, 2, 0] },
  'Asus4': { frets: [2, 2, 0, 0], fingers: [1, 2, 0, 0] }
};

// Map flat roots to sharp equivalents
const FLAT_TO_SHARP = {
  'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#'
};

// Semitone offsets for Piano notes
const PIANO_ROOTS = {
  'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3,
  'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8,
  'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11
};

/**
 * Normalizes a chord symbol to find it in the provided database
 */
function findChordData(chordName, db) {
  let name = chordName.trim();
  
  // Strip any slash chord base (e.g. C/E -> C)
  if (name.includes('/')) {
    name = name.split('/')[0];
  }

  // Normalize flat to sharp at start
  let root = name[0];
  let rest = name.slice(1);
  if (name[1] === 'b') {
    const flatRoot = name.slice(0, 2);
    root = FLAT_TO_SHARP[flatRoot] || flatRoot;
    rest = name.slice(2);
  }
  name = `${root}${rest}`;

  // 1. Direct match
  if (db[name]) return { data: db[name], label: chordName };

  // 2. Map standard variations
  const isMinor = name.includes('m') && !name.includes('maj');
  const baseRoot = name[0] + (name[1] === '#' ? '#' : '');

  // fallback to base minor or base major
  const fallbackKey = isMinor ? `${baseRoot}m` : baseRoot;
  if (db[fallbackKey]) {
    return { data: db[fallbackKey], label: `${chordName} (shape: ${fallbackKey})` };
  }

  return null;
}

/**
 * Parses a chord and computes semitone offsets for piano keyboard visualizer
 */
function getPianoNotes(chordName) {
  let name = chordName.trim();
  if (name.includes('/')) {
    name = name.split('/')[0];
  }
  
  let root = '';
  let suffix = '';
  
  if (name.length >= 2 && (name[1] === '#' || name[1] === 'b')) {
    root = name.slice(0, 2);
    suffix = name.slice(2);
  } else {
    root = name[0];
    suffix = name.slice(1);
  }
  
  const rootIdx = PIANO_ROOTS[root];
  if (rootIdx === undefined) return [];
  
  let intervals = [0, 4, 7]; // default major
  if (suffix === 'm' || suffix === 'min' || suffix.startsWith('m-') || suffix.startsWith('m/')) {
    intervals = [0, 3, 7];
  } else if (suffix === '7') {
    intervals = [0, 4, 7, 10];
  } else if (suffix === 'm7' || suffix === 'min7') {
    intervals = [0, 3, 7, 10];
  } else if (suffix === 'maj7' || suffix === 'M7') {
    intervals = [0, 4, 7, 11];
  } else if (suffix === 'sus4') {
    intervals = [0, 5, 7];
  } else if (suffix === 'sus2') {
    intervals = [0, 2, 7];
  } else if (suffix === 'dim') {
    intervals = [0, 3, 6];
  } else if (suffix === 'dim7') {
    intervals = [0, 3, 6, 9];
  } else if (suffix === 'aug') {
    intervals = [0, 4, 8];
  } else if (suffix === '6') {
    intervals = [0, 4, 7, 9];
  } else if (suffix === 'm6') {
    intervals = [0, 3, 7, 9];
  } else if (suffix === 'm7b5') {
    intervals = [0, 3, 6, 10];
  } else if (suffix === '9') {
    intervals = [0, 4, 7, 10, 14];
  } else if (suffix === 'm9') {
    intervals = [0, 3, 7, 10, 14];
  } else if (suffix === 'maj9') {
    intervals = [0, 4, 7, 11, 14];
  } else if (suffix === 'add9') {
    intervals = [0, 4, 7, 14];
  } else if (suffix === 'madd9') {
    intervals = [0, 3, 7, 14];
  }
  
  // Calculate absolute indices in a 2-octave piano range (0-23)
  const notes = intervals.map(interval => rootIdx + interval);
  
  // Wrap and fit within keyboard octaves
  return notes.map(n => {
    let val = n;
    while (val < 0) val += 12;
    while (val >= 24) val -= 12;
    return val;
  });
}

function renderCardHeader(chordName, instrument) {
  const instLabel = instrument === 'ukulele' ? 'Ukulele Chords' : instrument === 'piano' ? 'Piano Keyboard' : 'Guitar Chords';
  return (
    <div className="flex flex-col items-center mb-3 text-center select-none">
      <span className="text-[9px] uppercase font-bold tracking-widest text-zinc-400 leading-none mb-1">
        {instLabel}
      </span>
      <span className="text-xl font-black text-blue-dark font-mono tracking-wide leading-none">
        {chordName}
      </span>
    </div>
  );
}

function renderPianoDiagram(chord) {
  const notes = getPianoNotes(chord);
  
  // 14 white keys spanning C4 to B5 (semitone values 0 to 23)
  const whiteKeys = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21, 23];
  
  // 10 black keys and their respective layout X offsets
  const blackKeys = [
    { note: 1, xOffset: 8 },    // C#4
    { note: 3, xOffset: 20 },   // D#4
    { note: 6, xOffset: 44 },   // F#4
    { note: 8, xOffset: 56 },   // G#4
    { note: 10, xOffset: 68 },  // A#4
    { note: 13, xOffset: 92 },  // C#5
    { note: 15, xOffset: 104 }, // D#5
    { note: 18, xOffset: 128 }, // F#5
    { note: 20, xOffset: 140 }, // G#5
    { note: 22, xOffset: 152 }  // A#5
  ];

  const startX = 6;
  const startY = 10;
  const whiteWidth = 12;
  const whiteHeight = 50;
  const blackWidth = 8;
  const blackHeight = 30;

  return (
    <div className="chord-diagram-card bg-white border border-zinc-200 rounded p-3 flex flex-col items-center select-none shadow-xl min-w-[180px]">
      {renderCardHeader(chord, 'piano')}
      <svg width="180" height="70" viewBox="0 0 180 70" className="overflow-visible">
        {/* Draw White Keys */}
        {whiteKeys.map((noteVal, i) => {
          const x = startX + i * whiteWidth;
          const isPressed = notes.includes(noteVal);
          return (
            <rect
              key={`white-${i}`}
              x={x}
              y={startY}
              width={whiteWidth}
              height={whiteHeight}
              fill={isPressed ? "#1e3a8a" : "#ffffff"}
              stroke="#d4d4d8"
              strokeWidth="1"
              rx="1.5"
            />
          );
        })}

        {/* Draw Black Keys */}
        {blackKeys.map((bk, i) => {
          const x = startX + bk.xOffset;
          const isPressed = notes.includes(bk.note);
          return (
            <rect
              key={`black-${i}`}
              x={x}
              y={startY}
              width={bk.xOffset === 0 ? 0 : blackWidth} // guard
              height={blackHeight}
              fill={isPressed ? "#1e3a8a" : "#18181b"}
              stroke={isPressed ? "#172554" : "#09090b"}
              strokeWidth="1"
              rx="1"
            />
          );
        })}
      </svg>
    </div>
  );
}

export default function ChordDiagram({ chord, instrument = 'guitar' }) {
  // Render Piano
  if (instrument === 'piano') {
    return renderPianoDiagram(chord);
  }

  // Stringed instruments (Guitar / Ukulele)
  const isUke = instrument === 'ukulele';
  const db = isUke ? UKULELE_DB : CHORD_DB;
  
  const resolved = findChordData(chord, db);
  if (!resolved) {
    return (
      <div className="chord-diagram-card bg-white border border-zinc-200 rounded p-3 flex flex-col items-center select-none shadow-xl">
        {renderCardHeader(chord, instrument)}
        <div className="w-24 h-24 border border-zinc-200 rounded flex items-center justify-center text-center p-2 bg-zinc-50">
          <span className="text-[10px] text-zinc-400">Shape not available</span>
        </div>
      </div>
    );
  }

  const { data, label } = resolved;
  const { frets, fingers, bar } = data;

  // Render SVG parameters based on instrument
  const stringCount = isUke ? 4 : 6;
  const fretCount = 5;
  const startX = isUke ? 30 : 20;
  const startY = 30;
  const spacingX = isUke ? 20 : 16;
  const spacingY = 22;

  // Find lowest fret to display (for shifting key view higher up the fretboard)
  const nonMutedFrets = frets.filter(f => f > 0);
  const minFret = nonMutedFrets.length > 0 ? Math.min(...nonMutedFrets) : 0;
  
  let fretOffset = 0;
  const maxFret = Math.max(...frets);
  if (maxFret > 4) {
    fretOffset = minFret;
  }

  return (
    <div className="chord-diagram-card bg-white border border-zinc-200 rounded p-3 flex flex-col items-center select-none shadow-xl">
      {renderCardHeader(label, instrument)}
      <svg width="120" height="150" viewBox="0 0 120 150" className="overflow-visible">
        {/* Draw Frets (horizontal lines) */}
        {Array.from({ length: fretCount }).map((_, i) => {
          const y = startY + i * spacingY;
          return (
            <line
              key={`fret-${i}`}
              x1={startX}
              y1={y}
              x2={startX + (stringCount - 1) * spacingX}
              y2={y}
              stroke={i === 0 && fretOffset === 0 ? "#27272a" : "#d4d4d8"}
              strokeWidth={i === 0 && fretOffset === 0 ? "3" : "1.2"}
            />
          );
        })}

        {/* Fret number text if shifted */}
        {fretOffset > 0 && (
          <text
            x={startX - 10}
            y={startY + spacingY / 2 + 5}
            fill="#71717a"
            fontSize="9"
            fontWeight="bold"
            textAnchor="middle"
          >
            {fretOffset}fr
          </text>
        )}

        {/* Strings (vertical lines) */}
        {Array.from({ length: stringCount }).map((_, i) => {
          const x = startX + i * spacingX;
          return (
            <line
              key={`str-${i}`}
              x1={x}
              y1={startY}
              x2={x}
              y2={startY + (fretCount - 1) * spacingY}
              stroke="#a1a1aa"
              strokeWidth="1.2"
            />
          );
        })}

        {/* Draw Open / Muted labels at the top */}
        {frets.map((fret, stringIndex) => {
          const x = startX + stringIndex * spacingX;
          const y = startY - 8;
          if (fret === -1) {
            return (
              <text key={`mute-${stringIndex}`} x={x} y={y} fill="#ef4444" fontSize="10" textAnchor="middle" fontWeight="bold">
                ×
              </text>
            );
          } else if (fret === 0) {
            return (
              <circle key={`open-${stringIndex}`} cx={x} cy={y - 3} r="2.5" fill="none" stroke="#22c55e" strokeWidth="1.5" />
            );
          }
          return null;
        })}

        {/* Barre (bar) rendering if any */}
        {bar !== undefined && (
          (() => {
            const barFret = bar - fretOffset;
            if (barFret >= 0 && barFret < fretCount) {
              const y = startY + barFret * spacingY - spacingY / 2;
              let startBarIndex = frets.findIndex(f => f >= bar);
              if (startBarIndex === -1) startBarIndex = 0;
              const x1 = startX + startBarIndex * spacingX;
              const x2 = startX + (stringCount - 1) * spacingX;
              return (
                <rect
                  x={x1 - 4}
                  y={y - 4}
                  width={x2 - x1 + 8}
                  height="8"
                  rx="4"
                  fill="#1e3a8a"
                  opacity="0.85"
                />
              );
            }
            return null;
          })()
        )}

        {/* Finger Dots */}
        {frets.map((fret, stringIndex) => {
          if (fret <= 0) return null;
          
          const fretPos = fret - fretOffset;
          if (fretPos < 0 || fretPos >= fretCount) return null;

          const x = startX + stringIndex * spacingX;
          const y = startY + fretPos * spacingY - spacingY / 2;
          const finger = fingers ? fingers[stringIndex] : 0;

          return (
            <g key={`dot-${stringIndex}`}>
              <circle cx={x} cy={y} r="5.5" fill="#1e3a8a" stroke="#ffffff" strokeWidth="1" />
              {finger > 0 && (
                <text
                  x={x}
                  y={y + 3}
                  fill="#ffffff"
                  fontSize="9.5"
                  fontWeight="bold"
                  textAnchor="middle"
                >
                  {finger}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
