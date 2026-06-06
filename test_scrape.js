import { gotScraping } from 'got-scraping';
import * as cheerio from 'cheerio';

async function test() {
  const url = 'https://hopamviet.vn/chord/song/nang-am-que-huong/W8IUI8E7.html';
  try {
    const response = await gotScraping(url);
    const $ = cheerio.load(response.body);
    
    // 1. Title
    let title = $('h1').first().text().trim();
    if (title.startsWith("Hợp âm ")) {
      title = title.replace("Hợp âm ", "");
    }
    
    // 2. Singers / Artists
    const singers = [];
    $('.song-singer-text').each((_, el) => {
      const text = $(el).text().trim();
      if (text && !singers.includes(text)) {
        singers.push(text);
      }
    });
    const artist = singers.join(', ') || 'Khuyết Danh';

    // 3. Composer / Author
    let composer = '';
    $('.print-meta').each((_, el) => {
      const text = $(el).text().trim();
      if (text.startsWith("Sáng tác:")) {
        composer = text.replace("Sáng tác:", "").trim();
      }
    });
    if (!composer) {
      $('span, div, p').each((_, el) => {
        const text = $(el).text().trim();
        if (text.startsWith("Sáng tác:")) {
          composer = text.replace("Sáng tác:", "").trim();
        }
      });
    }

    // 4. Rhythm
    let rhythm = $('#currentRhythmLabel').text().trim() || 
                 $('#currentRhythmLabelMobile').text().trim() || 
                 "Chưa xác định";

    // 5. Key / Tone
    let key = 'C';
    const songToneText = $('.song-tone').first().text().trim();
    if (songToneText) {
      key = songToneText.replace(/[\[\]]/g, '').trim();
    } else {
      const toneBadge = $('.tone-badge').first().text().trim();
      if (toneBadge) {
        key = toneBadge;
      }
    }

    // 6. ChordPro
    const lyricBlock = $('#lyricBox .lyric-block').first();
    let chordPro = '';
    if (lyricBlock.length > 0) {
      chordPro = lyricBlock.text().trim();
    } else {
      const alternateBlock = $('.lyric-block').first();
      if (alternateBlock.length > 0) {
        chordPro = alternateBlock.text().trim();
      } else {
        chordPro = $('pre').first().text().trim();
      }
    }

    console.log('--- TEST PARSED DATA ---');
    console.log({
      title,
      artist,
      composer,
      rhythm,
      key,
      chordProSnippet: chordPro.substring(0, 150) + '...'
    });
  } catch (error) {
    console.error('❌ Failed:', error.message);
  }
}

test();
