import React, { useState, useEffect } from 'react';
import { 
  Music, 
  Search, 
  Heart, 
  ListMusic, 
  PlusCircle, 
  Wifi, 
  WifiOff, 
  Flame, 
  Trash2, 
  Globe, 
  FileText, 
  FolderPlus, 
  FolderMinus, 
  ArrowRight,
  Info,
  ChevronRight,
  ChevronLeft,
  Upload
} from 'lucide-react';
import SongViewer from './components/SongViewer';
import { transposeChord } from './utils/transposer';

const API_BASE = '/api';

export default function App() {
  const [songs, setSongs] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [activeSongId, setActiveSongId] = useState(null);
  const [activeTab, setActiveTab] = useState('library'); // library, setlists, add
  const [searchQuery, setSearchQuery] = useState('');
  const [transposeOffset, setTransposeOffset] = useState(0);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  // Scraper tab inputs
  const [newSongUrl, setNewSongUrl] = useState('');
  const [isScraping, setIsScraping] = useState(false);
  const [scrapeError, setScrapeError] = useState(null);
  const [scrapeSuccess, setScrapeSuccess] = useState(false);

  // Paste/Manual tab inputs
  const [newTitle, setNewTitle] = useState('');
  const [newArtist, setNewArtist] = useState('');
  const [newComposer, setNewComposer] = useState('');
  const [newRhythm, setNewRhythm] = useState('');
  const [newKey, setNewKey] = useState('C');
  const [newPasteText, setNewPasteText] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState(null);
  const [importSuccess, setImportSuccess] = useState(false);

  // Batch file import inputs
  const [isImportingFile, setIsImportingFile] = useState(false);
  const [importFileStatus, setImportFileStatus] = useState(null); // { type: 'success'|'error'|'info', message: string }

  // Category scraper inputs
  const [categoryUrl, setCategoryUrl] = useState('https://hopamviet.vn/chord/category/1/nhac-vang');
  const [startPage, setStartPage] = useState(2);
  const [endPage, setEndPage] = useState(2);
  const [directImport, setDirectImport] = useState(true);
  const [copiedScript, setCopiedScript] = useState(false);

  // Playlist state
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [selectedPlaylistId, setSelectedPlaylistId] = useState(null);

  // Next/Prev setlist navigation context
  const [activePlaylistSongs, setActivePlaylistSongs] = useState([]);

  // Monitor online status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Fetch initial data
  useEffect(() => {
    fetchSongs();
    fetchPlaylists();
  }, []);

  // Reset transpose offset when active song changes
  useEffect(() => {
    setTransposeOffset(0);
  }, [activeSongId]);

  // Auto-navigate to library and close active song if search query becomes populated
  useEffect(() => {
    if (searchQuery.trim().length > 0) {
      if (activeSongId !== null) {
        setActiveSongId(null);
      }
      if (activeTab !== 'library') {
        setActiveTab('library');
      }
      if (selectedPlaylistId !== null) {
        setSelectedPlaylistId(null);
      }
    }
  }, [searchQuery]);

  const fetchSongs = async () => {
    try {
      const res = await fetch(`${API_BASE}/songs`);
      const data = await res.json();
      setSongs(data);
    } catch (e) {
      console.error('Error fetching songs:', e);
    }
  };

  const fetchPlaylists = async () => {
    try {
      const res = await fetch(`${API_BASE}/playlists`);
      const data = await res.json();
      setPlaylists(data);
    } catch (e) {
      console.error('Error fetching playlists:', e);
    }
  };

  const handleToggleFavorite = async (songId) => {
    try {
      const res = await fetch(`${API_BASE}/songs/${songId}/favorite`, { method: 'POST' });
      if (res.ok) {
        setSongs(prev => prev.map(s => s.id === songId ? { ...s, isFavorite: !s.isFavorite } : s));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteSong = async (songId, e) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this song from your offline library?')) return;
    
    try {
      const res = await fetch(`${API_BASE}/songs/${songId}`, { method: 'DELETE' });
      if (res.ok) {
        setSongs(prev => prev.filter(s => s.id !== songId));
        if (activeSongId === songId) {
          setActiveSongId(null);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleScrapeSong = async (e) => {
    e.preventDefault();
    if (!newSongUrl) return;
    
    setIsScraping(true);
    setScrapeError(null);
    setScrapeSuccess(false);

    try {
      const res = await fetch(`${API_BASE}/songs/scrape`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: newSongUrl })
      });
      
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to scrape url');
      }

      setScrapeSuccess(true);
      setNewSongUrl('');
      fetchSongs();
      setActiveSongId(data.id);
    } catch (error) {
      setScrapeError(error.message);
    } finally {
      setIsScraping(false);
    }
  };

  const handlePasteImport = async (e) => {
    e.preventDefault();
    if (!newTitle || !newPasteText) {
      setImportError('Title and lyrics/chords content are required.');
      return;
    }

    setIsImporting(true);
    setImportError(null);
    setImportSuccess(false);

    try {
      const res = await fetch(`${API_BASE}/songs/import-paste`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle,
          artist: newArtist,
          composer: newComposer,
          rhythm: newRhythm,
          key: newKey,
          pastedText: newPasteText
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed.');

      setImportSuccess(true);
      setNewTitle('');
      setNewArtist('');
      setNewComposer('');
      setNewRhythm('');
      setNewKey('C');
      setNewPasteText('');
      fetchSongs();
      setActiveSongId(data.id);
    } catch (error) {
      setImportError(error.message);
    } finally {
      setIsImporting(false);
    }
  };

  const handleFileImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImportingFile(true);
    setImportFileStatus({ type: 'info', message: `Reading file "${file.name}"...` });

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target.result;
        const jsonData = JSON.parse(text);

        if (!Array.isArray(jsonData)) {
          throw new Error('JSON format is invalid. It must be an array of songs.');
        }

        // Validate basic structure of the first few items
        const sample = jsonData.slice(0, 5);
        for (const song of sample) {
          if (!song.title || (!song.chordPro && !song.rawContent)) {
            throw new Error('Each song object must contain at least "title" and "chordPro" (or "rawContent") fields.');
          }
        }

        const cleanVal = (val, fallback) => {
          if (!val) return fallback;
          const str = String(val);
          if (str.includes("Tất cả 0-9 A B C D E F G H I J K L M N O P Q R S T U V W X Y Z")) {
            return fallback;
          }
          return str.trim();
        };

        // Standardize properties to match what the backend expects
        const mappedData = jsonData.map(song => ({
          title: song.title,
          artist: cleanVal(song.artist, 'Khuyết Danh'),
          composer: cleanVal(song.composer, ''),
          rhythm: song.rhythm || 'Chưa xác định',
          key: song.key || 'C',
          chordPro: song.chordPro || song.rawContent || ''
        }));

        setImportFileStatus({ type: 'info', message: `Importing ${mappedData.length} songs to database...` });

        const res = await fetch(`${API_BASE}/songs/import-batch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(mappedData)
        });

        const result = await res.json();
        if (!res.ok) {
          throw new Error(result.error || 'Server rejected the import.');
        }

        setImportFileStatus({
          type: 'success',
          message: `Successfully imported ${result.count} songs from "${file.name}"!`
        });
        fetchSongs();
      } catch (error) {
        console.error('File import error:', error);
        setImportFileStatus({
          type: 'error',
          message: error.message || 'Failed to read or import the JSON file.'
        });
      } finally {
        setIsImportingFile(false);
        // Clear input value so selecting the same file again triggers change event
        e.target.value = '';
      }
    };

    reader.onerror = () => {
      setImportFileStatus({ type: 'error', message: 'Error reading the file.' });
      setIsImportingFile(false);
      e.target.value = '';
    };

    reader.readAsText(file);
  };

  const generateScraperScript = () => {
    const cleanUrl = categoryUrl.trim().replace(/\?page=\d+$/, '').replace(/\/view\/\d+\.html$/, '').replace(/\/$/, '');
    const backendUrl = "http://localhost:3000/api/songs/import-batch";

    return `(async function runCategoryScraper() {
  const startPage = ${startPage};
  const endPage = ${endPage};
  const baseUrl = "${cleanUrl}";
  const directImport = ${directImport};
  const backendUrl = "${backendUrl}";

  console.log("🔥 HopAmViet Category Scraper Started!");
  console.log("📂 Target Category: " + baseUrl);
  console.log("📖 Pages to crawl: " + startPage + " to " + endPage);

  const songs = [];

  for (let p = startPage; p <= endPage; p++) {
    let pageUrl = baseUrl;
    if (p > 1) {
      if (baseUrl.includes("?")) {
        pageUrl = baseUrl + "&page=" + p;
      } else {
        pageUrl = baseUrl + "?page=" + p;
      }
    }

    console.log("📡 [Page " + p + "/" + endPage + "] Fetching list: " + pageUrl);
    try {
      const response = await fetch(pageUrl);
      if (!response.ok) throw new Error("HTTP " + response.status);
      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, "text/html");

      const links = Array.from(doc.querySelectorAll('a[href*="/chord/song/"]'))
        .map(a => a.href)
        .filter((href, idx, self) => self.indexOf(href) === idx);

      console.log("   Found " + links.length + " song links on page " + p);

      for (let i = 0; i < links.length; i++) {
        const url = links[i];
        console.log("   [" + (i+1) + "/" + links.length + "] Scraping details: " + url);
        try {
          const res = await fetch(url);
          if (!res.ok) throw new Error("HTTP " + res.status);
          const songHtml = await res.text();
          const songDoc = new DOMParser().parseFromString(songHtml, "text/html");

          let title = songDoc.querySelector("h1")?.innerText?.trim() || "";
          if (title.startsWith("Hợp âm ")) title = title.replace("Hợp âm ", "");

          const lyricBlock = songDoc.querySelector("#lyricBox .lyric-block") || songDoc.querySelector(".lyric-block");
          const chordPro = lyricBlock ? lyricBlock.innerText.trim() : "";

          if (!title || !chordPro) {
            console.warn("      Could not parse title or chords/lyrics. Skipping.");
            continue;
          }

          let artist = "Khuyết Danh";
          songDoc.querySelectorAll("h4").forEach(h4 => {
            if (h4.innerText.includes("Ca sĩ")) {
              const siblingDiv = h4.nextElementSibling || h4.parentElement.querySelector("div");
              if (siblingDiv) {
                const links = Array.from(siblingDiv.querySelectorAll("a"))
                  .map(a => a.innerText.trim())
                  .filter(text => text && !text.includes("Tất cả") && !/^[0-9A-Z]$/.test(text));
                if (links.length > 0) {
                  artist = links.join(", ");
                } else if (!siblingDiv.innerText.includes("Tất cả 0-9")) {
                  artist = siblingDiv.innerText.replace(/\\s+/g, " ").trim();
                }
              }
            }
          });

          let composer = "";
          songDoc.querySelectorAll("h4").forEach(h4 => {
            if (h4.innerText.includes("Sáng tác")) {
              const siblingDiv = h4.nextElementSibling || h4.parentElement.querySelector("div");
              if (siblingDiv) {
                const links = Array.from(siblingDiv.querySelectorAll("a"))
                  .map(a => a.innerText.trim())
                  .filter(text => text && !text.includes("Tất cả") && !/^[0-9A-Z]$/.test(text));
                if (links.length > 0) {
                  composer = links.join(", ");
                } else if (!siblingDiv.innerText.includes("Tất cả 0-9")) {
                  composer = siblingDiv.innerText.replace(/\\s+/g, " ").trim();
                }
              }
            }
          });

          const rhythm = songDoc.querySelector("#currentRhythmLabelMobile")?.innerText?.trim() || 
                         songDoc.querySelector("#currentRhythmLabel")?.innerText?.trim() || 
                         "Chưa xác định";

          const printFooter = songDoc.querySelector(".print-footer") || 
                              Array.from(songDoc.querySelectorAll("*")).find(el => el.innerText && el.innerText.includes("Tone ca sĩ"));
          const keyMatch = printFooter ? printFooter.innerText.match(/\\\[([A-G][b#]?(?:m|maj|min)?[0-9]*)\\\]/i) : null;
          const key = keyMatch ? keyMatch[1] : "C";

          const songData = { title, artist, composer, rhythm, key, chordPro };
          songs.push(songData);
          console.log("      ✅ Parsed: \\"" + title + "\\" (" + artist + " • " + (composer || "Khuyết danh") + ")");
          
          if (directImport) {
            try {
              const postRes = await fetch(backendUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify([songData])
              });
              if (postRes.ok) {
                console.log("      🚀 Automatically imported to Campfire Chords!");
              } else {
                console.error("      ❌ Import request failed with status: " + postRes.status);
              }
            } catch (postErr) {
              console.error("      ❌ Failed to connect to local database: " + postErr.message);
            }
          }
        } catch (detailErr) {
          console.error("      ❌ Error scraping details: " + detailErr.message);
        }

        await new Promise(r => setTimeout(r, 600));
      }
    } catch (pageErr) {
      console.error("   ❌ Error fetching page " + p + ": " + pageErr.message);
    }
  }

  console.log("🎉 Category scraping session finished!");
  console.log("📊 Total songs scraped: " + songs.length);

  if (!directImport) {
    console.log("💾 Downloading JSON file...");
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(songs, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", "hopamviet_scraped.json");
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  } else {
    console.log("✅ All songs successfully imported to your offline database. Check your song list!");
  }
})();`;
  };

  const handleCreatePlaylist = async (e) => {
    e.preventDefault();
    if (!newPlaylistName.trim()) return;

    try {
      const res = await fetch(`${API_BASE}/playlists`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newPlaylistName })
      });
      if (res.ok) {
        setNewPlaylistName('');
        fetchPlaylists();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddSongToPlaylist = async (playlistId, songId) => {
    try {
      const res = await fetch(`${API_BASE}/playlists/${playlistId}/songs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ songId })
      });
      if (res.ok) {
        fetchPlaylists();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleRemoveSongFromPlaylist = async (playlistId, songId, e) => {
    e.stopPropagation();
    try {
      const res = await fetch(`${API_BASE}/playlists/${playlistId}/songs/${songId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        fetchPlaylists();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeletePlaylist = async (playlistId, e) => {
    e.stopPropagation();
    if (!window.confirm('Delete this setlist?')) return;
    try {
      const res = await fetch(`${API_BASE}/playlists/${playlistId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        if (selectedPlaylistId === playlistId) {
          setSelectedPlaylistId(null);
        }
        fetchPlaylists();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const activeSong = songs.find(s => s.id === activeSongId);

  const handleOpenSongFromPlaylist = (songId, playlistSongIds) => {
    const playlistSongsList = playlistSongIds.map(id => songs.find(s => s.id === id)).filter(Boolean);
    setActivePlaylistSongs(playlistSongsList);
    setActiveSongId(songId);
  };

  const handleNextSong = () => {
    if (activePlaylistSongs.length === 0) return;
    const currentIndex = activePlaylistSongs.findIndex(s => s.id === activeSongId);
    if (currentIndex !== -1 && currentIndex < activePlaylistSongs.length - 1) {
      setActiveSongId(activePlaylistSongs[currentIndex + 1].id);
    }
  };

  const handlePrevSong = () => {
    if (activePlaylistSongs.length === 0) return;
    const currentIndex = activePlaylistSongs.findIndex(s => s.id === activeSongId);
    if (currentIndex > 0) {
      setActiveSongId(activePlaylistSongs[currentIndex - 1].id);
    }
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

  const filteredSongs = (() => {
    if (!searchQuery.trim()) return [];

    const queryTerms = removeAccents(searchQuery)
      .split(/[\s\-_,.]+/)
      .map(t => t.trim())
      .filter(Boolean);

    if (queryTerms.length === 0) return [];

    return songs
      .map(song => {
        const cleanTitle = removeAccents(song.title);
        const cleanArtist = removeAccents(song.artist);
        const cleanComposer = removeAccents(song.composer || '');
        const cleanLyrics = removeAccents(song.chordPro.replace(/\[[^\]]+\]/g, ''));

        let matched = true;
        let score = 0;

        for (const term of queryTerms) {
          let termMatched = false;
          
          if (cleanTitle.includes(term)) {
            score += 100;
            termMatched = true;
          }
          if (cleanArtist.includes(term)) {
            score += 10;
            termMatched = true;
          }
          if (cleanComposer.includes(term)) {
            score += 5;
            termMatched = true;
          }
          if (cleanLyrics.includes(term)) {
            score += 1;
            termMatched = true;
          }

          if (!termMatched) {
            matched = false;
            break;
          }
        }

        return matched ? { song, score } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .map(item => item.song);
  })();

  return (
    <div className="min-h-screen bg-[#fcfbfa] text-stone-900 font-sans pb-20 md:pb-0 md:flex">
      
      {/* Sidebar Navigation - Desktop */}
      <aside className="hidden md:flex flex-col w-64 bg-[#f5f3ef] border-r border-[#e3ded5] p-6 select-none shrink-0">
        <div className="flex items-center gap-3 mb-8">
          <div className="p-2 bg-red-600/10 rounded-xl border border-red-600/20">
            <Flame className="w-7 h-7 text-red-600 fill-red-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight font-display text-stone-900">Campfire Chords</h1>
            <span className="text-[10px] uppercase font-bold text-stone-500">Offline Guitar App</span>
          </div>
        </div>

        <nav className="flex flex-col gap-2 flex-grow">
          <button 
            onClick={() => { setActiveTab('library'); setSelectedPlaylistId(null); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'library' && !selectedPlaylistId 
                ? 'bg-red-600 text-white shadow-md shadow-red-600/10' 
                : 'text-stone-700 hover:bg-stone-200/60'
            }`}
          >
            <Music className="w-4 h-4" /> Song Library
          </button>
          <button 
            onClick={() => setActiveTab('setlists')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'setlists' 
                ? 'bg-red-600 text-white shadow-md shadow-red-600/10' 
                : 'text-stone-700 hover:bg-stone-200/60'
            }`}
          >
            <ListMusic className="w-4 h-4" /> Campfire Setlists
          </button>
          <button 
            onClick={() => setActiveTab('add')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'add' 
                ? 'bg-red-600 text-white shadow-md shadow-red-600/10' 
                : 'text-stone-700 hover:bg-stone-200/60'
            }`}
          >
            <PlusCircle className="w-4 h-4" /> Add & Scrape Chords
          </button>
        </nav>

        {/* Network status */}
        <div className="mt-auto border-t border-stone-200/80 pt-4 flex items-center gap-2 text-xs">
          {isOnline ? (
            <>
              <Wifi className="w-4 h-4 text-green-600" />
              <span className="text-stone-500">Online. Ready to scrape.</span>
            </>
          ) : (
            <>
              <WifiOff className="w-4 h-4 text-orange-600" />
              <span className="text-stone-500">Offline. Campfire mode.</span>
            </>
          )}
        </div>
      </aside>

      {/* Main dashboard content */}
      <div className="flex-grow flex flex-col min-w-0">
        
        {/* Unified Sticky Search and Transpose Header */}
        <header className="bg-[#f5f3ef]/90 backdrop-blur sticky top-0 z-30 border-b border-[#e3ded5] px-4 py-3 md:px-8 flex items-center justify-between gap-4 shadow-sm select-none">
          {/* Logo / Brand (Left) */}
          <div className="flex items-center gap-2 select-none shrink-0">
            <Flame className="w-5 h-5 text-red-600 fill-red-600" />
            <span className="font-bold text-sm tracking-wide font-display text-stone-900 hidden sm:inline">Campfire Chords</span>
          </div>

          {/* Search Box (Center, expands) */}
          <div className="relative flex-grow max-w-lg">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <input
              type="text"
              placeholder="Search songs, artists, or lyrics..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-stone-200 rounded-lg text-sm placeholder-stone-400 focus:border-red-600 focus:ring-1 focus:ring-red-600/20 shadow-sm transition-all"
            />
          </div>

          {/* Transpose Key Control Pill (Right, big and bold!) */}
          <div className="flex items-center gap-2 bg-white border border-stone-200 rounded-full py-0.5 px-3 shadow-sm select-none shrink-0">
            <button
              onClick={() => setTransposeOffset(prev => prev - 1)}
              className="w-8 h-8 flex items-center justify-center text-lg font-extrabold text-stone-600 hover:text-red-650 active:scale-90 transition"
              title="Transpose Down"
            >
              -
            </button>
            <div className="flex flex-col items-center justify-center min-w-[52px]">
              <span className="text-[8px] uppercase text-stone-400 font-bold leading-none tracking-wider">
                {activeSong ? 'Key' : 'Key Shift'}
              </span>
              <span className="font-mono text-sm font-black text-red-600 mt-0.5 leading-none">
                {activeSong 
                  ? transposeChord(activeSong.key, transposeOffset) 
                  : (transposeOffset > 0 ? `+${transposeOffset}` : transposeOffset)}
              </span>
            </div>
            <button
              onClick={() => setTransposeOffset(prev => prev + 1)}
              className="w-8 h-8 flex items-center justify-center text-lg font-extrabold text-stone-600 hover:text-red-650 active:scale-90 transition"
              title="Transpose Up"
            >
              +
            </button>
            {transposeOffset !== 0 && (
              <button
                onClick={() => setTransposeOffset(0)}
                className="text-[9px] uppercase font-bold text-stone-400 hover:text-red-600 pl-1.5 border-l border-stone-150 transition"
                title="Reset Transposition"
              >
                Reset
              </button>
            )}
          </div>
        </header>

        {/* Content Body */}
        <main className="flex-grow p-4 md:p-8 overflow-y-auto max-w-6xl w-full mx-auto">
          
          {activeSong ? (
            <div className="relative">
              <SongViewer 
                song={activeSong} 
                transposeOffset={transposeOffset}
                setTransposeOffset={setTransposeOffset}
                onBack={() => {
                  setActiveSongId(null);
                  setActivePlaylistSongs([]);
                }}
                onToggleFavorite={handleToggleFavorite}
                playlists={playlists}
                onAddSongToPlaylist={handleAddSongToPlaylist}
              />
              
              {activePlaylistSongs.length > 0 && (
                (() => {
                  const playlistIndex = activePlaylistSongs.findIndex(s => s.id === activeSongId);
                  const hasNext = playlistIndex !== -1 && playlistIndex < activePlaylistSongs.length - 1;
                  const hasPrev = playlistIndex > 0;
                  return (
                    <div className="fixed bottom-28 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 bg-stone-900/95 border border-stone-850 rounded-full px-4 py-2 shadow-2xl backdrop-blur">
                      <button
                        onClick={handlePrevSong}
                        disabled={!hasPrev}
                        className={`p-1.5 rounded-full transition ${hasPrev ? 'bg-stone-800 text-red-500 hover:bg-stone-700' : 'text-stone-600 cursor-not-allowed'}`}
                        title="Previous song in setlist"
                      >
                        <ChevronLeft className="w-5 h-5" />
                      </button>
                      <span className="text-[10px] text-stone-400 font-bold uppercase select-none font-sans">
                        Setlist: {playlistIndex + 1} / {activePlaylistSongs.length}
                      </span>
                      <button
                        onClick={handleNextSong}
                        disabled={!hasNext}
                        className={`p-1.5 rounded-full transition ${hasNext ? 'bg-stone-800 text-red-500 hover:bg-stone-700' : 'text-stone-600 cursor-not-allowed'}`}
                        title="Next song in setlist"
                      >
                        <ChevronRight className="w-5 h-5" />
                      </button>
                    </div>
                  );
                })()
              )}
            </div>
          ) : (
            <>
              {/* TAB 1: SONG LIBRARY */}
              {activeTab === 'library' && !selectedPlaylistId && (
                <div className="animate-fade-in flex flex-col gap-6">
                  {filteredSongs.length === 0 && !searchQuery.trim() ? (
                    <div className="text-center py-20 bg-white border border-stone-200/80 rounded-xl shadow-sm max-w-xl mx-auto mt-8 select-none">
                      <div className="w-16 h-16 bg-red-600/5 border border-red-600/10 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
                        <Flame className="w-8 h-8 text-red-600 fill-red-600" />
                      </div>
                      <h3 className="text-lg font-bold text-stone-900 font-display">Campfire Chords</h3>
                      <p className="text-xs text-stone-500 mt-1.5 max-w-xs mx-auto leading-relaxed">
                        Type in the search bar above to instantly find guitar chords and transpose keys.
                      </p>
                    </div>
                  ) : filteredSongs.length === 0 ? (
                    <div className="text-center py-16 bg-white border border-stone-200 rounded-lg shadow-sm max-w-xl mx-auto mt-8">
                      <Search className="w-10 h-10 text-stone-300 mx-auto mb-3" />
                      <p className="text-stone-800 font-semibold">No matches found for "{searchQuery}"</p>
                      <p className="text-xs text-stone-500 mt-1 max-w-xs mx-auto">Try searching for Vietnamese songs with or without accents, or songwriter/composer names.</p>
                    </div>
                  ) : (
                    <div>
                      <h2 className="text-xs uppercase font-bold tracking-widest text-stone-500 mb-3 flex items-center gap-1.5 font-sans">
                        <Music className="w-3.5 h-3.5" /> Search Results ({filteredSongs.length})
                      </h2>
                      <div className="songs-grid">
                        {filteredSongs.map(song => (
                          <div 
                            key={song.id}
                            onClick={() => setActiveSongId(song.id)}
                            className="bg-white border border-stone-200/80 hover:border-red-605/30 rounded-lg p-4 cursor-pointer transition-all hover:-translate-y-0.5 shadow-sm hover:shadow flex items-center justify-between"
                          >
                            <div className="truncate pr-4">
                              <div className="flex items-center gap-1.5">
                                {song.isFavorite && <Heart className="w-3.5 h-3.5 fill-red-600 text-red-600 shrink-0" />}
                                <h3 className="font-bold text-sm text-stone-900 truncate">{song.title}</h3>
                              </div>
                              <p className="text-xs text-stone-500 truncate mt-0.5">{song.artist}{song.composer ? ` • ${song.composer}` : ''}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[10px] font-bold text-stone-500 bg-stone-100 px-1.5 py-0.5 rounded">
                                {song.key}
                              </span>
                              <button 
                                onClick={(e) => handleDeleteSong(song.id, e)}
                                className="p-1 hover:bg-stone-100 text-stone-400 hover:text-red-600 rounded transition"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
            </div>
          )}

          {/* TAB 2: CAMPFIRE SETLISTS */}
          {activeTab === 'setlists' && (
            <div className="animate-fade-in flex flex-col gap-6">
              
              {selectedPlaylistId ? (
                (() => {
                  const playlist = playlists.find(p => p.id === selectedPlaylistId);
                  if (!playlist) return null;
                  
                  return (
                    <div className="flex flex-col gap-4">
                      <button 
                        onClick={() => setSelectedPlaylistId(null)}
                        className="text-xs font-semibold text-red-600 hover:text-red-700 flex items-center gap-1 self-start"
                      >
                        <ChevronLeft className="w-4 h-4" /> Back to Setlists
                      </button>

                      <div className="flex items-center justify-between border-b border-stone-200 pb-3">
                        <div>
                          <h2 className="text-xl font-bold text-stone-900 font-display">{playlist.name}</h2>
                          <p className="text-xs text-stone-500">{playlist.songIds.length} songs queued</p>
                        </div>
                        <button
                          onClick={(e) => handleDeletePlaylist(playlist.id, e)}
                          className="px-3 py-1.5 bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 text-xs rounded transition flex items-center gap-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Delete Setlist
                        </button>
                      </div>

                      {playlist.songIds.length === 0 ? (
                        <div className="text-center py-12 bg-white border border-stone-200 rounded-lg shadow-sm">
                          <p className="text-stone-800 font-semibold">This setlist is empty.</p>
                          <p className="text-xs text-stone-500 mt-1 max-w-sm mx-auto">Browse your library and add songs to this setlist to prepare for the campfire!</p>
                          <button 
                            onClick={() => { setSelectedPlaylistId(null); setActiveTab('library'); }}
                            className="mt-4 px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs rounded transition"
                          >
                            Browse Songs
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2">
                          {playlist.songIds.map((songId, idx) => {
                            const song = songs.find(s => s.id === songId);
                            if (!song) return null;
                            return (
                              <div
                                key={songId}
                                onClick={() => handleOpenSongFromPlaylist(song.id, playlist.songIds)}
                                className="bg-white hover:bg-stone-50 border border-stone-200 rounded-lg p-4 flex items-center justify-between cursor-pointer transition group shadow-sm"
                              >
                                <div className="flex items-center gap-3">
                                  <span className="font-mono text-xs font-bold text-stone-400 w-5">{idx + 1}.</span>
                                  <div>
                                    <h3 className="font-bold text-sm text-stone-900 group-hover:text-red-600 transition-colors">{song.title}</h3>
                                    <p className="text-xs text-stone-500">{song.artist}{song.composer ? ` • ${song.composer}` : ''}</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="font-mono text-xs font-semibold text-stone-500">{song.key}</span>
                                  <button
                                    onClick={(e) => handleRemoveSongFromPlaylist(playlist.id, song.id, e)}
                                    className="p-1 hover:bg-stone-100 text-stone-400 hover:text-red-600 rounded transition"
                                    title="Remove from setlist"
                                  >
                                    <FolderMinus className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()
              ) : (
                // Playlist listing dashboard
                <div className="flex flex-col gap-6">
                  <div className="border-b border-stone-200 pb-4">
                    <h2 className="text-lg font-bold text-stone-900 font-display">Campfire Setlists</h2>
                    <p className="text-xs text-stone-500">Organize lists of songs to swipe through during a campfire night.</p>
                  </div>

                  {/* Create Playlist Form */}
                  <form onSubmit={handleCreatePlaylist} className="flex gap-2 max-w-md">
                    <input
                      type="text"
                      placeholder="E.g. Acoustic Night, Pop Favorites..."
                      value={newPlaylistName}
                      onChange={(e) => setNewPlaylistName(e.target.value)}
                      className="flex-grow px-3 py-2 bg-white border border-stone-200 rounded text-sm placeholder-stone-400 shadow-sm"
                    />
                    <button
                      type="submit"
                      className="px-4 py-2 bg-red-600 text-white font-semibold text-xs rounded hover:bg-red-750 transition flex items-center gap-1.5 shadow-md"
                    >
                      <FolderPlus className="w-4 h-4" /> Create Setlist
                    </button>
                  </form>

                  {/* Playlists grid */}
                  {playlists.length === 0 ? (
                    <p className="text-stone-500 text-sm italic py-4">No setlists created yet.</p>
                  ) : (
                    <div className="songs-grid">
                      {playlists.map(pl => (
                        <div
                          key={pl.id}
                          onClick={() => setSelectedPlaylistId(pl.id)}
                          className="bg-white hover:bg-stone-50 border border-stone-200 rounded-lg p-5 cursor-pointer transition flex flex-col justify-between h-32 group shadow-sm hover:shadow"
                        >
                          <div>
                            <h3 className="font-bold text-base text-stone-900 group-hover:text-red-600 transition-colors">{pl.name}</h3>
                            <p className="text-xs text-stone-500 mt-1">{pl.songIds.length} songs</p>
                          </div>
                          
                          <div className="flex items-center justify-between text-xs text-stone-500 font-semibold">
                            <span>Open Setlist</span>
                            <ArrowRight className="w-4 h-4 text-red-600 transition-transform group-hover:translate-x-1" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: ADD AND SCRAPE */}
          {activeTab === 'add' && (
            <div className="animate-fade-in flex flex-col gap-8">
              
              {/* Scraper Section */}
              <div className="bg-white border border-stone-200 rounded-xl p-6 shadow-sm">
                <h2 className="text-base font-bold text-stone-900 mb-2 font-display flex items-center gap-2">
                  <Globe className="w-5 h-5 text-red-600" /> Scrape from HopAmChuan.com
                </h2>
                <p className="text-xs text-stone-500 mb-4 leading-relaxed">
                  Enter a song details page URL from hopamchuan.com. The server will fetch and compile it into ChordPro, adding it to your offline database.
                </p>

                <form onSubmit={handleScrapeSong} className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="url"
                    placeholder="https://hopamchuan.com/song/500/nho-oi"
                    value={newSongUrl}
                    onChange={(e) => setNewSongUrl(e.target.value)}
                    disabled={!isOnline}
                    className="flex-grow px-3 py-2 bg-white border border-stone-200 rounded text-sm placeholder-stone-400 disabled:opacity-50 shadow-sm"
                  />
                  <button
                    type="submit"
                    disabled={!isOnline || isScraping}
                    className="px-6 py-2.5 bg-red-600 text-white font-bold text-xs rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition shrink-0 shadow-md"
                  >
                    {isScraping ? 'Scraping...' : 'Fetch Song'}
                  </button>
                </form>

                {scrapeError && (
                  <p className="text-xs text-red-600 mt-2 font-semibold">Error: {scrapeError}</p>
                )}
                {scrapeSuccess && (
                  <p className="text-xs text-green-600 mt-2 font-semibold">Song imported successfully!</p>
                )}
                {!isOnline && (
                  <p className="text-[10px] text-orange-600 mt-2 font-medium flex items-center gap-1">
                    <WifiOff className="w-3 h-3" /> Connect to the internet to fetch new songs dynamically.
                  </p>
                )}
              </div>

              {/* HopAmViet Category Scraper Tool */}
              <div className="bg-white border border-stone-200 rounded-xl p-6 shadow-sm">
                <h2 className="text-base font-bold text-stone-900 mb-2 font-display flex items-center gap-2">
                  <Globe className="w-5 h-5 text-red-600" /> HopAmViet Category Scraper Tool
                </h2>
                <p className="text-xs text-stone-500 mb-4 leading-relaxed">
                  Generate a custom script to crawl entire categories of songs from <b>hopamviet.vn</b> (e.g. Nhạc Vàng, Nhạc Trẻ) directly via your browser, bypassing Cloudflare. 
                  {directImport ? " Songs will be saved directly into your local database in real-time!" : " It will compile all songs into a single JSON file for manual upload."}
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] uppercase font-bold text-stone-400">Category / List URL</label>
                    <input
                      type="url"
                      value={categoryUrl}
                      onChange={(e) => setCategoryUrl(e.target.value)}
                      placeholder="https://hopamviet.vn/chord/category/1/nhac-vang"
                      className="px-3 py-2.5 bg-white border border-stone-200 rounded text-sm placeholder-stone-400 shadow-sm"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] uppercase font-bold text-stone-400">Start Page</label>
                      <input
                        type="number"
                        min="1"
                        value={startPage}
                        onChange={(e) => setStartPage(Math.max(1, parseInt(e.target.value) || 1))}
                        className="px-3 py-2.5 bg-white border border-stone-200 rounded text-sm shadow-sm"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] uppercase font-bold text-stone-400">End Page</label>
                      <input
                        type="number"
                        min={startPage}
                        value={endPage}
                        onChange={(e) => setEndPage(Math.max(startPage, parseInt(e.target.value) || startPage))}
                        className="px-3 py-2.5 bg-white border border-stone-200 rounded text-sm shadow-sm"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 mb-4">
                  <input
                    type="checkbox"
                    id="directImportCheck"
                    checked={directImport}
                    onChange={(e) => setDirectImport(e.target.checked)}
                    className="w-4 h-4 text-red-650 border-stone-300 rounded focus:ring-red-500/20"
                  />
                  <label htmlFor="directImportCheck" className="text-xs font-semibold text-stone-700 select-none cursor-pointer">
                    Directly import to local app database (CORS upload to http://localhost:3000)
                  </label>
                </div>

                <div className="flex flex-col gap-2 bg-[#f5f3ef]/45 border border-stone-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold text-stone-500">How to use:</span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(generateScraperScript());
                        setCopiedScript(true);
                        setTimeout(() => setCopiedScript(false), 2000);
                      }}
                      className="px-3 py-1.5 bg-red-600 text-white font-bold text-[11px] rounded hover:bg-red-755 transition shadow-sm active:scale-95"
                    >
                      {copiedScript ? 'Copied script!' : 'Copy Scraper Script'}
                    </button>
                  </div>
                  <ol className="text-xs text-stone-600 list-decimal list-inside flex flex-col gap-1.5 mt-2 leading-relaxed">
                    <li>Open <b><a href={`${categoryUrl}${startPage > 1 ? (categoryUrl.includes('?') ? '&' : '?') + 'page=' + startPage : ''}`} target="_blank" rel="noreferrer" className="text-red-600 hover:underline inline-flex items-center gap-0.5">this link in a new browser tab <ChevronRight className="w-3.5 h-3.5" /></a></b>.</li>
                    <li>Press <b>Option + Command + J</b> (Mac) or <b>F12</b> (Windows) to open Developer Console.</li>
                    <li>Paste the copied script and press <b>Enter</b>.</li>
                    <li>Keep the tab open and watch the songs crawl and save in real-time!</li>
                  </ol>
                </div>
              </div>

              {/* Batch JSON Importer Section */}
              <div className="bg-white border border-stone-200 rounded-xl p-6 shadow-sm">
                <h2 className="text-base font-bold text-stone-900 mb-2 font-display flex items-center gap-2">
                  <Upload className="w-5 h-5 text-red-600" /> Batch JSON Song Importer
                </h2>
                <p className="text-xs text-stone-500 mb-4 leading-relaxed">
                  Have a scraped song list (like <b>hopamviet_nhac_vang.json</b>)? Upload it here. The application will import all songs, convert text chords to bracket layouts, and cache them locally.
                </p>

                <div className="relative group border-2 border-dashed border-stone-200 hover:border-red-600/40 bg-[#f5f3ef]/30 hover:bg-[#f5f3ef]/60 rounded-xl p-8 transition flex flex-col items-center justify-center cursor-pointer">
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleFileImport}
                    disabled={isImportingFile}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                    title=""
                  />
                  <div className="p-3 bg-white rounded-full shadow-sm border border-stone-200/60 mb-3 group-hover:scale-105 transition-transform">
                    <Upload className="w-6 h-6 text-stone-500 group-hover:text-red-650 transition-colors" />
                  </div>
                  <span className="text-sm font-semibold text-stone-850 group-hover:text-red-600 transition-colors">
                    {isImportingFile ? 'Uploading & Parsing...' : 'Select JSON File'}
                  </span>
                  <span className="text-[11px] text-stone-400 mt-1 select-none">
                    Supports JSON array files containing songs
                  </span>
                </div>

                {importFileStatus && (
                  <div className={`mt-4 p-3 rounded-lg border text-xs font-medium flex items-center gap-2 animate-fade-in ${
                    importFileStatus.type === 'success' 
                      ? 'bg-green-50 border-green-200 text-green-700' 
                      : importFileStatus.type === 'error'
                      ? 'bg-red-50 border-red-200 text-red-700'
                      : 'bg-stone-50 border-stone-200 text-stone-700'
                  }`}>
                    <Info className="w-4 h-4 shrink-0" />
                    <span>{importFileStatus.message}</span>
                  </div>
                )}
              </div>

              {/* Paste Importer Section */}
              <div className="bg-white border border-stone-200 rounded-xl p-6 shadow-sm">
                <h2 className="text-base font-bold text-stone-900 mb-2 font-display flex items-center gap-2">
                  <FileText className="w-5 h-5 text-red-600" /> Copy-Paste / Manual Chords Importer
                </h2>
                <p className="text-xs text-stone-500 mb-4 leading-relaxed">
                  Use this to copy-paste songs from <b>hopamviet.vn</b> (or other chord sheets). Paste the block containing the text and chords. Our intelligent system automatically converts standard "chords-above-lyrics" lines into unified ChordPro brackets format!
                </p>

                <form onSubmit={handlePasteImport} className="flex flex-col gap-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] uppercase font-bold text-stone-400">Song Title *</label>
                      <input
                        type="text"
                        placeholder="E.g. Nhỏ Ơi"
                        required
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        className="px-3 py-2 bg-white border border-stone-200 rounded text-sm placeholder-stone-400 shadow-sm"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] uppercase font-bold text-stone-400">Artist / Singer</label>
                      <input
                        type="text"
                        placeholder="E.g. Chí Tài"
                        value={newArtist}
                        onChange={(e) => setNewArtist(e.target.value)}
                        className="px-3 py-2 bg-white border border-stone-200 rounded text-sm placeholder-stone-400 shadow-sm"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] uppercase font-bold text-stone-400">Song Writer / Composer</label>
                      <input
                        type="text"
                        placeholder="E.g. Quang Nhật"
                        value={newComposer}
                        onChange={(e) => setNewComposer(e.target.value)}
                        className="px-3 py-2 bg-white border border-stone-200 rounded text-sm placeholder-stone-400 shadow-sm"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] uppercase font-bold text-stone-400">Rhythm / Điệu</label>
                      <input
                        type="text"
                        placeholder="E.g. Valse, Slow Rock"
                        value={newRhythm}
                        onChange={(e) => setNewRhythm(e.target.value)}
                        className="px-3 py-2 bg-white border border-stone-200 rounded text-sm placeholder-stone-400 shadow-sm"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] uppercase font-bold text-stone-400">Default Key</label>
                      <select
                        value={newKey}
                        onChange={(e) => setNewKey(e.target.value)}
                        className="px-3 py-2.5 bg-white border border-stone-200 rounded text-sm shadow-sm"
                      >
                        {['C','C#','Db','D','D#','Eb','E','F','F#','Gb','G','G#','Ab','A','A#','Bb','B','Am','A#m','Bbm','Bm','Cm','C#m','Dm','D#m','Em','Fm','F#m','Gm','G#m'].map(k => (
                          <option key={k} value={k}>{k}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] uppercase font-bold text-stone-400">Paste Lyrics & Chords Here *</label>
                    <textarea
                      placeholder="Paste text. Examples:
  Am          C
Một ngày nắng xanh
  Dm            Am
Ta đi tìm bóng mát"
                      required
                      rows="8"
                      value={newPasteText}
                      onChange={(e) => setNewPasteText(e.target.value)}
                      className="px-3 py-2 bg-white border border-stone-200 rounded text-sm font-mono placeholder-stone-400 leading-relaxed focus:border-red-650 shadow-sm"
                    ></textarea>
                  </div>

                  <button
                    type="submit"
                    disabled={isImporting}
                    className="w-full py-2.5 bg-red-600 text-white font-bold text-xs rounded hover:bg-red-700 transition shadow-md"
                  >
                    {isImporting ? 'Importing...' : 'Save & Import Chords'}
                  </button>

                  {importError && (
                    <p className="text-xs text-red-600 mt-1 font-semibold">{importError}</p>
                  )}
                  {importSuccess && (
                    <p className="text-xs text-green-600 mt-1 font-semibold">Chords imported and saved!</p>
                  )}
                </form>
              </div>

            </div>
          )}
            </>
          )}
        </main>
      </div>

      {/* Bottom Nav Bar - Mobile only */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#f5f3ef]/95 border-t border-[#e3ded5] flex items-center justify-around py-2.5 shadow-2xl backdrop-blur-md">
        <button
          onClick={() => { setActiveTab('library'); setSelectedPlaylistId(null); }}
          className={`flex flex-col items-center gap-1 text-[10px] font-semibold transition-all ${
            activeTab === 'library' && !selectedPlaylistId ? 'text-red-600' : 'text-stone-500'
          }`}
        >
          <Music className="w-5 h-5" />
          <span>Library</span>
        </button>
        <button
          onClick={() => setActiveTab('setlists')}
          className={`flex flex-col items-center gap-1 text-[10px] font-semibold transition-all ${
            activeTab === 'setlists' ? 'text-red-600' : 'text-stone-500'
          }`}
        >
          <ListMusic className="w-5 h-5" />
          <span>Setlists</span>
        </button>
        <button
          onClick={() => setActiveTab('add')}
          className={`flex flex-col items-center gap-1 text-[10px] font-semibold transition-all ${
            activeTab === 'add' ? 'text-red-600' : 'text-stone-500'
          }`}
        >
          <PlusCircle className="w-5 h-5" />
          <span>Add Songs</span>
        </button>
      </nav>

    </div>
  );
}
