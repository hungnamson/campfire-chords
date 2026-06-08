import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  Upload,
  X,
  Menu,
  Maximize2,
  Minimize2,
  Mic,
  Sparkles
} from 'lucide-react';
import SongViewer from './components/SongViewer';
import InstrumentTuner from './components/InstrumentTuner';
import { transposeChord, NOTE_TO_SEMITONE } from './utils/transposer';

const API_BASE = '/api';

const removeAccents = (str) => {
  if (!str) return '';
  return str
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd');
};

export default function App() {
  const [songs, setSongs] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [isLoadingSongs, setIsLoadingSongs] = useState(true);
  const [fetchSongsError, setFetchSongsError] = useState(false);
  const [activeSongId, setActiveSongId] = useState(null);
  const [activeTab, setActiveTab] = useState('library'); // library, setlists, add
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [onlineResults, setOnlineResults] = useState([]);
  const [isSearchingOnline, setIsSearchingOnline] = useState(false);
  const [onlineSong, setOnlineSong] = useState(null);
  const [isSavingToLibrary, setIsSavingToLibrary] = useState(false);
  const [forceOnlineSearch, setForceOnlineSearch] = useState(false);
  const searchInputRef = useRef(null);
  const settingsContainerRef = useRef(null);
  const keySelectorContainerRef = useRef(null);

  const suggestions = useMemo(() => {
    if (!searchInput.trim()) return [];
    const query = removeAccents(searchInput).trim();
    if (!query) return [];
    
    return songs
      .map(song => {
        const cleanTitle = removeAccents(song.title);
        const cleanArtist = removeAccents(song.artist);
        
        let score = 0;
        if (cleanTitle.startsWith(query)) {
          score += 100;
        } else if (cleanTitle.includes(query)) {
          score += 50;
        }
        if (cleanArtist.includes(query)) {
          score += 10;
        }
        
        return score > 0 ? { song, score } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .map(item => item.song)
      .slice(0, 8);
  }, [searchInput, songs]);

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

  const [transposeOffset, setTransposeOffset] = useState(0);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [fontSize, setFontSize] = useState(() => {
    const saved = localStorage.getItem('campfire_font_size');
    return saved ? parseInt(saved, 10) : 16;
  });
  const [isCompact, setIsCompact] = useState(() => {
    const saved = localStorage.getItem('campfire_is_compact');
    if (saved !== null) return saved === 'true';
    return window.innerWidth < 768;
  });
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [instrument, setInstrument] = useState(() => {
    return localStorage.getItem('campfire_instrument') || 'guitar';
  });
  const [showKeySelector, setShowKeySelector] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [showTuner, setShowTuner] = useState(false);
  const [cleanupResult, setCleanupResult] = useState(null);
  const [isCleaningDb, setIsCleaningDb] = useState(false);

  // Authentication & User profile states
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = localStorage.getItem('campfire_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState('login'); // 'login', 'register', 'recover-email', 'recover-answer', 'recovered'
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authQuestion, setAuthQuestion] = useState('What is your favorite instrument?');
  const [authAnswer, setAuthAnswer] = useState('');
  const [authAnswerInput, setAuthAnswerInput] = useState('');
  const [recoveredPassword, setRecoveredPassword] = useState('');
  const [recoveredQuestionText, setRecoveredQuestionText] = useState('');
  const [authError, setAuthError] = useState(null);
  const [authSuccess, setAuthSuccess] = useState(null);

  // User personalizations (favorites list and play history)
  const [userFavoritesList, setUserFavoritesList] = useState([]);
  const [playHistory, setPlayHistory] = useState([]);

  const fetchUserFavorites = async () => {
    if (!currentUser) return;
    try {
      const res = await fetch(`${API_BASE}/user/${currentUser.id}/favorites`);
      if (res.ok) {
        const data = await res.json();
        setUserFavoritesList(data);
      }
    } catch (e) {
      console.error('Error fetching user favorites:', e);
    }
  };

  const fetchPlayHistory = async () => {
    if (!currentUser) return;
    try {
      const res = await fetch(`${API_BASE}/user/${currentUser.id}/history`);
      if (res.ok) {
        const data = await res.json();
        setPlayHistory(data);
      }
    } catch (e) {
      console.error('Error fetching play history:', e);
    }
  };

  const incrementSongPlayCount = async (songId) => {
    if (!currentUser) return;
    try {
      const res = await fetch(`${API_BASE}/user/${currentUser.id}/history/increment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ songId })
      });
      if (res.ok) {
        fetchPlayHistory();
      }
    } catch (e) {
      console.error('Error incrementing play count:', e);
    }
  };

  const isSongFavorited = (song) => {
    if (currentUser) {
      return userFavoritesList.includes(song.id);
    }
    return song?.isFavorite || false;
  };

  // Load favorites and history when currentUser changes
  useEffect(() => {
    if (currentUser) {
      fetchUserFavorites();
      fetchPlayHistory();
    } else {
      setUserFavoritesList([]);
      setPlayHistory([]);
    }
  }, [currentUser]);

  // Close settings menu and key selector when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showSettingsMenu && settingsContainerRef.current && !settingsContainerRef.current.contains(event.target)) {
        setShowSettingsMenu(false);
      }
      if (showKeySelector && keySelectorContainerRef.current && !keySelectorContainerRef.current.contains(event.target)) {
        setShowKeySelector(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [showSettingsMenu, showKeySelector]);

  // Automatically record song play events when a song details sheet is opened
  useEffect(() => {
    if (activeSongId && currentUser) {
      incrementSongPlayCount(activeSongId);
    }
  }, [activeSongId]);

  // Persist font size, compact state, and instrument changes
  useEffect(() => {
    localStorage.setItem('campfire_font_size', fontSize);
  }, [fontSize]);

  useEffect(() => {
    localStorage.setItem('campfire_is_compact', isCompact);
  }, [isCompact]);

  useEffect(() => {
    localStorage.setItem('campfire_instrument', instrument);
  }, [instrument]);
  
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
  const [categoryUrl, setCategoryUrl] = useState('https://example.com/chord/category/1/nhac-vang');
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
      if (activeSongId !== null && activeSongId !== 'online') {
        setActiveSongId(null);
      }
      if (activeTab !== 'library') {
        setActiveTab('library');
      }
      if (selectedPlaylistId !== null) {
        setSelectedPlaylistId(null);
      }
    } else {
      setForceOnlineSearch(false);
    }
  }, [searchQuery]);

  // Clear online song when active song changes away from online
  useEffect(() => {
    if (activeSongId !== 'online') {
      setOnlineSong(null);
    }
  }, [activeSongId]);

  // Automatically search online if no local matches are found
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setOnlineResults([]);
      setIsSearchingOnline(false);
      return;
    }

    if (!forceOnlineSearch && filteredSongs.length > 0) {
      setOnlineResults([]);
      setIsSearchingOnline(false);
      return;
    }

    let active = true;
    const searchOnline = async () => {
      setIsSearchingOnline(true);
      setOnlineResults([]);
      try {
        const res = await fetch(`${API_BASE}/online-search?q=${encodeURIComponent(trimmed)}`);
        if (!res.ok) throw new Error('Search failed');
        const data = await res.json();
        if (active) {
          setOnlineResults(data);
        }
      } catch (err) {
        console.error('Online search error:', err);
      } finally {
        if (active) {
          setIsSearchingOnline(false);
        }
      }
    };

    searchOnline();

    return () => {
      active = false;
    };
  }, [searchQuery, filteredSongs.length, forceOnlineSearch]);

  const handleOpenOnlineSong = async (url) => {
    setIsSearchingOnline(true);
    try {
      const res = await fetch(`${API_BASE}/online-song?url=${encodeURIComponent(url)}`);
      if (!res.ok) {
        throw new Error('Failed to fetch online song');
      }
      const songData = await res.json();
      setOnlineSong({
        ...songData,
        id: 'online',
        url
      });
      setActiveSongId('online');
    } catch (e) {
      console.error('Error opening online song:', e);
      alert('Không thể tải bài hát trực tuyến. Vui lòng thử lại sau.');
    } finally {
      setIsSearchingOnline(false);
    }
  };

  const handleSaveOnlineSongToLibrary = async (songToSave) => {
    setIsSavingToLibrary(true);
    try {
      const res = await fetch(`${API_BASE}/songs/scrape`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ url: songToSave.url })
      });
      
      if (!res.ok) {
        throw new Error('Failed to save song to library');
      }
      
      const savedSong = await res.json();
      await fetchSongs();
      setOnlineSong(null);
      setActiveSongId(savedSong.id);
      setSearchQuery('');
      setSearchInput('');
    } catch (e) {
      console.error('Error saving online song:', e);
      alert('Không thể lưu bài hát vào thư viện: ' + e.message);
    } finally {
      setIsSavingToLibrary(false);
    }
  };

  const fetchSongs = async () => {
    setIsLoadingSongs(true);
    setFetchSongsError(false);
    try {
      const res = await fetch(`${API_BASE}/songs`);
      if (!res.ok) {
        throw new Error('Failed to fetch songs');
      }
      const data = await res.json();
      setSongs(data);
    } catch (e) {
      console.error('Error fetching songs:', e);
      setFetchSongsError(true);
    } finally {
      setIsLoadingSongs(false);
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
    if (currentUser) {
      try {
        const res = await fetch(`${API_BASE}/user/${currentUser.id}/favorites/toggle`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ songId })
        });
        if (res.ok) {
          const updatedFavs = await res.json();
          setUserFavoritesList(updatedFavs);
        }
      } catch (e) {
        console.error('Error toggling user favorite:', e);
      }
    } else {
      try {
        const res = await fetch(`${API_BASE}/songs/${songId}/favorite`, { method: 'POST' });
        if (res.ok) {
          setSongs(prev => prev.map(s => s.id === songId ? { ...s, isFavorite: !s.isFavorite } : s));
        }
      } catch (e) {
        console.error(e);
      }
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

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSuccess(null);
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: authEmail, password: authPassword })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Login failed');
      }
      
      setCurrentUser(data);
      localStorage.setItem('campfire_user', JSON.stringify(data));
      setShowAuthModal(false);
      setAuthPassword('');
    } catch (err) {
      setAuthError(err.message);
    }
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSuccess(null);
    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: authEmail,
          password: authPassword,
          securityQuestion: authQuestion,
          securityAnswer: authAnswer
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Registration failed');
      }
      
      setAuthSuccess('Đăng ký thành công! Đang tự động đăng nhập...');
      setTimeout(() => {
        setCurrentUser(data);
        localStorage.setItem('campfire_user', JSON.stringify(data));
        setShowAuthModal(false);
        setAuthSuccess(null);
        setAuthPassword('');
        setAuthAnswer('');
      }, 1500);
    } catch (err) {
      setAuthError(err.message);
    }
  };

  const handleRecoverEmailSubmit = async (e) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSuccess(null);
    try {
      const res = await fetch(`${API_BASE}/auth/recover-question`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: authEmail })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Email not found');
      }
      
      setRecoveredQuestionText(data.securityQuestion);
      setAuthMode('recover-answer');
      setAuthAnswerInput('');
    } catch (err) {
      setAuthError(err.message);
    }
  };

  const handleRecoverAnswerSubmit = async (e) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSuccess(null);
    try {
      const res = await fetch(`${API_BASE}/auth/recover-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: authEmail, securityAnswer: authAnswerInput })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Incorrect security answer');
      }
      
      setRecoveredPassword(data.password);
      setAuthMode('recovered');
    } catch (err) {
      setAuthError(err.message);
    }
  };

  const handleTriggerCleanup = async () => {
    setIsCleaningDb(true);
    try {
      const res = await fetch(`${API_BASE}/songs/cleanup`, { method: 'POST' });
      if (!res.ok) {
        throw new Error('Dọn dẹp thất bại hoặc có lỗi xảy ra.');
      }
      const data = await res.json();
      if (data && data.success) {
        setCleanupResult(data);
        fetchSongs(); // Refetch the updated song list
        fetchPlaylists(); // Refetch playlists since they might have updated IDs
      } else {
        alert('Dọn dẹp thất bại hoặc có lỗi xảy ra.');
      }
    } catch (e) {
      console.error(e);
      alert('Không thể kết nối đến server để thực hiện dọn dẹp.');
    } finally {
      setIsCleaningDb(false);
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

  console.log("🔥 Category Browser Scraper Started!");
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
                  artist = siblingDiv.innerText.replace(/\s+/g, " ").trim();
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
                  composer = siblingDiv.innerText.replace(/\s+/g, " ").trim();
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
    downloadAnchor.setAttribute("download", "scraped_songs.json");
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
  const displaySong = activeSongId === 'online' ? onlineSong : activeSong;

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

  const parseKeyRootAndType = (keyStr) => {
    if (!keyStr) return { root: 'C', isMinor: false };
    let root = keyStr[0];
    let suffix = keyStr.slice(1);
    if (keyStr[1] === '#' || keyStr[1] === 'b') {
      root = keyStr.slice(0, 2);
      suffix = keyStr.slice(2);
    }
    const isMinor = suffix.startsWith('m') && !suffix.startsWith('maj') && !suffix.startsWith('M');
    return { root, isMinor };
  };

  const handleSelectKey = (targetKey) => {
    if (!displaySong) return;
    const { root: originalRoot } = parseKeyRootAndType(displaySong.key);
    const { root: targetRoot } = parseKeyRootAndType(targetKey);
    
    const originalSemi = NOTE_TO_SEMITONE[originalRoot];
    const targetSemi = NOTE_TO_SEMITONE[targetRoot];
    
    if (originalSemi === undefined || targetSemi === undefined) return;
    
    let diff = targetSemi - originalSemi;
    while (diff > 5) diff -= 12;
    while (diff <= -6) diff += 12;
    
    setTransposeOffset(diff);
  };



  const getAvailableKeys = () => {
    if (!displaySong) return [];
    const { isMinor } = parseKeyRootAndType(displaySong.key);
    if (isMinor) {
      return [
        'Am', 'Dm', 'Em', 'Bm',
        'Cm', 'C#m', 'Ebm', 'Fm',
        'F#m', 'Gm', 'Abm', 'Bbm'
      ];
    } else {
      return [
        'C', 'A', 'D', 'G',
        'Db', 'Eb', 'E', 'F',
        'F#', 'Ab', 'Bb', 'B'
      ];
    }
  };

  return (
    <div className="min-h-screen bg-[#fcfbfa] text-stone-900 font-sans pb-20 md:pb-0 flex flex-col">
      
      {/* Main dashboard content */}
      <div className="flex-grow flex flex-col min-w-0">
        
        {/* Unified Sticky Search and Transpose Header */}
        <header className={`bg-[#f5f3ef]/90 backdrop-blur sticky top-0 z-30 border-b border-[#e3ded5] px-4 py-2 md:py-3 md:px-8 flex items-center justify-between shadow-sm select-none transition-all duration-300 ${
          isSearchFocused ? 'gap-0 md:gap-4' : 'gap-4'
        }`}>
          {/* Logo / Brand (Left) */}
          <div className={`flex items-center gap-2 select-none shrink-0 transition-all duration-300 ease-in-out overflow-hidden whitespace-nowrap ${
            isSearchFocused 
              ? 'max-w-0 opacity-0 pointer-events-none md:max-w-[320px] md:opacity-100 md:pointer-events-auto' 
              : 'max-w-[320px] opacity-100 pointer-events-auto'
          }`}>
            <Flame className="w-5 h-5 text-red-600 fill-red-600" />
            <span className="font-bold text-sm tracking-wide font-display text-stone-900 hidden sm:inline">
              Campfire Chords {songs.length > 0 && `(${songs.length} bài hát)`}
            </span>
            <span className="font-bold text-sm tracking-wide font-display text-stone-900 sm:hidden">
              Campfire Chords {songs.length > 0 && `(${songs.length})`}
            </span>
          </div>

          {/* Search Box (Center, expands) */}
          <div className={`relative flex-grow transition-all duration-300 ease-in-out ${
            isSearchFocused ? 'max-w-full md:max-w-2xl' : 'max-w-2xl'
          }`}>
            <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400 pointer-events-none transition-all duration-200" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder={isSearchFocused ? "" : "Search songs, artists, or lyrics... (Press Enter)"}
              value={searchInput}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setIsSearchFocused(false)}
              onChange={(e) => {
                const val = e.target.value;
                setSearchInput(val);
                if (!val.trim()) {
                  setSearchQuery('');
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setSearchQuery(searchInput);
                  setIsSearchFocused(false);
                  if (searchInputRef.current) {
                    searchInputRef.current.blur();
                  }
                }
              }}
              className="w-full pl-4 pr-20 h-[38px] bg-white border border-stone-200 rounded-lg text-base placeholder-stone-400 focus:border-red-600 focus:ring-1 focus:ring-red-600/20 shadow-sm transition-all duration-200"
            />
            {searchInput && (
              <button
                onClick={() => {
                  setSearchInput('');
                  setSearchQuery('');
                }}
                onMouseDown={(e) => {
                  // Prevent input blur when clicking the erase button
                  e.preventDefault();
                }}
                className="absolute right-10 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-full hover:bg-stone-100 active:bg-stone-200 text-stone-400 hover:text-stone-700 transition-colors cursor-pointer"
                title="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            {isSearchFocused && (suggestions.length > 0 || searchInput.trim().length > 0) && (
              <div className="absolute left-0 right-0 top-full mt-2 bg-white/90 backdrop-blur-md border border-stone-200/80 rounded-xl shadow-xl z-50 overflow-hidden select-none max-h-72 overflow-y-auto no-scrollbar py-1 text-left animate-fade-in">
                {suggestions.map((song) => (
                  <div
                    key={song.id}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setActiveSongId(song.id);
                      setSearchInput('');
                      setSearchQuery('');
                      setIsSearchFocused(false);
                      if (searchInputRef.current) {
                        searchInputRef.current.blur();
                      }
                    }}
                    className="px-4 py-2.5 hover:bg-stone-50 active:bg-stone-100 flex items-center justify-between border-b border-stone-100 last:border-0 cursor-pointer group transition-colors"
                  >
                    <div className="min-w-0 flex-grow pr-3">
                      <div className="font-bold text-sm text-stone-900 group-hover:text-red-750 transition-colors truncate">
                        {song.title}
                      </div>
                      <div className="text-xs text-stone-500 truncate mt-0.5 font-medium">
                        {song.artist} {song.genre ? `• ${song.genre}` : ''}
                      </div>
                    </div>
                    {song.key && (
                      <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded border bg-stone-50 border-stone-200 text-stone-600 shrink-0 font-mono">
                        {song.key}
                      </span>
                    )}
                  </div>
                ))}

                {searchInput.trim().length > 0 && (
                  <div
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setForceOnlineSearch(true);
                      setSearchQuery(searchInput);
                      setIsSearchFocused(false);
                      if (searchInputRef.current) {
                        searchInputRef.current.blur();
                      }
                    }}
                    className="px-4 py-3 hover:bg-blue-50 active:bg-blue-100 flex items-center gap-2 border-t border-stone-100 cursor-pointer text-blue-700 transition-colors font-semibold text-xs"
                  >
                    <Globe className="w-3.5 h-3.5 text-blue-600 animate-pulse" />
                    <span>Tìm trực tuyến cho "{searchInput}"...</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Section: Settings Dropdown */}
          <div ref={settingsContainerRef} className="relative flex items-center gap-2 shrink-0">
            {/* Transitioning button wrapper */}
            <div className={`transition-all duration-300 ease-in-out overflow-hidden whitespace-nowrap ${
              isSearchFocused 
                ? 'max-w-0 opacity-0 pointer-events-none md:max-w-[320px] md:opacity-100 md:pointer-events-auto' 
                : 'max-w-[320px] opacity-100 pointer-events-auto'
            }`}>
              <button
                onClick={() => setShowSettingsMenu(!showSettingsMenu)}
                className="w-[38px] h-[38px] bg-white border border-stone-200 hover:bg-stone-50 rounded-full text-stone-600 hover:text-stone-900 active:scale-95 transition-all shadow-sm flex items-center justify-center cursor-pointer relative z-10"
                title="Menu"
              >
                <Menu className="w-5 h-5" />
              </button>
            </div>
            
            {showSettingsMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowSettingsMenu(false)}></div>
                <div className="absolute right-0 top-full mt-2.5 w-64 max-h-[calc(100vh-140px)] md:max-h-[calc(100vh-90px)] overflow-y-auto no-scrollbar bg-white border border-stone-200/80 rounded-xl shadow-xl z-50 p-2 text-left animate-fade-in select-none flex flex-col gap-1.5">
                  {/* User profile / Auth panel */}
                  {currentUser ? (
                    <div className="px-4 py-3 border-b border-stone-100 mb-1.5 flex flex-col gap-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-stone-700 font-bold truncate max-w-[140px]">{currentUser.email}</span>
                        <span className={`text-[9px] uppercase font-black tracking-wider px-1.5 py-0.5 rounded border shrink-0 ${
                          currentUser.role === 'admin' 
                            ? 'bg-red-50 text-red-700 border-red-200' 
                            : 'bg-stone-50 text-stone-600 border-stone-200'
                        }`}>
                          {currentUser.role}
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          localStorage.removeItem('campfire_user');
                          setCurrentUser(null);
                          setShowSettingsMenu(false);
                        }}
                        className="text-left text-[11px] font-bold text-red-700 hover:text-red-800 transition cursor-pointer"
                      >
                        Đăng xuất / Sign Out
                      </button>
                    </div>
                  ) : (
                    <div className="px-4 py-2.5 border-b border-stone-100 mb-1.5">
                      <button
                        onClick={() => {
                          setAuthMode('login');
                          setAuthError(null);
                          setAuthSuccess(null);
                          setShowAuthModal(true);
                          setShowSettingsMenu(false);
                        }}
                        className="w-full text-center py-2 bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs rounded-xl transition shadow-sm cursor-pointer"
                      >
                        Đăng nhập / Sign In
                      </button>
                    </div>
                  )}
                  
                  <p className="text-[10px] uppercase font-black tracking-widest text-stone-400 px-4 py-2 border-b border-stone-100 mb-1.5">Features</p>
                  
                  <button
                    onClick={() => {
                      setActiveTab('library');
                      setSelectedPlaylistId(null);
                      setActiveSongId(null);
                      setShowSettingsMenu(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3.5 text-sm font-bold rounded-xl transition-all text-left cursor-pointer ${
                      activeTab === 'library' && !selectedPlaylistId && !activeSongId 
                        ? 'text-red-700 font-extrabold bg-red-50' 
                        : 'text-stone-800 hover:bg-stone-50 hover:text-stone-950'
                    }`}
                  >
                    <Music className="w-4.5 h-4.5 shrink-0" />
                    <span>Song Library</span>
                  </button>

                  <button
                    onClick={() => {
                      setActiveTab('setlists');
                      setActiveSongId(null);
                      setShowSettingsMenu(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3.5 text-sm font-bold rounded-xl transition-all text-left cursor-pointer ${
                      activeTab === 'setlists' && !activeSongId 
                        ? 'text-red-700 font-extrabold bg-red-50' 
                        : 'text-stone-800 hover:bg-stone-50 hover:text-stone-950'
                    }`}
                  >
                    <ListMusic className="w-4.5 h-4.5 shrink-0" />
                    <span>Campfire Setlists</span>
                  </button>

                  {currentUser && (
                    <button
                      onClick={() => {
                        setActiveTab('history');
                        setSelectedPlaylistId(null);
                        setActiveSongId(null);
                        setShowSettingsMenu(false);
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-3.5 text-sm font-bold rounded-xl transition-all text-left cursor-pointer ${
                        activeTab === 'history' && !activeSongId 
                          ? 'text-red-700 font-extrabold bg-red-50' 
                          : 'text-stone-800 hover:bg-stone-50 hover:text-stone-950'
                      }`}
                    >
                      <ListMusic className="w-4.5 h-4.5 shrink-0 text-red-700" />
                      <span>Lịch sử chơi nhạc / History</span>
                    </button>
                  )}

                  <button
                    onClick={() => {
                      setActiveTab('add');
                      setActiveSongId(null);
                      setShowSettingsMenu(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3.5 text-sm font-bold rounded-xl transition-all text-left cursor-pointer ${
                      activeTab === 'add' && !activeSongId 
                        ? 'text-red-700 font-extrabold bg-red-50' 
                        : 'text-stone-800 hover:bg-stone-50 hover:text-stone-950'
                    }`}
                  >
                    <PlusCircle className="w-4.5 h-4.5 shrink-0" />
                    <span>Add & Scrape Chords</span>
                  </button>

                  <button
                    onClick={() => {
                      setShowTuner(true);
                      setShowSettingsMenu(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3.5 text-sm font-bold rounded-xl transition-all text-left text-stone-800 hover:bg-stone-50 hover:text-stone-950 cursor-pointer"
                  >
                    <Mic className="w-4.5 h-4.5 text-stone-500 shrink-0" />
                    <span>Bộ lên dây / Instrument Tuner</span>
                  </button>

                  {currentUser?.role === 'admin' && (
                    <button
                      onClick={() => {
                        handleTriggerCleanup();
                        setShowSettingsMenu(false);
                      }}
                      disabled={isCleaningDb}
                      className="w-full flex items-center gap-3 px-4 py-3.5 text-sm font-bold rounded-xl transition-all text-left text-stone-800 hover:bg-stone-50 hover:text-stone-950 disabled:opacity-50 cursor-pointer animate-fade-in"
                    >
                      <Sparkles className="w-4.5 h-4.5 text-yellow-600 shrink-0 animate-pulse" />
                      <span>{isCleaningDb ? 'Đang dọn dẹp...' : 'Dọn dẹp Database / Cleanup'}</span>
                    </button>
                  )}

                  {/* Instrument Selector Segmented Control */}
                  <div className="border-t border-stone-100 mt-2 pt-2.5 px-4 pb-2 flex flex-col gap-2 select-none">
                    <p className="text-[10px] uppercase font-black tracking-widest text-stone-400">Instrument</p>
                    <div className="grid grid-cols-3 gap-1 bg-stone-100 p-1 rounded-xl border border-stone-200/80">
                      {['guitar', 'ukulele', 'piano'].map(inst => (
                        <button
                          key={inst}
                          onClick={() => setInstrument(inst)}
                          className={`py-2 text-xs font-black capitalize rounded-lg transition-all cursor-pointer ${
                            instrument === inst 
                              ? 'bg-white text-stone-900 shadow-sm' 
                              : 'text-stone-500 hover:text-stone-800'
                          }`}
                        >
                          {inst === 'ukulele' ? 'Uke' : inst}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Network Status */}
                  <div className="border-t border-stone-100 mt-2 pt-3 px-4 pb-1 flex items-center gap-2 text-[10px] text-stone-400 font-black uppercase tracking-widest select-none">
                    {isOnline ? (
                      <>
                        <span className="w-2 h-2 rounded-full bg-green-500 shrink-0"></span>
                        <span>Online Mode</span>
                      </>
                    ) : (
                      <>
                        <span className="w-2 h-2 rounded-full bg-orange-500 shrink-0"></span>
                        <span>Offline Mode</span>
                      </>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </header>

        {/* Content Body */}
        <main className={`flex-grow overflow-y-auto ${
          displaySong 
            ? 'w-full flex flex-col p-0' 
            : 'p-4 md:p-8 max-w-6xl w-full mx-auto'
        }`}>
          
          {displaySong ? (
            <div 
              className="relative flex-grow flex flex-col bg-stone-100/40 cursor-pointer"
              onClick={() => {
                setActiveSongId(null);
                setActivePlaylistSongs([]);
                setOnlineSong(null);
              }}
            >
              <SongViewer 
                song={displaySong.isOnline ? displaySong : { ...displaySong, isFavorite: isSongFavorited(displaySong) }} 
                transposeOffset={transposeOffset}
                setTransposeOffset={setTransposeOffset}
                onBack={() => {
                  setActiveSongId(null);
                  setActivePlaylistSongs([]);
                  setOnlineSong(null);
                }}
                onToggleFavorite={handleToggleFavorite}
                playlists={playlists}
                onAddSongToPlaylist={handleAddSongToPlaylist}
                fontSize={fontSize}
                isCompact={isCompact}
                instrument={instrument}
                onSaveToLibrary={handleSaveOnlineSongToLibrary}
                isSavingToLibrary={isSavingToLibrary}
              />
              
              {activePlaylistSongs.length > 0 && (
                (() => {
                  const playlistIndex = activePlaylistSongs.findIndex(s => s.id === activeSongId);
                  const hasNext = playlistIndex !== -1 && playlistIndex < activePlaylistSongs.length - 1;
                  const hasPrev = playlistIndex > 0;
                  return (
                    <div className="fixed bottom-28 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 bg-stone-900/95 border border-stone-800 rounded-full px-4 py-2 shadow-2xl backdrop-blur">
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
                  {isLoadingSongs ? (
                    <div className="text-center py-20 bg-white border border-stone-200/80 rounded-xl shadow-sm max-w-xl mx-auto mt-8 select-none animate-fade-in">
                      <div className="w-10 h-10 border-4 border-red-700/20 border-t-red-600 rounded-full animate-spin mx-auto mb-4"></div>
                      <h3 className="text-xs font-bold text-stone-600">Đang tải thư viện bài hát...</h3>
                    </div>
                  ) : fetchSongsError ? (
                    <div className="text-center py-16 bg-red-50/50 border border-red-200 rounded-xl shadow-sm max-w-xl mx-auto mt-8 p-6 select-none animate-fade-in">
                      <WifiOff className="w-10 h-10 text-red-500 mx-auto mb-3" />
                      <h3 className="text-sm font-bold text-stone-900">Không thể kết nối cơ sở dữ liệu</h3>
                      <p className="text-xs text-stone-600 mt-2 max-w-xs mx-auto leading-relaxed">
                        Có lỗi xảy ra khi kết nối tới máy chủ. Vui lòng kiểm tra lại kết nối hoặc khởi động lại máy chủ backend.
                      </p>
                      <button
                        onClick={fetchSongs}
                        className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-lg transition shadow-md cursor-pointer"
                      >
                        Thử lại / Retry
                      </button>
                    </div>
                  ) : filteredSongs.length === 0 && !searchQuery.trim() ? (
                    <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full">
                      <div className="text-center py-12 bg-white border border-stone-200/80 rounded-xl shadow-sm select-none animate-fade-in">
                        <div className="w-16 h-16 bg-red-600/5 border border-red-600/10 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
                          <Flame className="w-8 h-8 text-red-600 fill-red-600" />
                        </div>
                        <h3 className="text-lg font-bold text-stone-900 font-display">Campfire Chords</h3>
                        {songs.length > 0 ? (
                          <>
                            <p className="text-sm font-bold text-stone-700 mt-2">
                              Thư viện hiện có <span className="text-red-600 font-black">{songs.length}</span> bài hát
                            </p>
                            <p className="text-xs text-stone-500 mt-1.5 max-w-xs mx-auto leading-relaxed">
                              Nhập tên bài hát, ca sĩ, tác giả hoặc lời nhạc vào thanh tìm kiếm ở trên để tìm hợp âm.
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="text-xs text-stone-500 mt-2 max-w-xs mx-auto leading-relaxed">
                              Thư viện của bạn hiện chưa có bài hát nào. Hãy chuyển qua mục <b>Add & Scrape Chords</b> để thêm bài hát mới!
                            </p>
                            <button
                              onClick={() => setActiveTab('add')}
                              className="mt-4 px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-bold rounded-lg transition border border-stone-200 cursor-pointer"
                            >
                              Thêm bài hát mới
                            </button>
                          </>
                        )}
                      </div>

                      {currentUser && userFavoritesList.length > 0 && (
                        <div className="mt-4 text-left animate-fade-in">
                          <h3 className="text-xs uppercase font-bold tracking-widest text-stone-500 mb-3 flex items-center gap-1.5 font-sans">
                            <Heart className="w-3.5 h-3.5 fill-red-600 text-red-600 animate-pulse" />
                            Bài hát yêu thích / Favorites ({userFavoritesList.length})
                          </h3>
                          <div className="songs-grid">
                            {songs.filter(s => userFavoritesList.includes(s.id)).map(song => (
                              <div 
                                key={song.id}
                                onClick={() => setActiveSongId(song.id)}
                                className="bg-white border border-stone-200/80 hover:border-red-600/30 rounded-lg p-4 cursor-pointer transition-all hover:-translate-y-0.5 shadow-sm hover:shadow flex items-center justify-between"
                              >
                                <div className="truncate pr-4">
                                  <div className="flex items-center gap-1.5">
                                    <Heart className="w-3.5 h-3.5 fill-red-600 text-red-600 shrink-0" />
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
                                    className="p-1 hover:bg-stone-100 text-stone-400 hover:text-red-600 rounded transition cursor-pointer"
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
                  ) : (filteredSongs.length === 0 || forceOnlineSearch) ? (
                    <div className="flex flex-col gap-6 max-w-xl mx-auto mt-8">
                      {filteredSongs.length > 0 && (
                        <button
                          onClick={() => setForceOnlineSearch(false)}
                          className="self-start px-3 py-1.5 bg-stone-100 hover:bg-stone-200 border border-stone-200 rounded-lg text-xs font-bold text-stone-700 transition flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95 animate-fade-in"
                        >
                          <ChevronLeft className="w-4 h-4 text-stone-600" />
                          Xem kết quả trong thư viện ({filteredSongs.length})
                        </button>
                      )}

                      {filteredSongs.length === 0 && (
                        <div className="text-center py-10 bg-white border border-stone-200 rounded-xl shadow-sm px-6">
                          <Search className="w-10 h-10 text-stone-300 mx-auto mb-3" />
                          <p className="text-stone-800 font-bold">Không tìm thấy "{searchQuery}" trong thư viện</p>
                          <p className="text-xs text-stone-500 mt-1 max-w-xs mx-auto">Hệ thống đang tự động tìm kiếm trực tuyến...</p>
                        </div>
                      )}

                      {isSearchingOnline && (
                        <div className="flex flex-col items-center justify-center py-12 bg-white border border-stone-200 rounded-xl shadow-sm px-6">
                          <svg className="animate-spin h-8 w-8 text-blue-600 mb-3" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          <p className="text-stone-600 text-xs font-semibold">Đang tìm hợp âm trực tuyến...</p>
                        </div>
                      )}

                      {!isSearchingOnline && onlineResults.length > 0 && (
                        <div className="animate-fade-in text-left">
                          <div className="flex items-center justify-between border-b border-stone-200 pb-2 mb-3">
                            <h2 className="text-xs uppercase font-extrabold tracking-widest text-blue-600 flex items-center gap-1.5 font-sans">
                              <Globe className="w-3.5 h-3.5" /> Hợp âm trực tuyến
                            </h2>
                            <span className="text-[10px] bg-blue-50 text-blue-700 font-semibold px-2 py-0.5 rounded-full">
                              {filteredSongs.length === 0 ? "Tự động tìm kiếm" : "Tìm kiếm thủ công"}
                            </span>
                          </div>
                          
                          <div className="flex flex-col gap-2">
                            {onlineResults.map((result, idx) => (
                              <div 
                                key={idx}
                                onClick={() => handleOpenOnlineSong(result.url)}
                                className="bg-white border border-stone-200/80 hover:border-blue-500/40 hover:bg-blue-50/5 rounded-xl p-4 cursor-pointer transition-all hover:-translate-y-0.5 shadow-sm hover:shadow flex items-center justify-between group"
                              >
                                <div className="truncate pr-4">
                                  <h3 className="font-bold text-sm text-stone-900 group-hover:text-blue-700 transition-colors truncate">
                                    {result.title}
                                  </h3>
                                  <p className="text-xs text-stone-500 truncate mt-0.5">
                                    {result.artist}
                                  </p>
                                </div>
                                <div className="shrink-0 flex items-center gap-2">
                                  <span className="text-[10px] uppercase font-bold text-stone-400 group-hover:text-blue-600 transition-colors border border-stone-200 group-hover:border-blue-200 rounded px-2 py-1 bg-stone-50 group-hover:bg-blue-50">
                                    Xem
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {!isSearchingOnline && onlineResults.length === 0 && (
                        <div className="text-center py-6 bg-stone-50 border border-stone-200 border-dashed rounded-xl px-6">
                          <p className="text-xs text-stone-500 font-medium">Không tìm thấy kết quả trực tuyến nào</p>
                        </div>
                      )}
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
                            className="bg-white border border-stone-200/80 hover:border-red-600/30 rounded-lg p-4 cursor-pointer transition-all hover:-translate-y-0.5 shadow-sm hover:shadow flex items-center justify-between"
                          >
                            <div className="truncate pr-4">
                              <div className="flex items-center gap-1.5">
                                {isSongFavorited(song) && <Heart className="w-3.5 h-3.5 fill-red-600 text-red-600 shrink-0" />}
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

                      {/* Search Online Banner at the bottom of local results */}
                      <div className="mt-8 border border-blue-100 bg-blue-50/35 rounded-xl p-5 text-center max-w-xl mx-auto shadow-sm select-none animate-fade-in">
                        <Globe className="w-8 h-8 text-blue-600 mx-auto mb-2.5 animate-pulse" />
                        <h4 className="text-sm font-bold text-stone-900 font-display">Bạn muốn tìm bản nhạc khác?</h4>
                        <p className="text-xs text-stone-500 mt-1 max-w-xs mx-auto leading-relaxed">
                          Tìm kiếm các phiên bản hợp âm đầy đủ khác trực tuyến.
                        </p>
                        <button
                          onClick={() => setForceOnlineSearch(true)}
                          className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition shadow-md cursor-pointer active:scale-95 flex items-center gap-1.5 mx-auto"
                        >
                          <Globe className="w-3.5 h-3.5" /> Tìm trực tuyến cho "{searchQuery}"
                        </button>
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
              
              {/* Universal Scraper Section */}
              <div className="bg-white border border-stone-200 rounded-xl p-6 shadow-sm">
                <h2 className="text-base font-bold text-stone-900 mb-2 font-display flex items-center gap-2">
                  <Globe className="w-5 h-5 text-red-600" /> Import Song from URL
                </h2>
                <p className="text-xs text-stone-500 mb-4 leading-relaxed">
                  Enter a song details page URL. The server will fetch and compile it into ChordPro, adding it to your offline database.
                </p>

                <form onSubmit={handleScrapeSong} className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="url"
                    placeholder="Enter song page URL (e.g. https://example.com/song/nho-oi)"
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
                  <p className="text-xs text-red-700 mt-2 font-semibold">{scrapeError}</p>
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

              {/* Category Scraper Tool & Batch JSON Importer (Admin Only) */}
              {currentUser?.role === 'admin' && (
                <>
                  {/* Category Browser Scraper Tool */}
                  <div className="bg-white border border-stone-200 rounded-xl p-6 shadow-sm animate-fade-in">
                    <h2 className="text-base font-bold text-stone-900 mb-2 font-display flex items-center gap-2">
                      <Globe className="w-5 h-5 text-red-600" /> Category Browser Scraper Tool
                    </h2>
                    <p className="text-xs text-stone-500 mb-4 leading-relaxed">
                      Generate a custom script to crawl entire categories of songs directly via your browser, bypassing scraping obstacles. 
                      {directImport ? " Songs will be saved directly into your local database in real-time!" : " It will compile all songs into a single JSON file for manual upload."}
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] uppercase font-bold text-stone-400">Category / List URL *</label>
                        <input
                          type="url"
                          required
                          value={categoryUrl}
                          onChange={(e) => setCategoryUrl(e.target.value)}
                          placeholder="https://example.com/chord/category/1/nhac-vang"
                          className="px-3 py-2 bg-white border border-stone-200 rounded text-sm placeholder-stone-400 shadow-sm"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] uppercase font-bold text-stone-400">Start Page</label>
                          <input
                            type="number"
                            min="1"
                            value={startPage}
                            onChange={(e) => setStartPage(parseInt(e.target.value) || 1)}
                            className="px-3 py-2 bg-white border border-stone-200 rounded text-sm shadow-sm"
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] uppercase font-bold text-stone-400">End Page</label>
                          <input
                            type="number"
                            min="1"
                            value={endPage}
                            onChange={(e) => setEndPage(parseInt(e.target.value) || 1)}
                            className="px-3 py-2 bg-white border border-stone-200 rounded text-sm shadow-sm"
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
                        className="w-4 h-4 text-red-700 border-stone-300 rounded focus:ring-red-500/20"
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
                  <div className="bg-white border border-stone-200 rounded-xl p-6 shadow-sm animate-fade-in">
                    <h2 className="text-base font-bold text-stone-900 mb-2 font-display flex items-center gap-2">
                      <Upload className="w-5 h-5 text-red-600" /> Batch JSON Song Importer
                    </h2>
                    <p className="text-xs text-stone-500 mb-4 leading-relaxed">
                      Have a scraped song list (like <b>songs_backup.json</b>)? Upload it here. The application will import all songs, convert text chords to bracket layouts, and cache them locally.
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
                        <Upload className="w-6 h-6 text-stone-500 group-hover:text-red-600 transition-colors" />
                      </div>
                      <span className="text-sm font-semibold text-stone-800 group-hover:text-red-700 transition-colors">
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
                </>
              )}

              {/* Paste Importer Section */}
              <div className="bg-white border border-stone-200 rounded-xl p-6 shadow-sm">
                <h2 className="text-base font-bold text-stone-900 mb-2 font-display flex items-center gap-2">
                  <FileText className="w-5 h-5 text-red-600" /> Copy-Paste / Manual Chords Importer
                </h2>
                <p className="text-xs text-stone-500 mb-4 leading-relaxed">
                  Use this to copy-paste songs from online chord sheets. Paste the block containing the text and chords. Our intelligent system automatically converts standard "chords-above-lyrics" lines into unified ChordPro brackets format!
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
                        {['C','C#','Db','D','Eb','E','F','F#','Gb','G','Ab','A','Bb','B','Am','Bbm','Bm','Cm','C#m','Dm','Ebm','Em','Fm','F#m','Gm','G#m'].map(k => (
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
                      className="px-3 py-2 bg-white border border-stone-200 rounded text-sm font-mono placeholder-stone-400 leading-relaxed focus:border-red-600 shadow-sm"
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

          {/* TAB 4: PLAY HISTORY */}
          {activeTab === 'history' && (
            <div className="animate-fade-in flex flex-col gap-6 max-w-4xl mx-auto w-full">
              <div className="border-b border-stone-200 pb-4">
                <h2 className="text-lg font-bold text-stone-900 font-display flex items-center gap-2">
                  <ListMusic className="w-5 h-5 text-red-700" />
                  Lịch sử chơi nhạc / Play History
                </h2>
                <p className="text-xs text-stone-500">Các bài hát bạn đã chơi gần đây, được sắp xếp theo số lần chơi.</p>
              </div>

              {playHistory.length === 0 ? (
                <div className="text-center py-20 bg-white border border-stone-200/80 rounded-xl shadow-sm select-none animate-fade-in">
                  <div className="w-16 h-16 bg-red-700/5 border border-red-700/10 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
                    <Flame className="w-8 h-8 text-red-700 fill-red-700" />
                  </div>
                  <h3 className="text-sm font-bold text-stone-900 font-sans">Lịch sử chơi nhạc trống</h3>
                  <p className="text-xs text-stone-500 mt-2 max-w-xs mx-auto leading-relaxed">
                    Bạn chưa chơi bài hát nào khi đăng nhập. Hãy mở các bài hát từ thư viện để theo dõi lịch sử và xếp hạng số lần chơi!
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {playHistory.map((item, idx) => {
                    const song = songs.find(s => s.id === item.songId);
                    if (!song) return null;
                    return (
                      <div
                        key={item.songId}
                        onClick={() => setActiveSongId(song.id)}
                        className="bg-white hover:bg-stone-50 border border-stone-200 rounded-lg p-4 flex items-center justify-between cursor-pointer transition group shadow-sm hover:shadow"
                      >
                        <div className="flex items-center gap-3 truncate">
                          <span className="font-mono text-xs font-bold text-stone-400 w-5">{idx + 1}.</span>
                          <div className="truncate">
                            <h3 className="font-bold text-sm text-stone-900 group-hover:text-red-700 transition-colors truncate">{song.title}</h3>
                            <p className="text-xs text-stone-500 truncate">{song.artist}{song.composer ? ` • ${song.composer}` : ''}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-100">
                            Đã chơi {item.playCount} lần
                          </span>
                          <span className="font-mono text-xs font-semibold text-stone-500">{song.key}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
            </>
          )}
        </main>
      </div>

      {/* Bottom controls toolbar (replaces mobile bottom nav) */}
      {activeSongId !== null && displaySong && (
        (() => {
          const currentTransposedKey = transposeChord(displaySong.key, transposeOffset);
          
          const getReferenceKeys = (keyStr) => {
            if (!keyStr) return { original: '', male: '', female: '' };
            try {
              const male = transposeChord(keyStr, -5);
              const female = transposeChord(keyStr, 0);
              return { original: keyStr, male, female };
            } catch {
              return { original: keyStr, male: '?', female: '?' };
            }
          };

          return (
            <nav className="fixed bottom-0 left-0 right-0 z-40 bg-[#f5f3ef]/95 border-t border-[#e3ded5] flex items-center justify-center gap-1.5 xs:gap-2 sm:gap-4 pt-3.5 pb-[calc(14px+env(safe-area-inset-bottom))] sm:py-3.5 px-1.5 xs:px-3 sm:px-4 shadow-2xl backdrop-blur-md select-none">
              {/* Font Size Controls */}
              <div className="flex items-center gap-0.5 bg-white border border-stone-200 rounded-lg p-0.5 shadow-sm shrink-0">
                <button 
                  onClick={() => setFontSize(prev => Math.max(10, prev - 1))}
                  className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded hover:bg-stone-100 text-stone-600 active:scale-95 transition font-semibold text-xs"
                  title="Decrease font size"
                >
                  A-
                </button>
                <span className="text-[10px] sm:text-xs font-mono font-bold text-stone-500 min-w-[26px] sm:min-w-[30px] text-center">
                  {fontSize}px
                </span>
                <button 
                  onClick={() => setFontSize(prev => Math.min(30, prev + 1))}
                  className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded hover:bg-stone-100 text-stone-600 active:scale-95 transition font-semibold text-xs"
                  title="Increase font size"
                >
                  A+
                </button>
              </div>

              <div className="hidden xs:block h-6 w-px bg-stone-200"></div>

              {/* Transpose Key Control Group (Dynamic size to prevent clipping) */}
              <div ref={keySelectorContainerRef} className="flex items-center gap-1 sm:gap-1.5 bg-white border border-stone-200 rounded-lg p-0.5 shadow-sm shrink-0">
                <button
                  onClick={() => setTransposeOffset(prev => prev - 1)}
                  className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center text-base sm:text-lg font-black text-stone-600 hover:bg-stone-55 rounded-md active:scale-90 transition"
                  title="Transpose Down"
                >
                  -
                </button>
                
                <div>
                  <button
                    onClick={() => setShowKeySelector(!showKeySelector)}
                    className="px-2.5 sm:px-4 h-8 sm:h-10 flex items-center justify-center bg-stone-50 border border-stone-150 rounded-md hover:bg-stone-100 active:scale-95 transition min-w-[54px] sm:min-w-[70px]"
                    title="Select Key"
                  >
                    <span className="font-mono text-sm sm:text-base font-black text-blue-dark leading-none">
                      {currentTransposedKey}
                    </span>
                  </button>
                </div>

                {showKeySelector && (
                  <>
                    {/* Backdrop click-away */}
                    <div className="fixed inset-0 z-40" onClick={() => setShowKeySelector(false)}></div>
                      
                      {/* Grid Selector Popover */}
                      <div className="absolute bottom-full left-4 right-4 sm:left-1/2 sm:-translate-x-1/2 sm:w-[325px] sm:max-w-sm mb-3.5 bg-white border border-stone-200 rounded-xl shadow-2xl p-4 z-50 animate-fade-in text-center select-none max-h-[82vh] overflow-y-auto no-scrollbar">
                        <div className="flex items-center justify-between border-b border-stone-100 pb-2 mb-3">
                          <span className="text-[10px] uppercase font-extrabold tracking-widest text-stone-400">Quick Key Selection</span>
                          <button
                            onClick={() => {
                              setTransposeOffset(0);
                              setShowKeySelector(false);
                            }}
                            className="text-[10px] font-black uppercase text-blue-dark hover:text-blue-950 transition"
                          >
                            Reset ({displaySong.key})
                          </button>
                        </div>

                        {/* Reference Tones Banner */}
                        {(() => {
                          const ref = getReferenceKeys(displaySong.key);
                          return (
                            <div className="grid grid-cols-3 gap-2 sm:gap-2.5 mb-2 text-xs text-stone-600">
                              <button
                                onClick={() => {
                                  handleSelectKey(ref.original);
                                  setShowKeySelector(false);
                                }}
                                className="flex flex-col items-center justify-center py-3.5 sm:py-5 bg-[#fdfbf7] hover:bg-[#f8f5ee] active:scale-95 transition-all rounded-xl border border-amber-250/75 cursor-pointer shadow-xs"
                              >
                                <span className="text-[10px] sm:text-[11px] uppercase tracking-wider text-amber-800 font-extrabold mb-1.5">Tone Gốc</span>
                                <span className="font-mono font-black text-amber-900 text-[15px] sm:text-lg leading-none">{ref.original}</span>
                              </button>
                              <button
                                onClick={() => {
                                  handleSelectKey(ref.male);
                                  setShowKeySelector(false);
                                }}
                                className="flex flex-col items-center justify-center py-3.5 sm:py-5 bg-blue-50/45 hover:bg-blue-50/90 active:scale-95 transition-all rounded-xl border border-blue-200/80 cursor-pointer shadow-xs"
                              >
                                <span className="text-[10px] sm:text-[11px] uppercase tracking-wider text-blue-750 font-extrabold mb-1.5">Tone Nam</span>
                                <span className="font-mono font-black text-blue-900 text-[15px] sm:text-lg leading-none">{ref.male}</span>
                              </button>
                              <button
                                onClick={() => {
                                  handleSelectKey(ref.female);
                                  setShowKeySelector(false);
                                }}
                                className="flex flex-col items-center justify-center py-3.5 sm:py-5 bg-rose-50/35 hover:bg-rose-50/80 active:scale-95 transition-all rounded-xl border border-rose-200/70 cursor-pointer shadow-xs"
                              >
                                <span className="text-[10px] sm:text-[11px] uppercase tracking-wider text-rose-750 font-extrabold mb-1.5">Tone Nữ</span>
                                <span className="font-mono font-black text-rose-900 text-[15px] sm:text-lg leading-none">{ref.female}</span>
                              </button>
                            </div>
                          );
                        })()}

                        {/* Section Divider (More space!) */}
                        <div className="h-px bg-stone-200/80 my-5"></div>

                        <div className="grid grid-cols-4 gap-2">
                          {getAvailableKeys().map(key => {
                            const currentKeyParsed = parseKeyRootAndType(currentTransposedKey);
                            const gridKeyParsed = parseKeyRootAndType(key);
                            const isSelected = currentKeyParsed.root === gridKeyParsed.root && currentKeyParsed.isMinor === gridKeyParsed.isMinor;
                            return (
                              <button
                                key={key}
                                onClick={() => {
                                  handleSelectKey(key);
                                  setShowKeySelector(false);
                                }}
                                className={`h-9.5 flex items-center justify-center text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                                  isSelected 
                                    ? 'bg-blue-50 border-2 border-blue-400 text-blue-900 shadow-xs font-black' 
                                    : 'bg-white border-stone-200 text-stone-700 hover:bg-stone-50 hover:border-stone-300'
                                }`}
                              >
                                {key}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  )}

                <button
                  onClick={() => setTransposeOffset(prev => prev + 1)}
                  className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center text-base sm:text-lg font-black text-stone-600 hover:bg-stone-55 rounded-md active:scale-90 transition"
                  title="Transpose Up"
                >
                  +
                </button>
              </div>

              <div className="hidden xs:block h-6 w-px bg-stone-200"></div>

              {/* Compact View Toggle */}
              <button 
                onClick={() => setIsCompact(!isCompact)}
                className={`w-8 h-8 flex items-center justify-center border rounded-lg active:scale-95 transition shadow-sm ${
                  isCompact 
                    ? 'bg-amber-50 border-amber-200 text-amber-600' 
                    : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-100'
                }`}
                title={isCompact ? "Standard View" : "Compact View"}
              >
                {isCompact ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
              </button>
            </nav>
          );
        })()
      )}

      {showTuner && (
        <InstrumentTuner isOpen={showTuner} onClose={() => setShowTuner(false)} />
      )}

      {cleanupResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-sm p-4 animate-fade-in" onClick={() => setCleanupResult(null)}>
          <div className="bg-white border border-stone-200 rounded-xl max-w-md w-full shadow-2xl p-6 relative select-none" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setCleanupResult(null)}
              className="absolute right-4 top-4 p-1 hover:bg-stone-100 rounded-full text-stone-400 hover:text-stone-700 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-green-50 border border-green-200 rounded-full flex items-center justify-center text-green-600">
                <Sparkles className="w-5 h-5 fill-green-50 text-green-650" />
              </div>
              <div>
                <h3 className="text-base font-bold text-stone-900">Dọn dẹp Database thành công</h3>
                <p className="text-xs text-stone-500">Kết quả tối ưu hóa thư viện bài hát</p>
              </div>
            </div>
            
            <div className="flex flex-col gap-3 bg-stone-50 border border-stone-200/80 rounded-xl p-4 my-4 font-sans text-xs">
              <div className="flex justify-between">
                <span className="text-stone-500 font-medium">Tổng số bài hát ban đầu:</span>
                <span className="font-bold text-stone-800">{cleanupResult.totalBefore}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500 font-medium">Tổng số bài hát hiện tại:</span>
                <span className="font-bold text-stone-800">{cleanupResult.totalAfter}</span>
              </div>
              <div className="h-px bg-stone-200 my-1"></div>
              <div className="flex justify-between">
                <span className="text-stone-500 font-medium">Đã xóa trùng lặp:</span>
                <span className="font-bold text-red-700">-{cleanupResult.duplicatesRemoved} bài hát</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500 font-medium">Đã tự động căn chỉnh key/hợp âm:</span>
                <span className="font-bold text-blue-650">+{cleanupResult.songsFixed} bài hát</span>
              </div>
            </div>
            
            <p className="text-[11px] text-stone-500 leading-relaxed text-center">
              Các bài hát trùng lặp đã được gộp lại, ưu tiên các bài hát có hợp âm đầy đủ hơn hoặc được đánh dấu yêu thích. Danh sách Setlist đã được tự động cập nhật liên kết.
            </p>
            
            <button
              onClick={() => setCleanupResult(null)}
              className="mt-5 w-full py-2.5 bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs rounded-xl transition shadow-md cursor-pointer"
            >
              Đóng / Close
            </button>
          </div>
        </div>
      )}

      {showAuthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-sm p-4 animate-fade-in" onClick={() => setShowAuthModal(false)}>
          <div className="bg-white border border-stone-200 rounded-xl max-w-md w-full shadow-2xl p-6 relative select-none" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setShowAuthModal(false)}
              className="absolute right-4 top-4 p-1 hover:bg-stone-100 rounded-full text-stone-400 hover:text-stone-700 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {authMode === 'login' && (
              <form onSubmit={handleLoginSubmit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1 mb-2">
                  <h3 className="text-lg font-bold text-stone-900 font-display">Đăng nhập tài khoản</h3>
                  <p className="text-xs text-stone-500">Đăng nhập để lưu danh sách yêu thích và lịch sử chơi nhạc.</p>
                </div>

                {authError && (
                  <div className="p-3 bg-red-50 border border-red-200 text-red-755 text-xs rounded-xl font-medium animate-fade-in">
                    {authError}
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] uppercase font-bold text-stone-400 font-sans">Email Address</label>
                  <input
                    type="email"
                    required
                    placeholder="example@gmail.com"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    className="px-3.5 py-2.5 bg-white border border-stone-200 rounded-xl text-sm placeholder-stone-400 shadow-xs focus:ring-1 focus:ring-red-500/20 focus:border-red-600 outline-none font-sans"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] uppercase font-bold text-stone-400 font-sans">Password</label>
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('recover-email');
                        setAuthError(null);
                        setAuthSuccess(null);
                      }}
                      className="text-[10px] font-bold text-red-600 hover:text-red-750 font-sans cursor-pointer"
                    >
                      Quên mật khẩu?
                    </button>
                  </div>
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    className="px-3.5 py-2.5 bg-white border border-stone-200 rounded-xl text-sm placeholder-stone-400 shadow-xs focus:ring-1 focus:ring-red-500/20 focus:border-red-600 outline-none font-sans"
                  />
                </div>

                <button
                  type="submit"
                  className="mt-2 py-3 bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs rounded-xl transition shadow-md cursor-pointer flex items-center justify-center gap-2 font-sans"
                >
                  Đăng nhập / Sign In
                </button>

                <div className="text-center text-xs text-stone-500 mt-2 font-sans">
                  Chưa có tài khoản?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('register');
                      setAuthError(null);
                      setAuthSuccess(null);
                    }}
                    className="font-bold text-red-600 hover:text-red-750 cursor-pointer"
                  >
                    Đăng ký ngay
                  </button>
                </div>
              </form>
            )}

            {authMode === 'register' && (
              <form onSubmit={handleRegisterSubmit} className="flex flex-col gap-3.5">
                <div className="flex flex-col gap-1 mb-1">
                  <h3 className="text-lg font-bold text-stone-900 font-display">Tạo tài khoản mới</h3>
                  <p className="text-xs text-stone-500">Đăng ký thành viên để đồng bộ hóa và lưu trữ dữ liệu cá nhân.</p>
                </div>

                {authError && (
                  <div className="p-3 bg-red-50 border border-red-200 text-red-755 text-xs rounded-xl font-medium animate-fade-in font-sans">
                    {authError}
                  </div>
                )}
                {authSuccess && (
                  <div className="p-3 bg-green-50 border border-green-200 text-green-750 text-xs rounded-xl font-medium animate-fade-in font-sans">
                    {authSuccess}
                  </div>
                )}

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase font-bold text-stone-400 font-sans">Email Address</label>
                  <input
                    type="email"
                    required
                    placeholder="example@gmail.com"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    className="px-3.5 py-2.5 bg-white border border-stone-200 rounded-xl text-sm placeholder-stone-400 shadow-xs focus:ring-1 focus:ring-red-500/20 focus:border-red-600 outline-none font-sans"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase font-bold text-stone-400 font-sans">Password</label>
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    className="px-3.5 py-2.5 bg-white border border-stone-200 rounded-xl text-sm placeholder-stone-400 shadow-xs focus:ring-1 focus:ring-red-500/20 focus:border-red-600 outline-none font-sans"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase font-bold text-stone-400 font-sans">Security Question (For recovery)</label>
                  <select
                    value={authQuestion}
                    onChange={(e) => setAuthQuestion(e.target.value)}
                    className="px-3.5 py-2.5 bg-white border border-stone-200 rounded-xl text-sm shadow-xs focus:ring-1 focus:ring-red-500/20 focus:border-red-600 outline-none font-sans"
                  >
                    <option value="What is your favorite instrument?">Nhạc cụ yêu thích của bạn là gì? (E.g. guitar)</option>
                    <option value="What is your birth city?">Thành phố nơi bạn sinh ra? (E.g. hanoi)</option>
                    <option value="What is your pet name?">Tên thú cưng đầu tiên của bạn?</option>
                    <option value="What is your favorite singer?">Ca sĩ yêu thích nhất của bạn?</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase font-bold text-stone-400 font-sans">Security Answer</label>
                  <input
                    type="text"
                    required
                    placeholder="Nhập câu trả lời bí mật..."
                    value={authAnswer}
                    onChange={(e) => setAuthAnswer(e.target.value)}
                    className="px-3.5 py-2.5 bg-white border border-stone-200 rounded-xl text-sm placeholder-stone-400 shadow-xs focus:ring-1 focus:ring-red-500/20 focus:border-red-600 outline-none font-sans"
                  />
                </div>

                <button
                  type="submit"
                  className="mt-2 py-3 bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs rounded-xl transition shadow-md cursor-pointer flex items-center justify-center gap-2 font-sans"
                >
                  Đăng ký tài khoản / Sign Up
                </button>

                <div className="text-center text-xs text-stone-500 mt-1 font-sans">
                  Đã có tài khoản?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('login');
                      setAuthError(null);
                      setAuthSuccess(null);
                    }}
                    className="font-bold text-red-600 hover:text-red-755 cursor-pointer"
                  >
                    Đăng nhập
                  </button>
                </div>
              </form>
            )}

            {authMode === 'recover-email' && (
              <form onSubmit={handleRecoverEmailSubmit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1 mb-2">
                  <h3 className="text-lg font-bold text-stone-900 font-display">Lấy lại mật khẩu</h3>
                  <p className="text-xs text-stone-500">Nhập email tài khoản của bạn để tìm câu hỏi bảo mật.</p>
                </div>

                {authError && (
                  <div className="p-3 bg-red-50 border border-red-200 text-red-755 text-xs rounded-xl font-medium animate-fade-in font-sans">
                    {authError}
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] uppercase font-bold text-stone-400 font-sans">Email Address</label>
                  <input
                    type="email"
                    required
                    placeholder="example@gmail.com"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    className="px-3.5 py-2.5 bg-white border border-stone-200 rounded-xl text-sm placeholder-stone-400 shadow-xs focus:ring-1 focus:ring-red-500/20 focus:border-red-600 outline-none font-sans"
                  />
                </div>

                <button
                  type="submit"
                  className="mt-2 py-3 bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs rounded-xl transition shadow-md cursor-pointer flex items-center justify-center gap-2 font-sans"
                >
                  Tìm câu hỏi bảo mật / Next
                </button>

                <div className="text-center text-xs text-stone-500 mt-2 font-sans">
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('login');
                      setAuthError(null);
                      setAuthSuccess(null);
                    }}
                    className="font-bold text-red-650 hover:text-red-750 cursor-pointer"
                  >
                    Quay lại Đăng nhập
                  </button>
                </div>
              </form>
            )}

            {authMode === 'recover-answer' && (
              <form onSubmit={handleRecoverAnswerSubmit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1 mb-2">
                  <h3 className="text-lg font-bold text-stone-900 font-display">Trả lời câu hỏi bảo mật</h3>
                  <p className="text-xs text-stone-500">Trả lời chính xác câu hỏi bảo mật của bạn để xem mật khẩu.</p>
                </div>

                {authError && (
                  <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl font-medium animate-fade-in font-sans">
                    {authError}
                  </div>
                )}

                <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 font-sans text-xs">
                  <span className="text-stone-400 font-bold block uppercase tracking-wider text-[9px] mb-1">Security Question:</span>
                  <span className="font-bold text-stone-800 text-sm">
                    {recoveredQuestionText === 'What is your favorite instrument?' ? 'Nhạc cụ yêu thích của bạn là gì?' :
                     recoveredQuestionText === 'What is your birth city?' ? 'Thành phố nơi bạn sinh ra?' :
                     recoveredQuestionText === 'What is your pet name?' ? 'Tên thú cưng đầu tiên của bạn?' :
                     recoveredQuestionText === 'What is your favorite singer?' ? 'Ca sĩ yêu thích nhất của bạn?' :
                     recoveredQuestionText}
                  </span>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] uppercase font-bold text-stone-400 font-sans">Security Answer</label>
                  <input
                    type="text"
                    required
                    placeholder="Nhập câu trả lời..."
                    value={authAnswerInput}
                    onChange={(e) => setAuthAnswerInput(e.target.value)}
                    className="px-3.5 py-2.5 bg-white border border-stone-200 rounded-xl text-sm placeholder-stone-400 shadow-xs focus:ring-1 focus:ring-red-500/20 focus:border-red-600 outline-none font-sans"
                  />
                </div>

                <button
                  type="submit"
                  className="mt-2 py-3 bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs rounded-xl transition shadow-md cursor-pointer flex items-center justify-center gap-2 font-sans"
                >
                  Xác nhận câu trả lời / Submit
                </button>

                <div className="text-center text-xs text-stone-500 mt-2 font-sans">
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('recover-email');
                      setAuthError(null);
                      setAuthSuccess(null);
                    }}
                    className="font-bold text-red-650 hover:text-red-750 cursor-pointer"
                  >
                    Quay lại bước trước
                  </button>
                </div>
              </form>
            )}

            {authMode === 'recovered' && (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1 mb-2">
                  <h3 className="text-lg font-bold text-stone-900 font-display">Lấy lại mật khẩu thành công</h3>
                  <p className="text-xs text-stone-500">Mật khẩu tài khoản của bạn đã được khôi phục.</p>
                </div>

                <div className="bg-green-50 border border-green-200 rounded-xl p-5 text-center my-2">
                  <span className="text-[10px] uppercase font-black tracking-widest text-green-655 block mb-1">Mật khẩu của bạn là:</span>
                  <span className="font-mono text-2xl font-black text-green-900 tracking-wide select-text">{recoveredPassword}</span>
                </div>

                <button
                  onClick={() => {
                    setAuthPassword(recoveredPassword);
                    setAuthMode('login');
                    setAuthError(null);
                    setAuthSuccess(null);
                  }}
                  className="mt-2 py-3 bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs rounded-xl transition shadow-md cursor-pointer flex items-center justify-center gap-2 font-sans"
                >
                  Đăng nhập ngay với mật khẩu này
                </button>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
