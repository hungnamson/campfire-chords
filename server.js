import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  getSongs,
  getSong,
  addSong,
  updateSong,
  deleteSong,
  toggleFavorite,
  getPlaylists,
  createPlaylist,
  addSongToPlaylist,
  removeSongFromPlaylist,
  deletePlaylist,
  runCleanup,
  getUsers,
  addUser,
  getUserFavorites,
  toggleUserFavorite,
  getPlayHistory,
  incrementPlayCount
} from './db.js';
import { scrapeUniversal } from './scraper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ----------------------------------------------------
// Intelligent Chord-Over-Text Parser
// Converts two-line text format to ChordPro format.
// ----------------------------------------------------

const CHORD_REGEX = /^[A-G][b#]?(?:m|M|maj|min|dim|aug|sus)?(?:\d|maj7|min7|sus2|sus4|add9|m7|maj9|add2|add4|6|9|11|13|maj13)*(\/[A-G][b#]?)?$/i;

function isChordToken(token) {
  // Clean token of parentheses or brackets that people might add
  const clean = token.replace(/[()\[\]]/g, '');
  return CHORD_REGEX.test(clean);
}

function isChordLine(line) {
  const tokens = line.trim().split(/\s+/).filter(t => t.length > 0);
  if (tokens.length === 0) return false;
  
  // Count how many tokens look like chords
  const chordCount = tokens.filter(isChordToken).length;
  
  // If at least 75% of the line tokens are chords, it's a chord line
  return (chordCount / tokens.length) >= 0.75;
}

export function convertToChordPro(rawText) {
  // If it already looks like ChordPro (has brackets with chords), return as is
  if (/\[[A-G][b#]?[a-z0-9]*(\/[A-G][b#]?)?\]/i.test(rawText)) {
    return rawText.trim();
  }

  const lines = rawText.split('\n');
  const output = [];

  for (let i = 0; i < lines.length; i++) {
    const currentLine = lines[i];
    
    if (isChordLine(currentLine)) {
      const nextLine = lines[i + 1];
      
      // If there is a next line, and it is NOT a chord line, merge them
      if (nextLine !== undefined && !isChordLine(nextLine) && nextLine.trim().length > 0) {
        // We find the index position of each chord in the chord line
        const chordsWithIndices = [];
        let searchIndex = 0;
        
        // Find tokens and their exact start character index
        const tokens = currentLine.split(/(\s+)/);
        let charCounter = 0;
        
        for (const token of tokens) {
          if (token.trim().length > 0 && isChordToken(token)) {
            chordsWithIndices.push({
              chord: token.replace(/[()\[\]]/g, ''), // strip brackets/parens
              index: charCounter
            });
          }
          charCounter += token.length;
        }

        // Merge chords into the text line.
        // Sort descending by index so inserting does not shift indices of preceding chords.
        chordsWithIndices.sort((a, b) => b.index - a.index);
        
        let textLine = nextLine;
        
        for (const { chord, index } of chordsWithIndices) {
          if (index <= textLine.length) {
            textLine = textLine.slice(0, index) + `[${chord}]` + textLine.slice(index);
          } else {
            // If the chord index is beyond the text line length, pad the text line and append
            const padding = ' '.repeat(index - textLine.length);
            textLine = textLine + padding + `[${chord}]`;
          }
        }
        
        output.push(textLine);
        i++; // skip next line since we merged it
      } else {
        // Chord line with no text line following: convert chords to [Chord] format
        const tokens = currentLine.split(/(\s+)/);
        let formattedLine = '';
        for (const token of tokens) {
          if (token.trim().length > 0 && isChordToken(token)) {
            formattedLine += `[${token.replace(/[()\[\]]/g, '')}]`;
          } else {
            formattedLine += token;
          }
        }
        output.push(formattedLine);
      }
    } else {
      // Regular line: keep as is
      output.push(currentLine);
    }
  }

  return output.join('\n').trim();
}

// ----------------------------------------------------
// API ROUTES
// ----------------------------------------------------

function removeAccents(str) {
  if (!str) return '';
  return str
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd');
}

// 1. Get Songs List & Search
app.get('/api/songs', (req, res) => {
  const { q } = req.query;
  const songs = getSongs();
  
  if (!q) {
    return res.json(songs);
  }
  
  const queryTerms = removeAccents(q)
    .split(/[\s\-_,.]+/)
    .map(t => t.trim())
    .filter(Boolean);
  
  if (queryTerms.length === 0) {
    return res.json(songs);
  }
  
  const filtered = songs.filter(s => {
    const cleanTitle = removeAccents(s.title);
    const cleanArtist = removeAccents(s.artist);
    const cleanComposer = removeAccents(s.composer || '');
    // Strip ChordPro brackets (e.g. [Am]) to match lyrics text precisely
    const cleanLyrics = removeAccents(s.chordPro.replace(/\[[^\]]+\]/g, ''));
    
    return queryTerms.every(term => 
      cleanTitle.includes(term) ||
      cleanArtist.includes(term) ||
      cleanComposer.includes(term) ||
      cleanLyrics.includes(term)
    );
  });
  
  res.json(filtered);
});

// 2. Get Song Details
app.get('/api/songs/:id', (req, res) => {
  const song = getSong(req.params.id);
  if (!song) {
    return res.status(404).json({ error: 'Song not found' });
  }
  res.json(song);
});

// 3. Create Song
app.post('/api/songs', (req, res) => {
  const { title, artist, composer, rhythm, key, rawContent } = req.body;
  if (!title || !rawContent) {
    return res.status(400).json({ error: 'Title and rawContent are required' });
  }

  const chordPro = convertToChordPro(rawContent);
  const newSong = addSong({
    title,
    artist,
    composer,
    rhythm,
    key,
    chordPro
  });

  res.status(201).json(newSong);
});

// 4. Update Song
app.put('/api/songs/:id', (req, res) => {
  const { title, artist, composer, rhythm, key, rawContent } = req.body;
  if (!title || !rawContent) {
    return res.status(400).json({ error: 'Title and rawContent are required' });
  }

  const chordPro = convertToChordPro(rawContent);
  const updated = updateSong(req.params.id, {
    title,
    artist,
    composer,
    rhythm,
    key,
    chordPro
  });

  if (!updated) {
    return res.status(404).json({ error: 'Song not found' });
  }

  res.json(updated);
});

// 5. Delete Song
app.delete('/api/songs/:id', (req, res) => {
  const success = deleteSong(req.params.id);
  if (!success) {
    return res.status(404).json({ error: 'Song not found' });
  }
  res.json({ message: 'Song deleted successfully' });
});

// 6. Toggle Favorite Status
app.post('/api/songs/:id/favorite', (req, res) => {
  const song = toggleFavorite(req.params.id);
  if (!song) {
    return res.status(404).json({ error: 'Song not found' });
  }
  res.json(song);
});

// 7. Universal Song Link Scraper
app.post('/api/songs/scrape', async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL format. Please enter a valid HTTP or HTTPS song URL.' });
  }

  try {
    const scrapedData = await scrapeUniversal(url);
    const newSong = addSong({
      title: scrapedData.title,
      artist: scrapedData.artist,
      composer: scrapedData.composer,
      rhythm: scrapedData.rhythm,
      key: scrapedData.key,
      chordPro: scrapedData.chordPro
    });
    res.status(201).json(newSong);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 8. Import Copy-Pasted Text
app.post('/api/songs/import-paste', (req, res) => {
  const { title, artist, composer, rhythm, key, pastedText } = req.body;
  if (!title || !pastedText) {
    return res.status(400).json({ error: 'Title and pastedText are required' });
  }

  const chordPro = convertToChordPro(pastedText);
  const newSong = addSong({
    title,
    artist,
    composer,
    rhythm,
    key,
    chordPro
  });

  res.status(201).json(newSong);
});

// 8b. Import Batch JSON File
app.post('/api/songs/import-batch', (req, res) => {
  const songsList = req.body;
  if (!Array.isArray(songsList)) {
    return res.status(400).json({ error: 'Body must be a JSON array of songs' });
  }

  const importedSongs = [];
  for (const song of songsList) {
    if (!song.title || !song.chordPro) continue;
    
    const chordPro = convertToChordPro(song.chordPro);
    const newSong = addSong({
      title: song.title,
      artist: song.artist,
      composer: song.composer,
      rhythm: song.rhythm,
      key: song.key,
      chordPro
    });
    importedSongs.push(newSong);
  }

  res.status(201).json({ 
    message: `Successfully imported ${importedSongs.length} songs`, 
    count: importedSongs.length 
  });
});

// 8c. Cleanup & Deduplicate Database
app.post('/api/songs/cleanup', (req, res) => {
  try {
    const result = runCleanup();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// AUTH & USER ROUTES
// ==========================================

// Login
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const users = getUsers();
  const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
  
  if (!user || user.password !== password) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  res.json({
    id: user.id,
    email: user.email,
    role: user.role
  });
});

// Register
app.post('/api/auth/register', (req, res) => {
  const { email, password, securityQuestion, securityAnswer } = req.body;
  if (!email || !password || !securityQuestion || !securityAnswer) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  const newUser = addUser({
    email,
    password,
    role: 'user',
    securityQuestion,
    securityAnswer
  });

  if (!newUser) {
    return res.status(400).json({ error: 'Email is already registered' });
  }

  res.status(201).json({
    id: newUser.id,
    email: newUser.email,
    role: newUser.role
  });
});

// Get security question for recovery
app.post('/api/auth/recover-question', (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  const users = getUsers();
  const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
  
  if (!user) {
    return res.status(404).json({ error: 'Email not found' });
  }

  res.json({ securityQuestion: user.securityQuestion });
});

// Recover password
app.post('/api/auth/recover-password', (req, res) => {
  const { email, securityAnswer } = req.body;
  if (!email || !securityAnswer) {
    return res.status(400).json({ error: 'Email and security answer are required' });
  }

  const users = getUsers();
  const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
  
  if (!user) {
    return res.status(404).json({ error: 'Email not found' });
  }

  if (user.securityAnswer.toLowerCase() !== securityAnswer.trim().toLowerCase()) {
    return res.status(401).json({ error: 'Incorrect answer' });
  }

  res.json({ password: user.password });
});

// ==========================================
// USER FAVORITES & HISTORY ROUTES
// ==========================================

// Get user favorites
app.get('/api/user/:userId/favorites', (req, res) => {
  const favs = getUserFavorites(req.params.userId);
  res.json(favs);
});

// Toggle user favorite
app.post('/api/user/:userId/favorites/toggle', (req, res) => {
  const { songId } = req.body;
  if (!songId) {
    return res.status(400).json({ error: 'songId is required' });
  }
  const favs = toggleUserFavorite(req.params.userId, songId);
  res.json(favs);
});

// Get user play history
app.get('/api/user/:userId/history', (req, res) => {
  const history = getPlayHistory(req.params.userId);
  res.json(history);
});

// Increment play count
app.post('/api/user/:userId/history/increment', (req, res) => {
  const { songId } = req.body;
  if (!songId) {
    return res.status(400).json({ error: 'songId is required' });
  }
  const count = incrementPlayCount(req.params.userId, songId);
  res.json({ count });
});

// Playlists API
app.get('/api/playlists', (req, res) => {
  res.json(getPlaylists());
});

app.post('/api/playlists', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  const playlist = createPlaylist(name);
  res.status(201).json(playlist);
});

app.post('/api/playlists/:playlistId/songs', (req, res) => {
  const { songId } = req.body;
  if (!songId) return res.status(400).json({ error: 'SongId is required' });
  const playlist = addSongToPlaylist(req.params.playlistId, songId);
  if (!playlist) return res.status(404).json({ error: 'Playlist not found' });
  res.json(playlist);
});

app.delete('/api/playlists/:playlistId/songs/:songId', (req, res) => {
  const playlist = removeSongFromPlaylist(req.params.playlistId, req.params.songId);
  if (!playlist) return res.status(404).json({ error: 'Playlist not found' });
  res.json(playlist);
});

app.delete('/api/playlists/:id', (req, res) => {
  const success = deletePlaylist(req.params.id);
  if (!success) return res.status(404).json({ error: 'Playlist not found' });
  res.json({ message: 'Playlist deleted' });
});

// Serve frontend in production (static files build)
const frontendDist = path.join(__dirname, 'frontend', 'dist');
app.use(express.static(frontendDist));

app.get('*', (req, res) => {
  // If frontend built index.html exists, serve it, otherwise return a message
  const indexHtml = path.join(frontendDist, 'index.html');
  res.sendFile(indexHtml, (err) => {
    if (err) {
      res.status(200).send('Campfire Chords Server is running. Frontend has not been built yet. Run "npm run build" to compile the frontend.');
    }
  });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
