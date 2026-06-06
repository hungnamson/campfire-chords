import { gotScraping } from 'got-scraping';
import * as cheerio from 'cheerio';

/**
 * Scrapes song details from a Hop Am Chuan URL.
 * Supports URL format: https://hopamchuan.com/song/500/nho-oi
 * @param {string} url - The hopamchuan.com song URL
 * @returns {Promise<object>} The parsed song details
 */
export async function scrapeHopAmChuan(url) {
  try {
    const response = await gotScraping(url);

    const $ = cheerio.load(response.body);

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
 * Scrapes song details from a Hop Am Viet URL.
 * Supports URL format: https://hopamviet.vn/chord/song/80/nho-oi.html
 * @param {string} url - The hopamviet.vn song URL
 * @returns {Promise<object>} The parsed song details
 */
export async function scrapeHopAmViet(url) {
  try {
    const response = await gotScraping(url);
    const $ = cheerio.load(response.body);

    // 1. Title
    let title = $('h1').first().text().trim();
    if (title.startsWith("Hợp âm ")) {
      title = title.replace("Hợp âm ", "");
    }
    if (!title) {
      throw new Error('Could not parse song title from page structure.');
    }

    // 2. Lyrics & Chords (ChordPro)
    const lyricBlock = $('#lyricBox .lyric-block').first();
    let chordPro = '';
    if (lyricBlock.length > 0) {
      // In hopamviet.vn html, chords are already inside bracket format in the lyric-block text!
      chordPro = lyricBlock.text().trim();
    } else {
      const alternateBlock = $('.lyric-block').first();
      if (alternateBlock.length > 0) {
        chordPro = alternateBlock.text().trim();
      } else {
        chordPro = $('pre').first().text().trim();
      }
    }

    if (!chordPro) {
      throw new Error('Could not parse lyrics/chords content.');
    }

    // 3. Artist (Ca sĩ)
    const singers = [];
    $('.song-singer-text').each((_, el) => {
      const text = $(el).text().trim();
      if (text && !singers.includes(text)) {
        singers.push(text);
      }
    });
    const artist = singers.join(', ') || 'Khuyết Danh';

    // 4. Composer (Sáng tác)
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

    // 5. Rhythm
    let rhythm = $('#currentRhythmLabel').text().trim() || 
                 $('#currentRhythmLabelMobile').text().trim() || 
                 "Chưa xác định";

    // 6. Key / Tone
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

    return {
      title,
      artist,
      composer,
      rhythm,
      key,
      chordPro
    };

  } catch (error) {
    console.error(`Error scraping HopAmViet: ${url}`, error.message);
    throw new Error(`Failed to scrape song from HopAmViet. ${error.message}`);
  }
}

/**
 * Scrapes song details generically from a standard webpage
 * @param {string} url - The song page URL
 * @returns {Promise<object>} The parsed song details
 */
export async function scrapeGeneric(url) {
  try {
    const response = await gotScraping(url);

    const $ = cheerio.load(response.body);

    let title = $('h1').first().text().trim() || $('title').text().trim();
    if (title.includes(" - ")) {
      title = title.split(" - ")[0].trim();
    }
    if (title.startsWith("Hợp âm ")) {
      title = title.replace("Hợp âm ", "");
    }
    
    // Look for pre tags first for lyrics/chords
    let chordPro = '';
    const preText = $('pre').first().text().trim();
    if (preText) {
      chordPro = preText;
    } else {
      // fallback to elements with class containing lyric or chord
      const selectors = ['.lyric', '.lyrics', '.chord', '.chords', '.lyric-block', '.song-content'];
      for (const sel of selectors) {
        const text = $(sel).first().text().trim();
        if (text) {
          chordPro = text;
          break;
        }
      }
    }

    if (!chordPro) {
      throw new Error('This website layout is not supported by our generic parser. Please use Copy-Paste Importer.');
    }

    return {
      title: title || 'Bài hát mới',
      artist: 'Khuyết Danh',
      composer: '',
      rhythm: 'Chưa xác định',
      key: 'C',
      chordPro
    };
  } catch (error) {
    throw new Error(`Failed to scrape URL generically: ${error.message}`);
  }
}

/**
 * Universal scraper that determines domain type and parses accordingly
 * @param {string} urlStr - The song URL
 * @returns {Promise<object>} The parsed song details
 */
export async function scrapeUniversal(urlStr) {
  const url = new URL(urlStr);
  const hostname = url.hostname.toLowerCase();
  
  if (hostname.includes('hopamchuan.com')) {
    return scrapeHopAmChuan(urlStr);
  } else if (hostname.includes('hopamviet.vn') || hostname.includes('hopamviet.com')) {
    return scrapeHopAmViet(urlStr);
  } else {
    return scrapeGeneric(urlStr);
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

