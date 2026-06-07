const SHARP_KEYS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const FLAT_KEYS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

// Map note names to semitone index
export const NOTE_TO_SEMITONE = {
  'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4,
  'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8, 'A': 9,
  'A#': 10, 'Bb': 10, 'B': 11
};

/**
 * Transposes a single note by a number of semitones
 * @param {string} note - The root note (e.g., 'C#', 'Bb')
 * @param {number} semitones - Shift size (-11 to 11)
 * @param {boolean} preferSharps - If true, outputs sharp instead of flat
 * @returns {string} The transposed note
 */
function transposeNote(note, semitones, preferSharps = true) {
  const index = NOTE_TO_SEMITONE[note];
  if (index === undefined) return note;

  const newIndex = (index + semitones + 24) % 12;
  const list = preferSharps ? SHARP_KEYS : FLAT_KEYS;
  return list[newIndex];
}

/**
 * Parses a chord string and transposes its root and slash notes.
 * Handles chords like Am7, C#m7b5, F#m/E, Bb/D.
 * @param {string} chord - The raw chord string (e.g. "C#m7/E")
 * @param {number} semitones - Semitone shift
 * @returns {string} The transposed chord
 */
export function transposeChord(chord, semitones) {
  if (!chord || semitones === 0) return chord;

  // Check if it's a slash chord (e.g. C/E)
  if (chord.includes('/')) {
    const [baseChord, slashNote] = chord.split('/');
    return `${transposeChord(baseChord, semitones)}/${transposeChord(slashNote, semitones)}`;
  }

  // Find root note: first char, plus sharp/flat symbol if present
  let root = chord[0];
  let suffix = chord.slice(1);

  if (chord[1] === '#' || chord[1] === 'b') {
    root = chord.slice(0, 2);
    suffix = chord.slice(2);
  }

  // Determine whether to use sharps or flats based on input root
  // E.g. if original is Bb, output Eb instead of D#
  const preferSharps = !root.includes('b');

  const transposedRoot = transposeNote(root, semitones, preferSharps);
  return `${transposedRoot}${suffix}`;
}

/**
 * Transposes a ChordPro lyrics block
 * @param {string} chordProText - Raw ChordPro formatted text
 * @param {number} semitones - Shift amount
 * @returns {string} Transposed text
 */
export function transposeChordPro(chordProText, semitones) {
  if (semitones === 0) return chordProText;

  // Regex matches anything inside brackets: [Am7], [C/E]
  return chordProText.replace(/\[([^\]]+)\]/g, (match, chord) => {
    // If the content looks like a chord (letters, sharps, flats, symbols)
    // rather than normal text comments like [Intro], transpose it.
    // Standard chord symbols start with A-G.
    if (/^[A-G]/i.test(chord.trim())) {
      try {
        return `[${transposeChord(chord.trim(), semitones)}]`;
      } catch (e) {
        return match;
      }
    }
    return match;
  });
}
