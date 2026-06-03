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

  // Minor chords
  'Cm': { frets: [-1, 3, 5, 5, 4, 3], fingers: [0, 1, 3, 4, 2, 1], bar: 3 },
  'Dm': { frets: [-1, -1, 0, 2, 3, 1], fingers: [0, 0, 0, 2, 3, 1] },
  'Em': { frets: [0, 2, 2, 0, 0, 0], fingers: [0, 2, 3, 0, 0, 0] },
  'Fm': { frets: [1, 3, 3, 1, 1, 1], fingers: [1, 3, 4, 1, 1, 1], bar: 1 },
  'Gm': { frets: [3, 5, 5, 3, 3, 3], fingers: [1, 3, 4, 1, 1, 1], bar: 3 },
  'Am': { frets: [-1, 0, 2, 2, 1, 0], fingers: [0, 0, 2, 3, 1, 0] },
  'Bm': { frets: [-1, 2, 4, 4, 3, 2], fingers: [0, 1, 3, 4, 2, 1], bar: 2 },

  // Seventh chords
  'C7': { frets: [-1, 3, 2, 3, 1, 0], fingers: [0, 3, 2, 4, 1, 0] },
  'D7': { frets: [-1, -1, 0, 2, 1, 2], fingers: [0, 0, 0, 2, 1, 3] },
  'E7': { frets: [0, 2, 0, 1, 3, 0], fingers: [0, 2, 0, 1, 4, 0] },
  'F7': { frets: [1, 3, 1, 2, 1, 1], fingers: [1, 3, 1, 2, 1, 1], bar: 1 },
  'G7': { frets: [3, 2, 0, 0, 0, 1], fingers: [3, 2, 0, 0, 0, 1] },
  'A7': { frets: [-1, 0, 2, 0, 2, 0], fingers: [0, 0, 1, 0, 2, 0] },
  'B7': { frets: [-1, 2, 1, 2, 0, 2], fingers: [0, 2, 1, 3, 0, 4] },

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

// Map flat roots to sharp equivalents
const FLAT_TO_SHARP = {
  'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#'
};

/**
 * Normalizes a chord symbol to find it in the CHORD_DB
 * E.g., Bb -> A#, C#m7 -> C#m, Dsus4 -> Dsus4
 */
function findChordData(chordName) {
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
  if (CHORD_DB[name]) return { data: CHORD_DB[name], label: chordName };

  // 2. Map standard variations
  // If it's a minor 9th, sus, etc., strip extensions but keep m if minor
  const isMinor = name.includes('m') && !name.includes('maj');
  const baseRoot = name[0] + (name[1] === '#' ? '#' : '');

  // fallback to base minor or base major
  const fallbackKey = isMinor ? `${baseRoot}m` : baseRoot;
  if (CHORD_DB[fallbackKey]) {
    return { data: CHORD_DB[fallbackKey], label: `${chordName} (shape: ${fallbackKey})` };
  }

  return null;
}

export default function ChordDiagram({ chord }) {
  const resolved = findChordData(chord);
  if (!resolved) {
    return (
      <div className="chord-diagram-not-found">
        <p className="text-xs text-amber-500 font-semibold mb-1">Chord Shape</p>
        <div className="w-24 h-24 border border-zinc-800 rounded flex items-center justify-center text-center p-2 bg-zinc-950">
          <span className="text-[10px] text-zinc-500">Shape for "{chord}" not available</span>
        </div>
      </div>
    );
  }

  const { data, label } = resolved;
  const { frets, fingers, bar } = data;

  // Render SVG parameters
  const stringCount = 6;
  const fretCount = 5;
  const startX = 20;
  const startY = 30;
  const spacingX = 16;
  const spacingY = 22;

  // Find the lowest fret to display (for chords that start higher up the fretboard)
  const nonMutedFrets = frets.filter(f => f > 0);
  const minFret = nonMutedFrets.length > 0 ? Math.min(...nonMutedFrets) : 0;
  
  // Decide starting fret number
  // If the chord has frets higher than 4, shift the window down
  let fretOffset = 0;
  const maxFret = Math.max(...frets);
  if (maxFret > 4) {
    fretOffset = minFret;
  }

  return (
    <div className="chord-diagram-card bg-white border border-zinc-200 rounded p-3 flex flex-col items-center select-none shadow-xl">
      <span className="text-sm font-bold text-red-600 mb-2 font-mono tracking-wide">{label}</span>
      <svg width="120" height="150" viewBox="0 0 120 150" className="overflow-visible">
        {/* Draw Fretboard Background Grid */}
        
        {/* Frets (horizontal lines) */}
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
              strokeWidth={i === 0 && fretOffset === 0 ? "3" : "1.2"} // thick nut line if fret 1
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
            // Muted string (X)
            return (
              <text key={`mute-${stringIndex}`} x={x} y={y} fill="#ef4444" fontSize="10" textAnchor="middle" fontWeight="bold">
                ×
              </text>
            );
          } else if (fret === 0) {
            // Open string (O)
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
              // Find strings covered by the bar (usually from the first string played)
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
                  fill="#dc2626"
                  opacity="0.85"
                />
              );
            }
            return null;
          })()
        )}

        {/* Finger Dots */}
        {frets.map((fret, stringIndex) => {
          if (fret <= 0) return null; // skip open/muted
          
          const fretPos = fret - fretOffset;
          if (fretPos < 0 || fretPos >= fretCount) return null; // out of view

          const x = startX + stringIndex * spacingX;
          const y = startY + fretPos * spacingY - spacingY / 2;
          const finger = fingers[stringIndex];

          return (
            <g key={`dot-${stringIndex}`}>
              <circle cx={x} cy={y} r="5.5" fill="#dc2626" stroke="#ffffff" strokeWidth="1" />
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
