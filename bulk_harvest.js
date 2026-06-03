import axios from 'axios';
import { scrapeHopAmChuan } from './scraper.js';
import { addSong, getSongs } from './db.js';

const AUTOCOMPLETE_URL = 'https://hopamchuan.com/ajax/ajax_song/search_autocomplete';

// Common Vietnamese syllables that appear in almost all popular song titles
const HARVEST_KEYWORDS = [
  'yeu', 'tinh', 'anh', 'em', 'thuong', 
  'nho', 'mua', 'ngay', 'dem', 'doi', 
  'nang', 'gio', 'hoa', 've', 'di'
];

async function fetchSongListForKeyword(keyword) {
  try {
    const params = new URLSearchParams();
    params.append('keyword', keyword);

    const response = await axios.post(AUTOCOMPLETE_URL, params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 10000
    });

    if (response.data && response.data.success && response.data.data) {
      return response.data.data.map(item => {
        let url = item._url;
        url = url.replace(/\\/g, ''); // Clean URL
        return {
          id: item.id,
          url: url,
          title: item._title,
          singer: item._singers
        };
      });
    }
    return [];
  } catch (error) {
    console.error(`⚠️ Search keyword "${keyword}" failed: ${error.message}`);
    return [];
  }
}

async function run() {
  console.log('🔥 Starting Bulk Song Harvester...');
  console.log('📡 Fetching popular songs list via autocomplete search queries...');

  const uniqueSongs = new Map();

  for (const keyword of HARVEST_KEYWORDS) {
    console.log(`🔍 Querying: "${keyword}"...`);
    const matches = await fetchSongListForKeyword(keyword);
    console.log(`   Found ${matches.length} matches.`);
    
    for (const song of matches) {
      // Deduplicate by HopAmChuan song ID
      if (!uniqueSongs.has(song.id)) {
        uniqueSongs.set(song.id, song);
      }
    }
    
    // Wait briefly between search requests
    await new Promise(resolve => setTimeout(resolve, 800));
  }

  const allResolvedSongs = Array.from(uniqueSongs.values());
  console.log(`\n🎯 Resolved ${allResolvedSongs.length} unique popular songs across search keywords.`);

  // Get current songs database to avoid duplicates
  let currentSongs = [];
  try {
    currentSongs = getSongs();
  } catch (e) {
    currentSongs = [];
  }

  // Filter out songs we already have
  const queue = allResolvedSongs.filter(song => {
    return !currentSongs.some(s => s.title.toLowerCase() === song.title.toLowerCase());
  });

  console.log(`📊 Library currently has ${currentSongs.length} songs.`);
  console.log(`📦 New songs to download: ${queue.length}`);

  // Limit bulk harvest to the top 120 new songs to prevent rate limiting or over-loading.
  // 120 songs is a massive increase and takes about 3 minutes.
  const maxDownloads = Math.min(120, queue.length);
  const downloadQueue = queue.slice(0, maxDownloads);

  console.log(`📥 Commencing bulk download of ${maxDownloads} popular songs...`);

  let successCount = 0;
  for (let i = 0; i < downloadQueue.length; i++) {
    const song = downloadQueue[i];
    const indexStr = `${i + 1}/${maxDownloads}`;
    console.log(`[${indexStr}] 📡 Fetching song: "${song.title}" (${song.url})`);

    try {
      const songData = await scrapeHopAmChuan(song.url);
      
      const added = addSong({
        title: songData.title,
        artist: songData.artist,
        rhythm: songData.rhythm,
        key: songData.key,
        chordPro: songData.chordPro
      });

      console.log(`     ✅ Successfully added: "${added.title}" (${added.key})`);
      successCount++;

      // Wait 1.6 seconds to be highly polite to the server
      await new Promise(resolve => setTimeout(resolve, 1600));
    } catch (e) {
      console.error(`     ❌ Failed to scrape: ${e.message}`);
    }
  }

  console.log(`\n🎉 Bulk harvesting completed!`);
  console.log(`📈 Successfully imported: ${successCount} songs.`);
  console.log(`📊 New local offline library size: ${getSongs().length} songs.`);
}

run();
