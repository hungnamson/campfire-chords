import { transposeChord, transposeChordPro } from './frontend/src/utils/transposer.js';
import { convertToChordPro } from './server.js';
import assert from 'assert';

console.log('🧪 Running Verification Tests...');

try {
  // Test 1: Chord Transposition
  console.log('\nTesting Chord Transposer...');
  
  // Basic major/minor shifts
  assert.strictEqual(transposeChord('C', 2), 'D');
  assert.strictEqual(transposeChord('Am', -2), 'Gm');
  
  // Sharps and flats retention
  assert.strictEqual(transposeChord('F#', 1), 'G');
  assert.strictEqual(transposeChord('Bb', 2), 'C'); // Bb preferSharps = false, wait, Bb shifts by 2:
  // Bb is index 10. + 2 = 12 = index 0. Note is C.
  assert.strictEqual(transposeChord('Bb', 2), 'C');
  
  // Slash chords
  assert.strictEqual(transposeChord('C/E', 1), 'C#/F'); // preferSharps is true since C has no 'b'
  assert.strictEqual(transposeChord('Ab/C', 2), 'Bb/D'); // preferSharps is false since Ab has a 'b'
  
  // Extensions
  assert.strictEqual(transposeChord('Am7b5', 2), 'Bm7b5');
  assert.strictEqual(transposeChord('Dsus4', -1), 'C#sus4');
  
  console.log('✅ Transposer Tests Passed!');

  // Test 2: ChordPro Transposer
  console.log('\nTesting ChordPro Transposer...');
  const originalChordPro = '1. Lần [Am]đầu ta gặp [G]nhỏ, trong [Em]nắng chiều bay [Am]bay';
  const shiftedChordPro = transposeChordPro(originalChordPro, 2);
  assert.strictEqual(shiftedChordPro, '1. Lần [Bm]đầu ta gặp [A]nhỏ, trong [F#m]nắng chiều bay [Bm]bay');
  console.log('✅ ChordPro Transposer Tests Passed!');

  // Test 3: Chords-Over-Text Parser
  console.log('\nTesting Intelligent Chords-Over-Text Parser...');
  
  const rawChordsSheet = `
    C          Am
Hello there friend
  F           G7
How have you been?
`;
  const parsedChordPro = convertToChordPro(rawChordsSheet);
  
  // Output should match ChordPro syntax
  console.log('Generated ChordPro:\n', parsedChordPro);
  assert.ok(parsedChordPro.includes('Hell[C]o there fri[Am]end'));
  assert.ok(parsedChordPro.includes('Ho[F]w have you b[G7]een?'));
  
  console.log('✅ Chords-Over-Text Parser Tests Passed!');

  // Test 4: Broad Search Matching Logic
  console.log('\nTesting Broad Search Matching Logic...');
  const testSong = {
    title: 'Nhỏ Ơi',
    artist: 'Chí Tài',
    composer: 'Quang Nhật',
    chordPro: 'Lần [Am]đầu ta gặp [G]nhỏ, trong [Em]nắng chiều bay [Am]bay'
  };

  const removeAccents = (str) => {
    if (!str) return '';
    return str
      .toString()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[đĐ]/g, 'd');
  };

  const matchSong = (song, queryStr) => {
    const queryTerms = removeAccents(queryStr)
      .split(/[\s\-_,.]+/)
      .map(t => t.trim())
      .filter(Boolean);
      
    if (queryTerms.length === 0) return true;
    
    const cleanLyrics = removeAccents(song.chordPro.replace(/\[[^\]]+\]/g, ''));
    const cleanTitle = removeAccents(song.title);
    const cleanArtist = removeAccents(song.artist);
    const cleanComposer = removeAccents(song.composer || '');
    
    return queryTerms.every(term => 
      cleanTitle.includes(term) ||
      cleanArtist.includes(term) ||
      cleanComposer.includes(term) ||
      cleanLyrics.includes(term)
    );
  };

  // Queries that should match
  assert.ok(matchSong(testSong, 'nho oi'));
  assert.ok(matchSong(testSong, 'chi tai'));
  assert.ok(matchSong(testSong, 'quang nhat'));
  assert.ok(matchSong(testSong, 'nho oi chi tai'));
  assert.ok(matchSong(testSong, 'quang nhat nho oi'));
  assert.ok(matchSong(testSong, 'nang chieu bay bay'));
  
  // Queries that should NOT match
  assert.strictEqual(matchSong(testSong, 'Yesterday Beatles'), false);
  assert.strictEqual(matchSong(testSong, 'quang nhat khac'), false);

  console.log('✅ Broad Search Matching Tests Passed!');

  console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY!');
  process.exit(0);

} catch (error) {
  console.error('\n❌ Test verification failed:');
  console.error(error);
  process.exit(1);
}
