import axios from 'axios';
import { scrapeHopAmChuan } from './scraper.js';
import { addSong, getSongs, saveSongs } from './db.js';

const AUTOCOMPLETE_URL = 'https://hopamchuan.com/ajax/ajax_song/search_autocomplete';

const SONG_KEYWORDS = [
  // Vietnamese Campfire Classics
  "Noi Vong Tay Lon",
  "La Lung Vu",
  "Cay Dan Sinh Vien",
  "Tuoi Hong Tho Ngay",
  "Cat Bui Trinh Cong Son",
  "Diem Xua Trinh Cong Son",
  "Noi Nay Co Anh Son Tung",
  "Bui Phan",
  "Phuong Hong",
  "Tinh Tho",
  "Con Mua Tinh Yeu",
  "Sau Tat Ca Erik",
  "Ha Trang Trinh Cong Son",
  "Thanh Pho Buon",
  "Xe Dap Thuy Chi",
  "Thang Tu La Loi Noi Doi Cua Em",
  "Viet Nam Oi",
  "Khat Vong Tuoi Tre",
  "Dong Thoai Quang Vinh",
  "Gặp Mẹ Trong Mơ",
  
  // English Campfire Classics
  "Yesterday The Beatles",
  "Hotel California Eagles",
  "Wonderwall Oasis",
  "Let It Be The Beatles",
  "Imagine John Lennon",
  "Stand By Me Ben E King",
  "Country Roads John Denver",
  "Sweet Home Alabama",
  "Hallelujah Leonard Cohen",
  "Hey Jude The Beatles"
];

async function resolveSongUrl(keyword) {
  try {
    const params = new URLSearchParams();
    params.append('keyword', keyword);

    const response = await axios.post(AUTOCOMPLETE_URL, params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 8000
    });

    if (response.data && response.data.success && response.data.data && response.data.data.length > 0) {
      // Get first match
      let url = response.data.data[0]._url;
      // Unescape backslashes if present
      url = url.replace(/\\/g, '');
      return {
        url,
        title: response.data.data[0]._title,
        singer: response.data.data[0]._singers
      };
    }
    return null;
  } catch (error) {
    console.error(`⚠️ Search query failed for "${keyword}": ${error.message}`);
    return null;
  }
}

async function run() {
  console.log('🚀 Starting batch search and retrieval of 30 campfire classics...');
  
  let currentSongs = [];
  try {
    currentSongs = getSongs();
  } catch (e) {
    currentSongs = [];
  }

  console.log(`📊 Starting database size: ${currentSongs.length} songs.`);

  let successCount = 0;
  let skipCount = 0;

  for (const keyword of SONG_KEYWORDS) {
    console.log(`\n🔍 Searching autocomplete for: "${keyword}"...`);
    
    const match = await resolveSongUrl(keyword);
    if (!match) {
      console.log(`❌ No match found on HopAmChuan for keyword: "${keyword}"`);
      continue;
    }

    const title = match.title;
    
    // Check if song already exists in the local database (case-insensitive check)
    const exists = currentSongs.some(s => s.title.toLowerCase() === title.toLowerCase());
    if (exists) {
      console.log(`ℹ️ Song "${title}" already exists in local database. Skipping crawl.`);
      skipCount++;
      continue;
    }

    const url = match.url;
    console.log(`📡 Found URL: ${url}. Scraping lyrics and chords...`);

    try {
      const songData = await scrapeHopAmChuan(url);
      
      const added = addSong({
        title: songData.title,
        artist: songData.artist,
        rhythm: songData.rhythm,
        key: songData.key,
        chordPro: songData.chordPro
      });

      // Update local array for subsequent checks
      currentSongs.push(added);

      console.log(`✅ Successfully added: "${added.title}" by ${added.artist} (${added.key})`);
      successCount++;

      // Politely wait 1.5 seconds to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1500));
    } catch (e) {
      console.error(`❌ Failed to scrape ${url}: ${e.message}`);
    }
  }

  console.log(`\n🎉 Batch grab finished!`);
  console.log(`✅ Imported: ${successCount} songs`);
  console.log(`ℹ️ Skipped (already in DB): ${skipCount} songs`);
  console.log(`📊 Final offline library size: ${getSongs().length} songs.`);
}

run();
