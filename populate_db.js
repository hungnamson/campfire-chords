import { scrapeHopAmChuan } from './scraper.js';
import { addSong, getSongs, saveSongs } from './db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SONGS_FILE = path.join(__dirname, 'songs.json');

const POPULAR_SONG_URLS = [
  'https://hopamchuan.com/song/500/nho-oi/',
  'https://hopamchuan.com/song/288/noi-vong-tay-lon/',
  'https://hopamchuan.com/song/77/tuoi-hong-tho-ngay/',
  'https://hopamchuan.com/song/201/hotel-california/',
  'https://hopamchuan.com/song/1131/cay-dan-sinh-vien/',
  'https://hopamchuan.com/song/4453/the-one-that-got-away/',
  'https://hopamchuan.com/song/27403/someone-you-loved/',
  'https://hopamchuan.com/song/6340/noi-vong-tay-lon-rock-version/',
  'https://hopamchuan.com/song/6021/tinh-chua/',
  'https://hopamchuan.com/song/541/giac-mo-trua/'
];

async function run() {
  console.log('🔥 Initializing Popular Songs Retrieval from HopAmChuan...');
  
  // Clear standard preloaded list (except Yesterday and Cat Bui, we'll keep them as fallback if needed)
  // Let's read the current songs in DB, filter out the default ones so we can reload clean versions
  let currentSongs = [];
  try {
    currentSongs = getSongs();
  } catch (e) {
    currentSongs = [];
  }

  // Preserve Yesterday and Cat Bui
  const preserved = currentSongs.filter(s => s.id === 'yesterday' || s.id === 'cat-bui');
  
  // Save them temporary to clear duplicates before reload
  saveSongs(preserved);

  let successCount = 0;
  for (const url of POPULAR_SONG_URLS) {
    console.log(`📡 Fetching and parsing: ${url}...`);
    try {
      const songData = await scrapeHopAmChuan(url);
      
      // Check if song already exists in preserved list
      const songs = getSongs();
      const exists = songs.some(s => s.title.toLowerCase() === songData.title.toLowerCase());
      
      if (!exists) {
        const added = addSong({
          title: songData.title,
          artist: songData.artist,
          rhythm: songData.rhythm,
          key: songData.key,
          chordPro: songData.chordPro
        });
        console.log(`✅ Successfully added: "${added.title}" (${added.key})`);
        successCount++;
      } else {
        console.log(`ℹ️ Song "${songData.title}" already exists, skipping.`);
      }
      
      // Wait 1.5 seconds to be polite to the server
      await new Promise(resolve => setTimeout(resolve, 1500));
    } catch (e) {
      console.error(`❌ Failed to scrape ${url}: ${e.message}`);
    }
  }

  console.log(`\n🎉 Retrieval process finished! Successfully imported ${successCount} songs.`);
  console.log(`📊 Current offline library size: ${getSongs().length} songs.`);
}

run();
