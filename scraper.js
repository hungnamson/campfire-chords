import axios from 'axios';
import * as cheerio from 'cheerio';

/**
 * Scrapes song details from a Hop Am Chuan URL.
 * Supports URL format: https://hopamchuan.com/song/500/nho-oi
 * @param {string} url - The hopamchuan.com song URL
 * @returns {Promise<object>} The parsed song details
 */
export async function scrapeHopAmChuan(url) {
  try {
    // Add standard headers to be polite and prevent potential blocking
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,vi;q=0.8',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      },
      timeout: 10000
    });

    const $ = cheerio.load(response.data);

    // 1. Title
    const title = $('#song-title span').first().text().trim() || $('#song-title').contents().first().text().trim();
    if (!title) {
      throw new Error('Could not parse song title from page structure.');
    }

    // 2. Singers / Artists
    const singers = [];
    $('.perform-singer-list a.author-item').each((_, el) => {
      singers.push($(el).text().trim());
    });
    const artist = singers.join(', ') || 'Khuyết Danh';

    // 2b. Composer / Author
    let composer = '';
    $('table th').each((_, thEl) => {
      const text = $(thEl).text().trim();
      if (text.includes('Tác giả') || text.includes('Composer') || text.includes('Author')) {
        composer = $(thEl).next('td').text().trim().replace(/\s+/g, ' ');
      }
    });

    // 3. Rhythm
    let rhythm = $('#display-rhythm').text().trim() || $('.rhythm-item').first().text().trim();
    rhythm = rhythm.replace(/^Điệu\s+/i, '').trim() || 'Chưa xác định';

    // 4. Key
    const key = $('#display-key').text().trim() || 'C';

    // 5. Lyrics & Chords (ChordPro)
    const lines = [];
    const lyricDiv = $('#song-lyric .pre');
    
    if (lyricDiv.length > 0) {
      lyricDiv.find('.chord_lyric_line').each((_, lineEl) => {
        const line = $(lineEl);
        if (line.hasClass('empty_line')) {
          lines.push('');
        } else {
          // Cheerio's .text() concatenates text in children nodes in order.
          // Since chords are wrapped in <i>[</i><span class="chord">Am</span><i>]</i>,
          // their text representation is naturally "[Am]".
          // The lyrics text is adjacent. Thus, .text() automatically compiles ChordPro format!
          let lineText = line.text();
          // Clean up multiple spaces, but preserve layout
          lineText = lineText.replace(/\r/g, '');
          lines.push(lineText);
        }
      });
    } else {
      // Fallback in case the structure changes slightly: try to look for pre or lyrics class
      const fallbackText = $('.song-lyric-note').text() || $('pre').first().text();
      if (fallbackText) {
        fallbackText.split('\n').forEach(line => lines.push(line.trim()));
      }
    }

    const chordPro = lines.join('\n').trim();

    if (!chordPro) {
      throw new Error('Could not parse song lyrics/chords content.');
    }

    return {
      title,
      artist,
      composer,
      rhythm,
      key,
      chordPro
    };

  } catch (error) {
    console.error(`Error scraping URL: ${url}`, error.message);
    throw new Error(`Failed to scrape song from Hop Am Chuan. ${error.message}`);
  }
}

/**
 * Validates whether a URL is a hopamchuan song URL.
 * @param {string} urlStr 
 * @returns {boolean}
 */
export function isHopAmChuanUrl(urlStr) {
  try {
    const url = new URL(urlStr);
    return (
      url.hostname === 'hopamchuan.com' ||
      url.hostname === 'www.hopamchuan.com'
    ) && url.pathname.includes('/song/');
  } catch {
    return false;
  }
}
