import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Music, 
  Search, 
  Heart, 
  ListMusic, 
  PlusCircle, 
  Camera,
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
  Sparkles,
  BarChart3
} from 'lucide-react';
import SongViewer from './components/SongViewer';
import { Html5Qrcode } from 'html5-qrcode';
import InstrumentTuner from './components/InstrumentTuner';
import AdminStatsView from './components/AdminStatsView';
import { transposeChord, NOTE_TO_SEMITONE } from './utils/transposer';
import BrandLogo from './components/BrandLogo';

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

const getSongMetaText = (song) => {
  if (!song) return '';
  const artist = (song.artist && song.artist.trim() !== '0-9' && song.artist.toLowerCase().trim() !== 'khuyết danh') ? song.artist.trim() : '';
  const composer = (song.composer && song.composer.trim() !== '0-9' && song.composer.toLowerCase().trim() !== 'khuyết danh') ? song.composer.trim() : '';
  if (artist && composer) {
    if (artist.toLowerCase() === composer.toLowerCase()) {
      return artist;
    }
    return `${artist} • ${composer}`;
  }
  return artist || composer || '';
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
  const lastLoadedSongIdRef = useRef(null);

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
    return false;
  });
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [instrument, setInstrument] = useState(() => {
    return localStorage.getItem('campfire_instrument') || 'guitar';
  });
  const [showKeySelector, setShowKeySelector] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [detectionState, setDetectionState] = useState('idle'); // 'idle', 'listening', 'done', 'error'
  const [detectionCountdown, setDetectionCountdown] = useState(5);
  const [detectedKey, setDetectedKey] = useState(null);
  const [detectedConfidence, setDetectedConfidence] = useState(0);
  const [detectionErrorMsg, setDetectionErrorMsg] = useState('');
  const [recordedAudioUrl, setRecordedAudioUrl] = useState(null);
  const [showTuner, setShowTuner] = useState(false);
  const [showVersionTracker, setShowVersionTracker] = useState(false);
  const [cleanupResult, setCleanupResult] = useState(null);
  const [isCleaningDb, setIsCleaningDb] = useState(false);
  const [sessionCode, setSessionCode] = useState(null);
  const [sessionRole, setSessionRole] = useState(null); // 'host' or 'follower'
  const [sessionInputCode, setSessionInputCode] = useState('');
  const [importingPlaylist, setImportingPlaylist] = useState(null);
  const [sharePlaylistId, setSharePlaylistId] = useState(null);
  const [sessionReport, setSessionReport] = useState(null);
  const [sessionComment, setSessionComment] = useState('');
  const [showQrScanner, setShowQrScanner] = useState(false);
  const qrScannerRef = useRef(null);
  const [setlistFilter, setSetlistFilter] = useState('all');
  const [setlistSearch, setSetlistSearch] = useState('');
  const [setlistSort, setSetlistSort] = useState('newest');
  const [setlistViewMode, setSetlistViewMode] = useState('grid');

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

  const popularSongs = useMemo(() => {
    const targets = ["Cát bụi", "Diễm xưa", "Thôi đời", "Trả lại thời gian", "Giọng ca dĩ vãng", "Đập vỡ cây đàn", "Áo em chưa mặc một lần", "Thành phố buồn", "Như một lời chia tay"];
    const found = songs.filter(s => targets.some(t => s.title.toLowerCase().includes(t.toLowerCase())));
    if (found.length > 0) return found.slice(0, 6);
    return songs.slice(0, 6);
  }, [songs]);

  const newSongs = useMemo(() => {
    return [...songs]
      .filter(s => s.dateAdded)
      .sort((a, b) => new Date(b.dateAdded) - new Date(a.dateAdded))
      .slice(0, 6);
  }, [songs]);

  const favoriteSongs = useMemo(() => {
    if (currentUser) {
      return songs.filter(s => userFavoritesList.includes(s.id));
    }
    return songs.filter(s => s.isFavorite);
  }, [songs, userFavoritesList, currentUser]);


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

  const trackFeatureUse = (featureName) => {
    fetch(`${API_BASE}/analytics/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'feature_use', featureName })
    }).catch(console.error);
  };

  // Analytics Tracking (Visits, Sessions, Duration)
  useEffect(() => {
    const sessionId = Math.random().toString(36).substring(2, 15);
    
    // Track initial visit
    fetch(`${API_BASE}/analytics/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'visit', userId: currentUser?.id, sessionId })
    }).catch(console.error);

    // Track heartbeat/duration every 30 seconds
    const interval = setInterval(() => {
      fetch(`${API_BASE}/analytics/track`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'session_duration', userId: currentUser?.id, sessionId, durationSeconds: 30 })
      }).catch(console.error);
    }, 30000);

    return () => {
      clearInterval(interval);
    };
  }, [currentUser]);

  // Startup URL parameters checker
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const importId = params.get('importPlaylist');
    if (importId) {
      fetch(`${API_BASE}/playlists/${importId}`)
        .then(res => res.json())
        .then(data => {
          setImportingPlaylist(data);
        })
        .catch(err => console.error('Error loading import playlist:', err));
    }

    const joinCode = params.get('joinSession');
    if (joinCode) {
      const cleanCode = joinCode.trim().toUpperCase();
      const savedUser = localStorage.getItem('campfire_user');
      const parsedUser = savedUser ? JSON.parse(savedUser) : null;
      if (parsedUser) {
        fetch(`${API_BASE}/sessions/${cleanCode}/join`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: parsedUser.id,
            email: parsedUser.email
          })
        })
        .then(res => {
          if (res.ok) return res.json();
          throw new Error('Session not found or expired');
        })
        .then(data => {
          setSessionCode(data.sessionId);
          setSessionRole('follower');
          if (data.currentSongId) {
            setActiveSongId(data.currentSongId);
          }
          if (data.currentKey !== null && data.currentKey !== undefined) {
            setTransposeOffset(parseInt(data.currentKey, 10) || 0);
          }
        })
        .catch(err => console.error('Error auto-joining session:', err));
      } else {
        setSessionInputCode(cleanCode);
        setActiveTab('setlists');
        alert('Vui lòng Đăng nhập để tự động tham gia Jam Session!');
      }
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // In-App QR Scanner camera lifecycle management
  useEffect(() => {
    let active = true;
    if (!showQrScanner) {
      if (qrScannerRef.current) {
        qrScannerRef.current.stop()
          .then(() => { if (qrScannerRef.current) qrScannerRef.current = null; })
          .catch(err => console.error('Error stopping QR scanner:', err));
      }
      return;
    }

    const timer = setTimeout(() => {
      if (!active) return;
      try {
        const html5QrCode = new Html5Qrcode("qr-reader-target");
        qrScannerRef.current = html5QrCode;
        
        html5QrCode.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: { width: 220, height: 220 }
          },
          (decodedText) => {
            if (!active) return;
            try {
              const url = new URL(decodedText);
              const joinCode = url.searchParams.get('joinSession');
              const importId = url.searchParams.get('importPlaylist');
              
              if (joinCode) {
                handleJoinJamSession(joinCode);
                setShowQrScanner(false);
              } else if (importId) {
                fetch(`${API_BASE}/playlists/${importId}`)
                  .then(res => res.json())
                  .then(data => {
                    setImportingPlaylist(data);
                    setShowQrScanner(false);
                  })
                  .catch(err => console.error(err));
              } else {
                alert('Mã QR không đúng định dạng HátCùngNhau!');
              }
            } catch (e) {
              if (decodedText && decodedText.trim().length === 6) {
                handleJoinJamSession(decodedText.trim());
                setShowQrScanner(false);
              } else {
                alert('Quét thành công văn bản: ' + decodedText);
              }
            }
          },
          (errorMessage) => {
            // Ignore error
          }
        ).catch(err => {
          console.error("Camera access error:", err);
          alert('Không thể truy cập camera. Vui lòng cấp quyền camera trong cài đặt!');
          setShowQrScanner(false);
        });
      } catch (err) {
        console.error("Scanner creation error:", err);
      }
    }, 150);

    return () => {
      active = false;
      clearTimeout(timer);
      if (qrScannerRef.current) {
        qrScannerRef.current.stop().catch(err => console.error(err));
        qrScannerRef.current = null;
      }
    };
  }, [showQrScanner]);

  // Host Session sync effect
  useEffect(() => {
    if (sessionRole === 'host' && sessionCode) {
      fetch(`${API_BASE}/sessions/${sessionCode}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentSongId: activeSongId,
          currentKey: transposeOffset
        })
      }).catch(err => console.error('Error syncing host state to session:', err));
    }
  }, [activeSongId, transposeOffset, sessionRole, sessionCode]);

  // Follower Session sync effect (polling every 1.5s)
  useEffect(() => {
    if (sessionRole !== 'follower' || !sessionCode) return;

    let active = true;
    const interval = setInterval(() => {
      if (!active) return;
      fetch(`${API_BASE}/sessions/${sessionCode}`)
        .then(res => {
          if (!res.ok) {
            if (res.status === 404) {
              throw new Error('SESSION_CLOSED');
            }
            throw new Error('HTTP_ERROR');
          }
          return res.json();
        })
        .then(data => {
          if (!active) return;
          if (data.currentSongId !== activeSongId) {
            setActiveSongId(data.currentSongId);
          }
          if (data.currentKey !== null && data.currentKey !== undefined && parseInt(data.currentKey, 10) !== transposeOffset) {
            setTransposeOffset(parseInt(data.currentKey, 10) || 0);
          }
        })
        .catch(err => {
          console.error('Error polling session sync:', err);
          if (err.message === 'SESSION_CLOSED') {
            setSessionCode(null);
            setSessionRole(null);
            alert('Host đã kết thúc Jam Session này! Phiên kết nối của bạn đã đóng.');
          }
        });
    }, 1500);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [sessionRole, sessionCode, activeSongId, transposeOffset]);

  // Track transpose usage
  useEffect(() => {
    if (transposeOffset !== 0) {
      trackFeatureUse('transpose');
    }
  }, [transposeOffset]);

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

  // Handle URL song parameter on load
  useEffect(() => {
    if (songs.length > 0) {
      const params = new URLSearchParams(window.location.search);
      const songId = params.get('song');
      if (songId) {
        const found = songs.find(s => s.id === songId);
        if (found) {
          setActiveSongId(songId);
        }
      }
    }
  }, [songs]);

  const detectPitch = (buffer, sampleRate) => {
    let bufferSize = buffer.length;
    let rms = 0;
    for (let i = 0; i < bufferSize; i++) {
      rms += buffer[i] * buffer[i];
    }
    rms = Math.sqrt(rms / bufferSize);
    if (rms < 0.003) return null;

    const maxLag = Math.min(bufferSize, Math.ceil(sampleRate / 70));
    const minLag = Math.floor(sampleRate / 600);

    const c = new Float32Array(maxLag);
    for (let i = 0; i < maxLag; i++) {
      let sum = 0;
      for (let j = 0; j < bufferSize - i; j++) {
        sum += buffer[j] * buffer[j + i];
      }
      c[i] = sum;
    }

    let d = 0;
    while (d < maxLag - 1 && c[d] > c[d + 1]) {
      d++;
    }

    let maxval = -1;
    let maxpos_temp = -1;
    for (let i = Math.max(d, minLag); i < maxLag; i++) {
      if (c[i] > maxval) {
        maxval = c[i];
        maxpos_temp = i;
      }
    }

    const estimatedFreq = maxpos_temp > 0 ? sampleRate / maxpos_temp : 0;
    const thresholdRatio = estimatedFreq > 220 ? 0.35 : 0.50;

    if (maxval < thresholdRatio * c[0]) {
      return null;
    }

    let maxpos = -1;
    const threshold = maxval * 0.80;
    for (let i = Math.max(d, minLag, 1); i < maxLag - 1; i++) {
      if (c[i] > c[i - 1] && c[i] > c[i + 1]) {
        if (c[i] > threshold) {
          maxpos = i;
          break;
        }
      }
    }

    if (maxpos === -1) {
      let fallbackMax = -1;
      for (let i = Math.max(d, minLag); i < maxLag; i++) {
        if (c[i] > fallbackMax) {
          fallbackMax = c[i];
          maxpos = i;
        }
      }
    }

    let T0 = maxpos;
    if (T0 > 0 && T0 < maxLag - 1) {
      const x1 = c[T0 - 1];
      const x2 = c[T0];
      const x3 = c[T0 + 1];
      const a = (x1 + x3 - 2 * x2) / 2;
      const b = (x3 - x1) / 2;
      if (a) {
        T0 = T0 - b / (2 * a);
      }
    }

    return sampleRate / T0;
  };

  const pearsonCorrelation = (x, y) => {
    let n = x.length;
    let sumX = 0, sumY = 0, sumXY = 0;
    let sumX2 = 0, sumY2 = 0;
    for (let i = 0; i < n; i++) {
      sumX += x[i];
      sumY += y[i];
      sumXY += x[i] * y[i];
      sumX2 += x[i] * x[i];
      sumY2 += y[i] * y[i];
    }
    let num = n * sumXY - sumX * sumY;
    let den = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    if (den === 0) return 0;
    return num / den;
  };

  const estimateKey = (pitchProfile, captureCount) => {
    if (captureCount < 10) {
      setDetectionErrorMsg('Không nghe rõ giọng hát/ngân nga. Hãy thử đặt micro gần hơn và hát to hơn!');
      setDetectionState('error');
      return;
    }

    const majorProfile = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
    const minorProfile = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
    
    // Scale-degree weights: Tonic (0) = 1.0, 5th (7) = 0.9, 3rd (3/4) = 0.8. In-scale = 0.5. Out-of-scale = -0.5.
    const majorScaleWeights = [1.0, -0.5, 0.5, -0.5, 0.8, 0.5, -0.5, 0.9, -0.5, 0.5, -0.5, 0.5];
    const minorScaleWeights = [1.0, -0.5, 0.5, 0.8, -0.5, 0.5, -0.5, 0.9, 0.5, -0.5, 0.5, -0.5];
    
    const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

    // Normalize pitch profile
    const totalPitches = pitchProfile.reduce((sum, val) => sum + val, 0);
    const normalizedProfile = new Float32Array(12);
    if (totalPitches > 0) {
      for (let i = 0; i < 12; i++) {
        normalizedProfile[i] = pitchProfile[i] / totalPitches;
      }
    }

    let bestKey = '';
    let maxScore = -2;

    for (let keyIdx = 0; keyIdx < 12; keyIdx++) {
      const shiftedMajor = new Float32Array(12);
      const shiftedMinor = new Float32Array(12);
      for (let i = 0; i < 12; i++) {
        shiftedMajor[(i + keyIdx) % 12] = majorProfile[i];
        shiftedMinor[(i + keyIdx) % 12] = minorProfile[i];
      }

      // Pearson correlation (good for polyphonic/accompaniment)
      const corrMajor = pearsonCorrelation(pitchProfile, shiftedMajor);
      const corrMinor = pearsonCorrelation(pitchProfile, shiftedMinor);

      // Scale-degree fit score (good for monophonic humming/singing)
      let scoreMajor = 0;
      let scoreMinor = 0;
      for (let i = 0; i < 12; i++) {
        const val = normalizedProfile[(i + keyIdx) % 12];
        scoreMajor += val * majorScaleWeights[i];
        scoreMinor += val * minorScaleWeights[i];
      }

      // Hybrid combination (40% correlation, 60% scale-degree fit)
      const hybridMajor = 0.4 * corrMajor + 0.6 * scoreMajor;
      const hybridMinor = 0.4 * corrMinor + 0.6 * scoreMinor;

      if (hybridMajor > maxScore) {
        maxScore = hybridMajor;
        bestKey = notes[keyIdx];
      }
      if (hybridMinor > maxScore) {
        maxScore = hybridMinor;
        bestKey = notes[keyIdx] + 'm';
      }
    }

    const confidence = Math.max(0, Math.min(100, Math.round(maxScore * 100)));
    setDetectedKey(bestKey);
    setDetectedConfidence(confidence);
    setDetectionState('done');
  };

  const analyzeRecordedAudio = async (blob) => {
    try {
      setDetectionState('processing');
      
      const arrayBuffer = await blob.arrayBuffer();
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 44100 });
      const decodedBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      
      const channelData = decodedBuffer.getChannelData(0); // mono
      const sampleRate = decodedBuffer.sampleRate;
      
      const windowSize = 2048;
      const hopSize = 1024; // 50% overlap
      const pitchProfile = new Float32Array(12);
      let captureCount = 0;
      
      const pitchHistory = [];
      const STABILITY_THRESHOLD = 0.5; // semitones
      
      for (let offset = 0; offset < channelData.length - windowSize; offset += hopSize) {
        const windowBuffer = channelData.subarray(offset, offset + windowSize);
        const pitch = detectPitch(windowBuffer, sampleRate);
        
        if (pitch && pitch > 60 && pitch < 1000) {
          const midi = 12 * Math.log2(pitch / 440) + 69;
          pitchHistory.push(midi);
        } else {
          pitchHistory.push(null);
        }
        
        // Pitch Stability Filter: Require pitch to be stable for 3 consecutive windows (~70ms)
        const len = pitchHistory.length;
        if (len >= 3) {
          const p1 = pitchHistory[len - 1];
          const p2 = pitchHistory[len - 2];
          const p3 = pitchHistory[len - 3];
          
          if (p1 !== null && p2 !== null && p3 !== null) {
            if (Math.abs(p1 - p2) <= STABILITY_THRESHOLD &&
                Math.abs(p2 - p3) <= STABILITY_THRESHOLD &&
                Math.abs(p1 - p3) <= STABILITY_THRESHOLD) {
              const noteIndex = Math.round(p1) % 12;
              pitchProfile[noteIndex] += 1;
              captureCount++;
            }
          }
        }
      }
      
      audioCtx.close();
      estimateKey(pitchProfile, captureCount);
      
    } catch (err) {
      console.error('Error in offline audio analysis:', err);
      setDetectionErrorMsg(`Lỗi xử lý âm thanh: ${err.message}`);
      setDetectionState('error');
    }
  };

  const startKeyDetection = async () => {
    try {
      setDetectionErrorMsg('');
      setRecordedAudioUrl(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      });
      
      setDetectionState('listening');
      setDetectionCountdown(10);
      setDetectedKey(null);

      // Start recording media recorder
      let chunks = [];
      let recorder;
      try {
        recorder = new MediaRecorder(stream);
        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            chunks.push(e.data);
          }
        };
        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: 'audio/webm' });
          const url = URL.createObjectURL(blob);
          setRecordedAudioUrl(url);
          
          // Trigger offline post-processing analysis
          analyzeRecordedAudio(blob);
        };
        recorder.start();
      } catch (recErr) {
        console.error('MediaRecorder error:', recErr);
        setDetectionErrorMsg('Trình duyệt không hỗ trợ ghi âm MediaRecorder.');
        setDetectionState('error');
        stream.getTracks().forEach(t => t.stop());
        return;
      }

      let secondsLeft = 10;
      const interval = setInterval(() => {
        secondsLeft--;
        setDetectionCountdown(secondsLeft);
        if (secondsLeft <= 0) {
          clearInterval(interval);
          
          if (recorder && recorder.state !== 'inactive') {
            recorder.stop();
          }
          
          stream.getTracks().forEach(t => t.stop());
        }
      }, 1000);

    } catch (err) {
      console.error('Error starting key detection:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setDetectionErrorMsg('Trình duyệt bị từ chối quyền truy cập Micro. Hãy cấp quyền trong cài đặt!');
      } else if (err.name === 'SecurityError' || !window.isSecureContext) {
        setDetectionErrorMsg('Trình duyệt yêu cầu kết nối bảo mật (HTTPS) để sử dụng Micro trên điện thoại.');
      } else {
        setDetectionErrorMsg(`Không thể kết nối Micro: ${err.message || err.name}`);
      }
      setDetectionState('error');
    }
  };

  useEffect(() => {
    setDetectionState('idle');
  }, [activeSongId]);

  // Load or save song-specific key selection and font size if song is favorited
  useEffect(() => {
    if (activeSongId) {
      const song = songs.find(s => s.id === activeSongId) || onlineSong;
      const isFav = song ? isSongFavorited(song) : false;

      if (lastLoadedSongIdRef.current !== activeSongId) {
        // We are opening a new song. Load settings if it is favorited.
        if (isFav) {
          const saved = localStorage.getItem(`campfire_song_settings_${activeSongId}`);
          if (saved) {
            try {
              const { transposeOffset: savedOffset, fontSize: savedFontSize } = JSON.parse(saved);
              setTransposeOffset(savedOffset ?? 0);
              if (savedFontSize) {
                setFontSize(savedFontSize);
                localStorage.setItem('campfire_font_size', savedFontSize);
              }
              lastLoadedSongIdRef.current = activeSongId;
              return;
            } catch (e) {
              console.error('Error parsing saved song settings:', e);
            }
          }
        }
        // Fallback: reset transpose offset to 0
        setTransposeOffset(0);
        lastLoadedSongIdRef.current = activeSongId;
      } else {
        // Same song is loaded, save any user modifications if the song is favorited
        if (isFav) {
          localStorage.setItem(
            `campfire_song_settings_${activeSongId}`,
            JSON.stringify({ transposeOffset, fontSize })
          );
        } else {
          // If it's no longer favorited, clean up settings
          localStorage.removeItem(`campfire_song_settings_${activeSongId}`);
        }
      }
    } else {
      // Song closed, reset offset and clear tracking ref
      setTransposeOffset(0);
      lastLoadedSongIdRef.current = null;
    }
  }, [activeSongId, transposeOffset, fontSize, userFavoritesList, songs, onlineSong]);

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
      trackFeatureUse('search_online');
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
    trackFeatureUse('favorite_toggle');
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

  const handleGoHome = () => {
    setActiveSongId(null);
    setSearchInput('');
    setSearchQuery('');
    setActiveTab('songs');
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

  const handleCreateFromTemplate = async (templateName) => {
    try {
      const res = await fetch(`${API_BASE}/playlists`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: templateName })
      });
      if (res.ok) {
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

  const handleStartJamSession = async (playlistId) => {
    if (!currentUser) {
      setAuthMode('login');
      setAuthError('Vui lòng Đăng nhập tài khoản để làm Host của Jam Session!');
      setShowAuthModal(true);
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/sessions/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hostId: currentUser.id,
          hostName: currentUser.email,
          playlistId: playlistId,
          currentSongId: activeSongId,
          currentKey: transposeOffset
        })
      });
      const data = await res.json();
      setSessionCode(data.sessionId);
      setSessionRole('host');
      setSessionComment('');
      setSessionReport(null);
      trackFeatureUse('start_jam_session');
    } catch (err) {
      console.error('Error starting jam session:', err);
    }
  };

  const handleJoinJamSession = async (code) => {
    if (!currentUser) {
      setAuthMode('login');
      setAuthError('Vui lòng Đăng nhập tài khoản để tham gia Jam Session!');
      setShowAuthModal(true);
      return;
    }
    if (!code) return;
    const cleanCode = code.trim().toUpperCase();
    try {
      const res = await fetch(`${API_BASE}/sessions/${cleanCode}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser.id,
          email: currentUser.email
        })
      });
      if (!res.ok) {
        alert('Không tìm thấy Session này hoặc mã đã hết hạn. Vui lòng kiểm tra lại!');
        return;
      }
      const data = await res.json();
      setSessionCode(data.sessionId);
      setSessionRole('follower');
      setSessionInputCode('');
      
      if (data.currentSongId) {
        setActiveSongId(data.currentSongId);
      }
      if (data.currentKey !== null && data.currentKey !== undefined) {
        setTransposeOffset(parseInt(data.currentKey, 10) || 0);
      }
      
      trackFeatureUse('join_jam_session');
    } catch (err) {
      console.error('Error joining session:', err);
      alert('Không thể kết nối tới Session. Vui lòng thử lại!');
    }
  };

  const handleCloseSession = async () => {
    if (!sessionCode || sessionRole !== 'host') return;
    try {
      const res = await fetch(`${API_BASE}/sessions/${sessionCode}/close`, {
        method: 'POST'
      });
      if (res.ok) {
        const data = await res.json();
        setSessionReport(data.report);
      }
      setSessionCode(null);
      setSessionRole(null);
    } catch (err) {
      console.error('Error closing session:', err);
      setSessionCode(null);
      setSessionRole(null);
    }
  };

  const handleLeaveSession = async () => {
    if (!sessionCode || sessionRole !== 'follower') return;
    try {
      await fetch(`${API_BASE}/sessions/${sessionCode}/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser?.id })
      });
      setSessionCode(null);
      setSessionRole(null);
    } catch (err) {
      console.error('Error leaving session:', err);
      setSessionCode(null);
      setSessionRole(null);
    }
  };

  const handleConfirmImport = async () => {
    if (!importingPlaylist) return;
    try {
      const res = await fetch(`${API_BASE}/playlists`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: importingPlaylist.name,
          songIds: importingPlaylist.songIds
        })
      });
      if (!res.ok) throw new Error('Failed to import');
      fetchPlaylists();
      setImportingPlaylist(null);
      window.history.replaceState({}, document.title, window.location.pathname);
      setActiveTab('setlists');
    } catch (err) {
      console.error('Error importing playlist:', err);
      alert('Lỗi nhập playlist: ' + err.message);
    }
  };

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
        {!(activeSongId !== null && window.innerWidth < 768) && (
        <header className="bg-[#f5f3ef]/90 backdrop-blur sticky top-0 z-30 border-b border-[#e3ded5] shadow-sm select-none transition-all duration-300 w-full flex flex-col">
          <div className={`max-w-6xl w-full mx-auto px-4 py-2 md:py-3 md:px-8 flex items-center justify-between relative transition-all duration-300 ${
            isSearchFocused ? 'gap-0 md:gap-4' : 'gap-4'
          }`}>
          {/* Logo / Brand (Left) */}
          <div className={`flex items-center gap-2 select-none shrink-0 transition-all duration-300 ease-in-out overflow-hidden whitespace-nowrap ${
            isSearchFocused 
              ? 'max-w-0 opacity-0 pointer-events-none md:max-w-[320px] md:opacity-100 md:pointer-events-auto' 
              : 'max-w-[320px] opacity-100 pointer-events-auto'
          }`}>
            <div onClick={handleGoHome} className="cursor-pointer hover:opacity-90">
              <BrandLogo variant="horizontal" className="h-12 md:h-20 w-auto transition-all duration-200" />
            </div>
          </div>

          {/* Search Box (Center, expands) */}
          <div className={`relative md:absolute md:left-1/2 md:-translate-x-1/2 flex-grow md:flex-grow-0 min-w-0 w-full transition-all duration-300 ease-in-out z-20 ${
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
              <div 
                className="absolute left-0 right-0 top-full mt-4 bg-white border border-stone-200/80 rounded-2xl shadow-2xl z-50 select-none flex flex-col text-left animate-fade-in-opacity"
                style={{
                  padding: '12px 10px',
                  gap: '8px',
                  maxHeight: '380px'
                }}
              >
                {suggestions.length > 0 && (
                  <div className="overflow-y-auto flex-grow no-scrollbar flex flex-col gap-1">
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
                        className="hover:bg-stone-50 active:bg-stone-100 flex items-center justify-between cursor-pointer group transition-colors rounded-xl"
                        style={{ 
                          padding: '6px 16px', 
                          lineHeight: '1.2' 
                        }}
                      >
                        <div className="min-w-0 flex-grow pr-3 flex items-center">
                          <div className="font-bold text-base text-stone-900 group-hover:text-red-750 transition-colors truncate">
                            {song.title}
                          </div>
                        </div>
                        {(() => {
                          const cleanComposer = (song.composer && song.composer.trim() !== '0-9' && song.composer.toLowerCase().trim() !== 'khuyết danh') ? song.composer.trim() : '';
                          const cleanArtist = (song.artist && song.artist.trim() !== '0-9' && song.artist.toLowerCase().trim() !== 'khuyết danh') ? song.artist.trim() : '';
                          const rightText = cleanComposer || cleanArtist;
                          if (!rightText) return null;
                          return (
                            <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg bg-stone-55 border border-stone-200/60 text-stone-500 shrink-0 select-none truncate max-w-[120px]">
                              {rightText}
                            </span>
                          );
                        })()}
                      </div>
                    ))}
                  </div>
                )}

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
                    className="hover:bg-blue-50 active:bg-blue-100 flex items-center gap-3 cursor-pointer text-blue-700 transition-colors font-bold text-sm min-h-[52px] shrink-0 rounded-xl"
                    style={{ 
                      padding: '16px 20px', 
                      lineHeight: '2.0' 
                    }}
                  >
                    <Globe className="w-5 h-5 text-blue-600 animate-pulse shrink-0" />
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
                    <span>Setlists / Danh sách bài hát</span>
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
                      setShowTuner(true);
                      setShowSettingsMenu(false);
                      trackFeatureUse('tuner');
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3.5 text-sm font-bold rounded-xl transition-all text-left text-stone-800 hover:bg-stone-50 hover:text-stone-950 cursor-pointer"
                  >
                    <Mic className="w-4.5 h-4.5 text-stone-500 shrink-0" />
                    <span>Bộ lên dây / Instrument Tuner</span>
                  </button>

                  <button
                    onClick={() => {
                      setShowVersionTracker(true);
                      setShowSettingsMenu(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3.5 text-sm font-bold rounded-xl transition-all text-left text-stone-800 hover:bg-stone-50 hover:text-stone-950 cursor-pointer"
                  >
                    <Info className="w-4.5 h-4.5 text-stone-500 shrink-0" />
                    <span>Nhật ký phiên bản / Version Tracker</span>
                  </button>

                  {currentUser?.role === 'admin' && (
                    <>
                      <button
                        onClick={() => {
                          setActiveTab('admin-stats');
                          setSelectedPlaylistId(null);
                          setActiveSongId(null);
                          setShowSettingsMenu(false);
                          trackFeatureUse('admin_stats_view');
                        }}
                        className={`w-full flex items-center gap-3 px-4 py-3.5 text-sm font-bold rounded-xl transition-all text-left cursor-pointer ${
                          activeTab === 'admin-stats' 
                            ? 'text-[#FF8A00] font-extrabold bg-[#FFF6E9]' 
                            : 'text-stone-800 hover:bg-stone-50 hover:text-stone-950'
                        }`}
                      >
                        <BarChart3 className="w-4.5 h-4.5 text-[#FF8A00] shrink-0" />
                        <span>Thống kê hệ thống / Analytics</span>
                      </button>

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
                    </>
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
          </div>
         </header>
        )}

        {/* Collaborative Jam Session Pinned Status Banner */}
        {sessionCode && (
          <div className={`w-full py-2 px-4 select-none flex items-center justify-between text-xs font-bold border-b transition-all duration-300 animate-fade-in ${
            sessionRole === 'host' 
              ? 'bg-green-50 border-green-250 text-green-800' 
              : 'bg-blue-50 border-blue-250 text-blue-800'
          }`}>
            <div className="flex items-center gap-2">
              <Wifi className={`w-4 h-4 ${sessionRole === 'host' ? 'text-green-600 animate-pulse' : 'text-blue-600 animate-bounce'}`} />
              <span>
                {sessionRole === 'host' 
                  ? `Đang làm Host Session: ${sessionCode} | Chơi nhạc để người khác theo dõi`
                  : `Đang nghe nhạc cùng Host Session: ${sessionCode} (Tự động đồng bộ)`}
              </span>
            </div>
            <div className="flex items-center gap-3">
              {sessionRole === 'host' && (
                <button
                  onClick={() => setSharePlaylistId('session')}
                  className="px-2.5 py-1 bg-white border border-green-200 hover:bg-green-100 rounded-lg text-[10px] font-black uppercase text-green-700 shadow-sm cursor-pointer"
                >
                  Mã QR / Share
                </button>
              )}
              <button
                onClick={sessionRole === 'host' ? handleCloseSession : handleLeaveSession}
                className="px-2.5 py-1 bg-stone-900 hover:bg-stone-850 text-white rounded-lg text-[10px] font-black uppercase shadow-sm cursor-pointer"
              >
                {sessionRole === 'host' ? 'Dừng Session' : 'Rời Session'}
              </button>
            </div>
          </div>
        )}

        {/* Content Body */}
        <main className={`flex-grow overflow-y-auto ${
          displaySong 
            ? 'w-full flex flex-col p-0' 
            : 'p-4 md:p-8 max-w-6xl w-full mx-auto self-center'
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
              {(() => {
                const playlistIndex = activePlaylistSongs.findIndex(s => s.id === activeSongId);
                const hasNext = playlistIndex !== -1 && playlistIndex < activePlaylistSongs.length - 1;
                const hasPrev = playlistIndex > 0;
                
                return (
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
                    setFontSize={setFontSize}
                    isCompact={isCompact}
                    setIsCompact={setIsCompact}
                    instrument={instrument}
                    onSaveToLibrary={handleSaveOnlineSongToLibrary}
                    isSavingToLibrary={isSavingToLibrary}
                    onNextSong={handleNextSong}
                    onPrevSong={handlePrevSong}
                    hasNext={hasNext}
                    hasPrev={hasPrev}
                    playlistIndex={playlistIndex}
                    playlistLength={activePlaylistSongs.length}
                  />
                );
              })()}
              
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
                    <div className="flex flex-col gap-8 max-w-6xl mx-auto w-full">
                      {/* Chào mừng & Welcome Header */}
                      <div className="text-left py-4 px-1 animate-fade-in flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-stone-200 pb-4">
                        <div>
                          <h1 className="text-2xl font-black text-stone-900 font-display">Chào mừng trở lại! 👋</h1>
                          <p className="text-sm font-bold text-stone-600 mt-1">Hôm nay bạn muốn hát bài gì? 🎵</p>
                        </div>
                        <div className="text-xs font-bold text-stone-500 bg-stone-100/80 border border-stone-200 px-3.5 py-1.5 rounded-xl shrink-0 select-none">
                          Thư viện có <span className="text-[#FF8A00] font-black">{songs.length}</span> bài hát &middot; <span className="text-[#FF8A00] font-black">{playlists.length}</span> setlists
                        </div>
                      </div>

                      {/* Quick Action Grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 select-none">
                        {/* Action Card 1: Tìm bài hát */}
                        <div className="bg-white border border-stone-200/80 rounded-2xl p-5 shadow-xs flex flex-col h-40 transition-all hover:shadow-md hover:border-orange-500/20 text-left">
                          <h4 className="text-sm font-black text-stone-900 font-display flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                            Tìm bài hát
                          </h4>
                          <p className="text-xs text-stone-500 mt-2 leading-relaxed flex-grow">Tìm nhanh lời nhạc, hợp âm cho bài hát bạn yêu thích.</p>
                          <div className="flex gap-1.5 mt-auto">
                            <input
                              type="text"
                              placeholder="Tên bài hát..."
                              value={searchInput}
                              onChange={(e) => setSearchInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  setSearchQuery(searchInput);
                                }
                              }}
                              className="w-full px-2.5 py-1.5 bg-stone-50 border border-stone-200 rounded-lg text-xs font-semibold focus:outline-none"
                            />
                            <button 
                              onClick={() => setSearchQuery(searchInput)}
                              className="px-3 py-1.5 bg-[#FF8A00] hover:bg-orange-600 text-white rounded-lg text-xs font-bold transition active:scale-95 cursor-pointer shrink-0"
                            >
                              Tìm
                            </button>
                          </div>
                        </div>

                        {/* Action Card 2: Jam Session (Light green themed) */}
                        <div className="bg-white border border-stone-200/80 rounded-2xl p-5 shadow-xs flex flex-col h-40 transition-all hover:shadow-md hover:border-green-500/20 text-left">
                          <h4 className="text-sm font-black text-stone-900 font-display flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                            Tham gia Jam Session
                          </h4>
                          <p className="text-xs text-stone-500 mt-2 leading-relaxed flex-grow">Nhập mã hoặc quét QR để hát cùng nhóm ngay bây giờ!</p>
                          <div className="flex gap-1.5 mt-auto">
                            <input
                              type="text"
                              placeholder="Mã..."
                              value={sessionInputCode}
                              onChange={(e) => setSessionInputCode(e.target.value)}
                              className="w-full px-2.5 py-1.5 bg-stone-50 border border-stone-200 rounded-lg text-xs font-mono font-black uppercase focus:outline-none"
                            />
                            <button 
                              onClick={() => handleJoinJamSession(sessionInputCode)}
                              className="px-2.5 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-bold transition active:scale-95 cursor-pointer shrink-0"
                            >
                              Vào
                            </button>
                            <button 
                              onClick={() => setShowQrScanner(true)}
                              className="p-1.5 bg-green-50 hover:bg-green-100 border border-green-200 text-green-700 rounded-lg transition active:scale-95 flex items-center justify-center cursor-pointer shrink-0"
                              title="Quét QR Code"
                            >
                              <Camera className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Action Card 3: Tạo Setlist (Orange themed) */}
                        <div className="bg-white border border-stone-200/80 rounded-2xl p-5 shadow-xs flex flex-col h-40 transition-all hover:shadow-md hover:border-orange-500/20 text-left">
                          <h4 className="text-sm font-black text-stone-900 font-display flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-orange-400"></span>
                            Tạo Setlist
                          </h4>
                          <p className="text-xs text-stone-500 mt-2 leading-relaxed flex-grow">Tạo danh sách bài hát cho mọi dịp hát cùng nhau.</p>
                          <button 
                            onClick={() => {
                              setActiveTab('setlists');
                            }}
                            className="mt-auto w-full py-2 bg-[#FF8A00] hover:bg-orange-600 text-white rounded-xl text-xs font-bold transition active:scale-95 flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                          >
                            <span>Tạo mới</span>
                          </button>
                        </div>

                        {/* Action Card 4: Tuner & Công cụ */}
                        <div className="bg-white border border-stone-200/80 rounded-2xl p-5 shadow-xs flex flex-col h-40 transition-all hover:shadow-md hover:border-stone-500/20 text-left">
                          <h4 className="text-sm font-black text-stone-900 font-display flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-stone-500"></span>
                            Tuner & Công cụ
                          </h4>
                          <p className="text-xs text-stone-500 mt-2 leading-relaxed flex-grow">Lên dây đàn, nhịp điệu trống, hướng dẫn và nhiều hơn nữa.</p>
                          <button 
                            onClick={() => setShowTuner(true)}
                            className="mt-auto w-full py-2 bg-stone-850 hover:bg-stone-800 text-white rounded-xl text-xs font-bold transition active:scale-95 flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                          >
                            <span>Mở công cụ</span>
                          </button>
                        </div>
                      </div>

                      {/* Khám phá theo thể loại */}
                      <div className="text-left animate-fade-in mt-1 select-none">
                        <h3 className="text-xs uppercase font-black tracking-widest text-stone-500 mb-3 flex items-center gap-1.5 font-sans">
                          <ListMusic className="w-4 h-4 text-orange-500" />
                          Khám phá theo thể loại / Genres
                        </h3>
                        <div className="flex gap-2 overflow-x-auto pb-1.5 no-scrollbar shrink-0">
                          {['Bolero', 'Acoustic', 'Nhạc Trẻ', 'Nhạc Trữ Tình', 'Nhạc Vàng', 'Worship', 'Thiếu Nhi', 'Quốc Tế'].map(g => (
                            <button
                              key={g}
                              onClick={() => {
                                setSearchInput(g);
                                setSearchQuery(g);
                              }}
                              className="px-4 py-2 bg-white border border-stone-200/85 rounded-full text-xs font-bold text-stone-700 transition hover:border-[#FF8A00] hover:text-[#FF8A00] active:scale-95 shrink-0 shadow-sm cursor-pointer"
                            >
                              {g}
                            </button>
                          ))}
                          <button
                            onClick={() => {
                              searchInputRef.current?.focus();
                            }}
                            className="px-4 py-2 bg-stone-50 border border-stone-200/80 rounded-full text-xs font-bold text-stone-500 transition hover:bg-stone-100 shrink-0 cursor-pointer"
                          >
                            Xem thêm...
                          </button>
                        </div>
                      </div>

                      {/* Bài hát thịnh hành / Trending */}
                      <div className="text-left animate-fade-in mt-1">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-xs uppercase font-black tracking-widest text-stone-500 flex items-center gap-1.5 font-sans">
                            <Flame className="w-4 h-4 text-red-500 fill-red-500/25" />
                            Bài hát thịnh hành / Trending 🔥
                          </h3>
                          <button onClick={() => searchInputRef.current?.focus()} className="text-[11px] font-bold text-red-700 hover:text-red-800 transition cursor-pointer">
                            Xem tất cả &rarr;
                          </button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                          {[
                            { id: 'trend_1', title: 'Có Chàng Trai Viết Lên Cây', artist: 'Phan Mạnh Quỳnh', key: 'Am', genre: 'Ballad' },
                            { id: 'trend_2', title: 'Chỉ Cần Là Anh', artist: 'Phương Ly', key: 'G', genre: 'Pop' },
                            { id: 'trend_3', title: 'Nơi Này Có Anh', artist: 'Sơn Tùng M-TP', key: 'Em', genre: 'Pop' },
                            { id: 'trend_4', title: 'Dẫu Có Lỗi Lầm', artist: 'Bùi Anh Tuấn', key: 'C', genre: 'Ballad' }
                          ].map((song, idx) => (
                            <div
                              key={song.id}
                              onClick={() => {
                                const found = songs.find(s => s.title.toLowerCase().includes(song.title.toLowerCase()));
                                if (found) {
                                  setActiveSongId(found.id);
                                } else {
                                  setSearchInput(song.title);
                                  setSearchQuery(song.title);
                                }
                              }}
                              className="bg-white border border-stone-200/80 hover:border-orange-500/30 rounded-xl p-4 cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md active:scale-[0.99] flex items-center gap-4 relative overflow-hidden group shadow-sm"
                            >
                              <span className="text-2xl font-black text-orange-200/70 group-hover:text-orange-500/40 transition-colors select-none w-6 text-center">
                                {idx + 1}
                              </span>
                              <div className="truncate flex-grow text-left">
                                <h4 className="font-bold text-sm text-stone-900 group-hover:text-orange-600 transition-colors truncate">{song.title}</h4>
                                <p className="text-[11px] text-stone-500 truncate mt-0.5">{song.artist}</p>
                              </div>
                              <div className="flex flex-col items-end gap-1 shrink-0 select-none">
                                <span className="font-mono text-[9px] font-black text-stone-500 bg-stone-100 px-1.5 py-0.5 rounded">
                                  {song.key}
                                </span>
                                <span className="text-[9px] font-bold text-stone-400">
                                  {song.genre}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Setlists gần đây */}
                      <div className="text-left animate-fade-in mt-1 select-none">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-xs uppercase font-black tracking-widest text-stone-500 flex items-center gap-1.5 font-sans">
                            <ListMusic className="w-4 h-4 text-amber-500" />
                            Setlists gần đây / Recent Setlists ⚡
                          </h3>
                          <button onClick={() => setActiveTab('setlists')} className="text-[11px] font-bold text-[#FF8A00] hover:text-orange-750 transition cursor-pointer">
                            Xem tất cả &rarr;
                          </button>
                        </div>
                        
                        {playlists.length === 0 ? (
                          <div className="text-center py-8 bg-white border border-stone-200 border-dashed rounded-xl select-none px-4">
                            <p className="text-xs text-stone-400">
                              Chưa có setlist nào. Click "Tạo mới" ở trên để chuẩn bị danh sách bài hát của bạn.
                            </p>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            {playlists.slice(0, 4).map((pl, idx) => {
                              // Custom colorful gradient classes for setlist card banner
                              const gradients = [
                                'from-orange-400 to-amber-500',
                                'from-rose-400 to-orange-500',
                                'from-indigo-400 to-purple-500',
                                'from-emerald-400 to-teal-500'
                              ];
                              const grad = gradients[idx % gradients.length];
                              return (
                                <div
                                  key={pl.id}
                                  onClick={() => {
                                    setSelectedPlaylistId(pl.id);
                                    setActiveTab('setlists');
                                  }}
                                  className="bg-white border border-stone-200/80 hover:border-[#FF8A00]/30 rounded-xl p-4 cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md active:scale-[0.99] flex flex-col justify-between h-28 relative overflow-hidden group shadow-sm text-left"
                                >
                                  <div className={`absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r ${grad}`}></div>
                                  <div className="mt-2 truncate">
                                    <h4 className="font-bold text-sm text-stone-900 group-hover:text-[#FF8A00] transition-colors truncate">{pl.name}</h4>
                                    <p className="text-[10px] text-stone-500 mt-1">{pl.songs?.length || 0} bài hát</p>
                                  </div>
                                  <div className="flex items-center justify-between mt-auto">
                                    <span className="text-[9px] font-black uppercase text-stone-400">
                                      Mở setlist &rarr;
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Footer features helper card */}
                      <div className="bg-[#FFF6E9] border border-[#F1E4D2] rounded-2xl p-6 select-none text-left animate-fade-in mt-2">
                        <h4 className="text-sm font-black text-[#4B2E20] mb-4 flex items-center gap-2">
                          <BrandLogo className="w-5 h-5" />
                          HátCùngNhau giúp bạn làm gì?
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                          <div className="flex items-start gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-[#FF8A00] shrink-0 font-bold text-sm">1</div>
                            <div>
                              <h5 className="text-xs font-black text-[#4B2E20]">Gom bài mọi dịp</h5>
                              <p className="text-[10px] text-stone-500 mt-0.5 leading-tight">Tạo setlist cho tiệc tùng, sự kiện hay buổi tập riêng.</p>
                            </div>
                          </div>
                          <div className="flex items-start gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-[#FF8A00] shrink-0 font-bold text-sm">2</div>
                            <div>
                              <h5 className="text-xs font-black text-[#4B2E20]">Sắp xếp thứ tự</h5>
                              <p className="text-[10px] text-stone-500 mt-0.5 leading-tight">Kéo thả để sắp xếp trình tự bài hát biểu diễn trơn tru.</p>
                            </div>
                          </div>
                          <div className="flex items-start gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-[#FF8A00] shrink-0 font-bold text-sm">3</div>
                            <div>
                              <h5 className="text-xs font-black text-[#4B2E20]">Mở trình chiếu</h5>
                              <p className="text-[10px] text-stone-500 mt-0.5 leading-tight">Trình chiếu lời bài hát cỡ lớn lên TV, iPad cho cả nhóm.</p>
                            </div>
                          </div>
                          <div className="flex items-start gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-[#FF8A00] shrink-0 font-bold text-sm">4</div>
                            <div>
                              <h5 className="text-xs font-black text-[#4B2E20]">Chia sẻ QR Code</h5>
                              <p className="text-[10px] text-stone-500 mt-0.5 leading-tight">Gửi danh sách bài hát một chạm qua link hoặc quét mã QR.</p>
                            </div>
                          </div>
                          <div className="flex items-start gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-[#FF8A00] shrink-0 font-bold text-sm">5</div>
                            <div>
                              <h5 className="text-xs font-black text-[#4B2E20]">Jam đồng bộ</h5>
                              <p className="text-[10px] text-stone-500 mt-0.5 leading-tight">Đồng bộ cuộn trang, đổi tông trực tuyến cùng các thành viên.</p>
                            </div>
                          </div>
                        </div>
                      </div>
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
                              <p className="text-xs text-stone-500 truncate mt-0.5">{getSongMetaText(song)}</p>
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
                          className="mt-4 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition shadow-md cursor-pointer active:scale-95 flex items-center gap-2 mx-auto min-h-[44px]"
                        >
                          <Globe className="w-4.5 h-4.5 shrink-0" /> Tìm trực tuyến cho "{searchQuery}"
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

                      <div className="flex items-center justify-between border-b border-stone-200 pb-3 flex-wrap gap-2">
                        <div>
                          <h2 className="text-xl font-bold text-stone-900 font-display">{playlist.name}</h2>
                          <p className="text-xs text-stone-500">{playlist.songIds.length} songs queued</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleStartJamSession(playlist.id)}
                            className="px-3 py-1.5 bg-green-50 hover:bg-green-100 border border-green-200 text-green-700 text-xs rounded transition flex items-center gap-1 font-bold shadow-sm cursor-pointer"
                          >
                            <Wifi className="w-3.5 h-3.5 animate-pulse text-green-600" /> Jam Session
                          </button>
                          <button
                            onClick={() => setSharePlaylistId(playlist.id)}
                            className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-600 text-xs rounded transition flex items-center gap-1 font-bold shadow-sm cursor-pointer"
                          >
                            <Upload className="w-3.5 h-3.5 text-blue-600" /> Chia sẻ
                          </button>
                          <button
                            onClick={(e) => handleDeletePlaylist(playlist.id, e)}
                            className="px-3 py-1.5 bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 text-xs rounded transition flex items-center gap-1 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-red-650" /> Delete Setlist
                          </button>
                        </div>
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
                                    <p className="text-xs text-stone-500">{getSongMetaText(song)}</p>
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
                <div className="flex flex-col gap-6 animate-fade-in">
                  <div className="border-b border-stone-200 pb-4 flex flex-col md:flex-row md:items-center justify-between gap-4 select-none">
                    <div>
                      <h2 className="text-lg font-bold text-stone-900 font-display flex items-center gap-2">
                        Setlists / Danh sách bài hát 🎵
                      </h2>
                      <p className="text-xs text-stone-500">Tạo, sắp xếp và chia sẻ bài hát cho mọi dịp hát cùng nhau.</p>
                    </div>
                    <button
                      onClick={() => {
                        const name = prompt('Nhập tên setlist mới:');
                        if (name && name.trim()) {
                          handleCreateFromTemplate(name.trim());
                        }
                      }}
                      className="px-4 py-2 bg-[#FF8A00] hover:bg-orange-600 text-white font-bold text-xs rounded-xl transition shadow-md cursor-pointer active:scale-95 shrink-0"
                    >
                      + Tạo Setlist
                    </button>
                  </div>

                  {/* Dashboard Actions Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 select-none">
                    {/* Card 1: Join Jam (Green themed) */}
                    <div className="bg-[#f5fbf7] border border-green-200 rounded-2xl p-5 flex flex-col justify-between shadow-xs text-left">
                      <div className="flex items-start gap-3.5">
                        <div className="w-10 h-10 rounded-full bg-green-150/40 border border-green-200 flex items-center justify-center text-green-700 shrink-0">
                          <Wifi className="w-5 h-5 animate-pulse text-green-650" />
                        </div>
                        <div>
                          <h4 className="text-sm font-black text-stone-900 leading-tight">Tham gia phiên hát chung</h4>
                          <p className="text-xs text-stone-500 mt-1 leading-normal">Nhập mã hoặc quét QR để theo dõi bài hát cùng nhóm.</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-4">
                        <div className="relative flex-grow">
                          <input
                            type="text"
                            placeholder="Nhập mã session (E.g. JAMX4)"
                            value={sessionInputCode}
                            onChange={(e) => setSessionInputCode(e.target.value)}
                            className="pl-3 pr-8 py-2 bg-white border border-stone-200 rounded-xl text-xs placeholder-stone-400 font-mono font-black uppercase w-full shadow-inner outline-none focus:ring-1 focus:ring-green-500/30"
                          />
                          <button
                            onClick={() => setShowQrScanner(true)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-stone-400 hover:text-green-655 rounded transition cursor-pointer"
                            title="Quét QR"
                          >
                            <Camera className="w-4 h-4" />
                          </button>
                        </div>
                        <button
                          onClick={() => handleJoinJamSession(sessionInputCode)}
                          className="px-5 py-2 bg-green-600 hover:bg-green-700 text-white font-bold text-xs rounded-xl transition shadow-md active:scale-95 cursor-pointer shrink-0"
                        >
                          Tham gia
                        </button>
                      </div>
                    </div>

                    {/* Card 2: Create Setlist (Orange themed) */}
                    <div className="bg-[#fffcf8] border border-amber-200 rounded-2xl p-5 flex flex-col justify-between shadow-xs text-left">
                      <div className="flex items-start gap-3.5">
                        <div className="w-10 h-10 rounded-full bg-amber-100/40 border border-amber-200 flex items-center justify-center text-[#FF8A00] shrink-0">
                          <FolderPlus className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="text-sm font-black text-stone-900 leading-tight">Tạo Setlist mới</h4>
                          <p className="text-xs text-stone-500 mt-1 leading-normal">Chuẩn bị danh sách bài hát cho bất kỳ dịp nào.</p>
                        </div>
                      </div>
                      <form onSubmit={handleCreatePlaylist} className="flex items-center gap-2 mt-4">
                        <input
                          type="text"
                          placeholder="Ví dụ: Tiệc Gia Đình, Đêm Acoustic, Nhạc Bolero..."
                          value={newPlaylistName}
                          onChange={(e) => setNewPlaylistName(e.target.value)}
                          className="flex-grow px-3 py-2 bg-white border border-stone-200 rounded-xl text-xs placeholder-stone-400 font-semibold shadow-inner outline-none focus:ring-1 focus:ring-[#FF8A00]/30"
                        />
                        <button
                          type="submit"
                          className="px-5 py-2 bg-[#FF8A00] hover:bg-orange-600 text-white font-bold text-xs rounded-xl transition shadow-md active:scale-95 cursor-pointer shrink-0"
                        >
                          Tạo Setlist
                        </button>
                      </form>
                    </div>
                  </div>

                  {/* Occasion Templates Row */}
                  <div className="text-left animate-fade-in select-none">
                    <h3 className="text-xs uppercase font-black tracking-widest text-stone-500 mb-3 flex items-center gap-1.5 font-sans">
                      <Sparkles className="w-4 h-4 text-[#FF8A00] fill-orange-500/10" />
                      Tạo nhanh từ mẫu / Templates
                    </h3>
                    <div className="flex gap-2.5 overflow-x-auto pb-2 no-scrollbar shrink-0">
                      {[
                        { name: 'Tiệc gia đình', icon: '👪' },
                        { name: 'Đêm Acoustic', icon: '🎸' },
                        { name: 'Karaoke', icon: '🎤' },
                        { name: 'Biểu diễn', icon: '🎪' },
                        { name: 'Nhà thờ / Worship', icon: '⛪' },
                        { name: 'Sinh nhật / Đám cưới', icon: '🎂' },
                        { name: 'Luyện tập', icon: '📖' },
                        { name: 'Tùy chỉnh', icon: '➕' }
                      ].map(tpl => (
                        <button
                          key={tpl.name}
                          onClick={() => {
                            const defaultName = tpl.name === 'Tùy chỉnh' ? 'Setlist mới' : tpl.name;
                            handleCreateFromTemplate(defaultName);
                          }}
                          className="px-4 py-3 bg-white border border-stone-200/80 rounded-xl text-xs font-bold text-stone-850 hover:border-[#FF8A00] hover:text-[#FF8A00] transition active:scale-95 shrink-0 shadow-sm cursor-pointer flex items-center gap-2"
                        >
                          <span>{tpl.icon}</span>
                          <span>{tpl.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Setlists của tôi section */}
                  <div className="text-left flex flex-col gap-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-t border-stone-200 pt-4 pb-2">
                      <h3 className="text-sm font-black text-stone-900 font-display">Setlists của tôi</h3>
                      
                      <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                        {/* Search setlists */}
                        <div className="relative flex-grow md:flex-grow-0">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                          <input
                            type="text"
                            placeholder="Tìm setlist..."
                            value={setlistSearch}
                            onChange={(e) => setSetlistSearch(e.target.value)}
                            className="pl-8 pr-3 py-1.5 bg-white border border-stone-200 rounded-xl text-xs placeholder-stone-400 font-semibold shadow-inner outline-none w-full md:w-44 focus:ring-1 focus:ring-[#FF8A00]/30"
                          />
                        </div>

                        {/* Sort setlists */}
                        <select
                          value={setlistSort}
                          onChange={(e) => setSetlistSort(e.target.value)}
                          className="px-3 py-1.5 bg-white border border-stone-200 rounded-xl text-xs font-semibold shadow-sm text-stone-700 cursor-pointer outline-none focus:ring-1 focus:ring-[#FF8A00]/30"
                        >
                          <option value="newest">Mới nhất</option>
                          <option value="name">Tên A-Z</option>
                          <option value="songsCount">Nhiều bài nhất</option>
                        </select>

                        {/* Grid/List toggle layout */}
                        <div className="flex bg-stone-100 p-0.5 border border-stone-200 rounded-xl shrink-0">
                          <button
                            onClick={() => setSetlistViewMode('grid')}
                            className={`p-1.5 rounded-lg transition-all cursor-pointer ${setlistViewMode === 'grid' ? 'bg-white text-stone-950 shadow-sm' : 'text-stone-450 hover:text-stone-850'}`}
                            title="Dạng lưới / Grid"
                          >
                            <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M4 4h4v4H4V4zm6 0h4v4h-4V4zm6 0h4v4h-4V4zM4 10h4v4H4v-4zm6 0h4v4h-4v-4zm6 0h4v4h-4v-4zM4 16h4v4H4v-4zm6 0h4v4h-4v-4zm6 0h4v4h-4v-4z"/></svg>
                          </button>
                          <button
                            onClick={() => setSetlistViewMode('list')}
                            className={`p-1.5 rounded-lg transition-all cursor-pointer ${setlistViewMode === 'list' ? 'bg-white text-stone-950 shadow-sm' : 'text-stone-450 hover:text-stone-850'}`}
                            title="Dạng danh sách / List"
                          >
                            <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h16v2H4v-2z"/></svg>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Filter chips */}
                    <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar shrink-0 select-none">
                      {[
                        { id: 'all', name: 'Tất cả' },
                        { id: 'recent', name: 'Gần đây' },
                        { id: 'favorite', name: 'Yêu thích' },
                        { id: 'shared', name: 'Đã chia sẻ' },
                        { id: 'offline', name: 'Offline' }
                      ].map(chip => (
                        <button
                          key={chip.id}
                          onClick={() => setSetlistFilter(chip.id)}
                          className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition cursor-pointer shrink-0 border ${
                            setlistFilter === chip.id
                              ? 'bg-[#FF8A00] text-white border-[#FF8A00]'
                              : 'bg-white text-stone-600 border-stone-200/80 hover:bg-stone-50'
                          }`}
                        >
                          {chip.name}
                        </button>
                      ))}
                    </div>

                    {/* Filtered Playlists listing logic */}
                    {(() => {
                      let filteredPlaylists = [...playlists];
                      if (setlistSearch.trim()) {
                        filteredPlaylists = filteredPlaylists.filter(pl => pl.name.toLowerCase().includes(setlistSearch.toLowerCase()));
                      }
                      if (setlistSort === 'name') {
                        filteredPlaylists.sort((a, b) => a.name.localeCompare(b.name));
                      } else if (setlistSort === 'songsCount') {
                        filteredPlaylists.sort((a, b) => (b.songIds?.length || 0) - (a.songIds?.length || 0));
                      } else {
                        filteredPlaylists.sort((a, b) => b.id - a.id);
                      }

                      if (filteredPlaylists.length === 0) {
                        return (
                          <div className="text-center py-16 bg-white border border-stone-200 border-dashed rounded-2xl select-none px-6">
                            <ListMusic className="w-10 h-10 text-stone-300 mx-auto mb-3" />
                            <h4 className="text-sm font-bold text-stone-850">Chưa có Setlist nào</h4>
                            <p className="text-xs text-stone-500 mt-2 max-w-sm mx-auto leading-relaxed">
                              Tạo setlist đầu tiên để chuẩn bị bài hát cho tiệc gia đình, đêm acoustic, karaoke, worship hoặc buổi luyện tập.
                            </p>
                            <div className="flex justify-center gap-2 mt-4">
                              <button
                                onClick={() => {
                                  const name = prompt('Nhập tên setlist mới:');
                                  if (name && name.trim()) handleCreateFromTemplate(name.trim());
                                }}
                                className="px-4 py-2 bg-[#FF8A00] hover:bg-orange-600 text-white font-bold text-xs rounded-xl transition shadow-md active:scale-95 cursor-pointer"
                              >
                                + Tạo Setlist
                              </button>
                            </div>
                          </div>
                        );
                      }

                      if (setlistViewMode === 'grid') {
                        return (
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 select-none">
                            {filteredPlaylists.map((pl, idx) => {
                              const gradients = [
                                'from-orange-400 to-amber-500',
                                'from-rose-400 to-orange-500',
                                'from-indigo-400 to-purple-500',
                                'from-emerald-400 to-teal-500'
                              ];
                              const grad = gradients[idx % gradients.length];
                              const duration = (pl.songIds?.length || 0) * 4;
                              
                              return (
                                <div
                                  key={pl.id}
                                  onClick={() => setSelectedPlaylistId(pl.id)}
                                  className="bg-white border border-stone-200/80 hover:border-orange-500/25 rounded-2xl overflow-hidden shadow-sm hover:shadow-lg transition-all duration-300 flex flex-col group text-left cursor-pointer relative"
                                >
                                  <div className={`h-16 bg-gradient-to-r ${grad} relative flex items-end p-3 text-white`}>
                                    <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleStartJamSession(pl.id);
                                        }}
                                        className="p-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-white transition backdrop-blur-xs active:scale-90 cursor-pointer"
                                        title="Bắt đầu Jam Session"
                                      >
                                        <Wifi className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setSharePlaylistId(pl.id);
                                        }}
                                        className="p-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-white transition backdrop-blur-xs active:scale-90 cursor-pointer"
                                        title="Chia sẻ setlist"
                                      >
                                        <Upload className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (confirm('Bạn có chắc chắn muốn xóa setlist này?')) {
                                            handleDeletePlaylist(pl.id, e);
                                          }
                                        }}
                                        className="p-1.5 bg-white/20 hover:bg-red-650/40 rounded-lg text-white transition backdrop-blur-xs active:scale-90 cursor-pointer"
                                        title="Xóa setlist"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </div>

                                  <div className="p-4 flex-grow flex flex-col justify-between">
                                    <div>
                                      <h4 className="font-bold text-sm text-stone-900 group-hover:text-[#FF8A00] transition-colors truncate">{pl.name}</h4>
                                      <p className="text-[11px] text-stone-500 mt-1">{pl.songIds?.length || 0} bài hát &middot; ~{duration} phút</p>
                                      <div className="flex gap-1.5 mt-2 flex-wrap">
                                        <span className="text-[9px] font-black uppercase text-stone-500 bg-stone-100 px-2 py-0.5 rounded-full">Setlist</span>
                                        <span className="text-[9px] font-black uppercase text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">Acoustic</span>
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-2 mt-4 pt-3 border-t border-stone-100">
                                      <button
                                        onClick={() => setSelectedPlaylistId(pl.id)}
                                        className="w-1/2 py-2 bg-stone-100 hover:bg-stone-200 text-stone-850 text-[11px] font-bold rounded-xl transition cursor-pointer text-center"
                                      >
                                        Mở
                                      </button>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleStartJamSession(pl.id);
                                        }}
                                        className="w-1/2 py-2 bg-green-600 hover:bg-green-755 text-white text-[11px] font-bold rounded-xl transition cursor-pointer text-center shadow-xs"
                                      >
                                        Bắt đầu Jam
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      }

                      return (
                        <div className="flex flex-col gap-2 select-none">
                          {filteredPlaylists.map((pl, idx) => (
                            <div
                              key={pl.id}
                              onClick={() => setSelectedPlaylistId(pl.id)}
                              className="bg-white hover:bg-stone-50/50 border border-stone-200/80 rounded-xl p-4 flex items-center justify-between cursor-pointer transition shadow-sm hover:shadow group text-left"
                            >
                              <div className="flex items-center gap-4 min-w-0 flex-grow">
                                <div className="w-1.5 h-10 bg-[#FF8A00] rounded-full shrink-0"></div>
                                <div className="min-w-0 pr-4">
                                  <h4 className="font-bold text-sm text-stone-900 group-hover:text-[#FF8A00] transition-colors truncate">{pl.name}</h4>
                                  <p className="text-[11px] text-stone-500 mt-0.5">{pl.songIds?.length || 0} bài hát &middot; Chỉnh sửa: Hôm nay</p>
                                </div>
                              </div>
                              
                              <div className="flex items-center gap-2 shrink-0">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleStartJamSession(pl.id);
                                  }}
                                  className="px-3 py-1.5 bg-green-50 hover:bg-green-100 text-green-700 text-[11px] font-bold rounded-xl transition flex items-center gap-1 border border-green-200 cursor-pointer"
                                >
                                  <Wifi className="w-3.5 h-3.5" />
                                  Jam
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (confirm('Bạn có chắc chắn muốn xóa setlist này?')) {
                                      handleDeletePlaylist(pl.id, e);
                                    }
                                  }}
                                  className="p-2 bg-stone-100 hover:bg-red-50 text-stone-500 hover:text-red-650 rounded-xl transition cursor-pointer"
                                  title="Xóa setlist"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })()}

                    {/* Setlist help panel helper */}
                    <div className="bg-[#FFF6E9] border border-[#F1E4D2] rounded-2xl p-5 select-none text-left animate-fade-in mt-4">
                      <h4 className="text-xs uppercase font-black tracking-widest text-[#4B2E20] mb-3 flex items-center gap-2">
                        <BrandLogo className="w-4.5 h-4.5" />
                        Setlist giúp bạn làm gì?
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
                        <div className="flex items-start gap-2">
                          <span className="text-[#FF8A00] font-black text-xs mt-0.5">&middot;</span>
                          <p className="text-[10px] text-stone-500 leading-tight">Gom bài cho mọi dịp hát</p>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="text-[#FF8A00] font-black text-xs mt-0.5">&middot;</span>
                          <p className="text-[10px] text-stone-500 leading-tight">Sắp xếp thứ tự danh sách bài</p>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="text-[#FF8A00] font-black text-xs mt-0.5">&middot;</span>
                          <p className="text-[10px] text-stone-500 leading-tight">Mở trình chiếu màn hình lớn</p>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="text-[#FF8A00] font-black text-xs mt-0.5">&middot;</span>
                          <p className="text-[10px] text-stone-500 leading-tight">Chia sẻ với bạn bè bằng link/QR</p>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="text-[#FF8A00] font-black text-xs mt-0.5">&middot;</span>
                          <p className="text-[10px] text-stone-500 leading-tight">Dùng trực tiếp trong Jam Session</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}



          {/* TAB 4: PLAY HISTORY */}
          {activeTab === 'history' && (
            <div className="animate-fade-in flex flex-col gap-6 max-w-6xl mx-auto w-full">
              <div className="border-b border-stone-200 pb-4">
                <h2 className="text-lg font-bold text-stone-900 font-display flex items-center gap-2">
                  <ListMusic className="w-5 h-5 text-red-700" />
                  Lịch sử chơi nhạc / Play History
                </h2>
                <p className="text-xs text-stone-500">Các bài hát bạn đã chơi gần đây, được sắp xếp theo số lần chơi.</p>
              </div>

              {playHistory.length === 0 ? (
                <div className="text-center py-20 bg-white border border-stone-200/80 rounded-xl shadow-sm select-none animate-fade-in">
                  <div className="flex justify-center w-full mb-4">
                    <div className="w-16 h-16 bg-red-700/5 border border-red-700/10 rounded-full flex items-center justify-center">
                      <BrandLogo className="w-10 h-10" />
                    </div>
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
                            <p className="text-xs text-stone-500 truncate">{getSongMetaText(song)}</p>
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

          {/* TAB 5: ADMIN STATS */}
          {activeTab === 'admin-stats' && currentUser?.role === 'admin' && (
            <AdminStatsView API_BASE={API_BASE} />
          )}
            </>
          )}
        </main>
      </div>

      {/* Bottom controls toolbar (replaces mobile bottom nav) */}
      {activeSongId !== null && displaySong && window.innerWidth >= 768 && (
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
                          <span className="text-[10px] uppercase font-extrabold tracking-widest text-stone-400">Quick Key Selection - v1.8.0</span>
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

                        {/* Key Detection Panel */}
                        <div className="mb-4 p-3 bg-stone-50 border border-stone-200/60 rounded-xl flex flex-col items-center justify-center">
                          {detectionState === 'idle' && (
                            <button
                              onClick={(e) => { e.stopPropagation(); startKeyDetection(); }}
                              className="w-full flex items-center justify-center gap-2 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl transition-all active:scale-[0.98] font-bold text-sm shadow-sm cursor-pointer border border-orange-550"
                            >
                              <Mic className="w-4.5 h-4.5" />
                              <span>Key Detection (Hum to Dò Tông)</span>
                            </button>
                          )}

                          {detectionState === 'processing' && (
                            <div className="w-full flex flex-col items-center justify-center py-3">
                              <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mb-2"></div>
                              <span className="text-xs font-bold text-stone-755">Đang phân tích giọng hát...</span>
                              <span className="text-[10px] text-stone-400 mt-0.5">Vui lòng đợi trong giây lát</span>
                            </div>
                          )}

                          {detectionState === 'listening' && (
                            <div className="w-full flex flex-col items-center justify-center py-1.5 animate-pulse">
                              <Mic className="w-5 h-5 text-red-500 mb-1.5 animate-bounce" />
                              <span className="text-xs font-bold text-stone-755">Đang lắng nghe giọng hát... {detectionCountdown}s</span>
                              <span className="text-[10px] text-stone-400 mt-0.5">Hãy ngân nga hoặc hát một đoạn nhạc thật to</span>
                            </div>
                          )}

                          {detectionState === 'done' && (
                            <div className="w-full flex flex-col items-center gap-2.5">
                              <div className="text-center">
                                <span className="text-[10px] uppercase font-black tracking-widest text-stone-400 block mb-0.5">Tông phát hiện</span>
                                <span className="font-mono text-xl font-black text-orange-600">
                                  {detectedKey}
                                </span>
                                <span className="text-[10px] text-stone-400 block mt-0.5">Độ khớp: {detectedConfidence}%</span>
                              </div>
                              <div className="flex gap-2 w-full">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const cleanSongKey = displaySong.key.replace('m', '').replace(' ', '');
                                    const originalVal = NOTE_TO_SEMITONE[cleanSongKey] || 0;
                                    const targetVal = NOTE_TO_SEMITONE[detectedKey.replace('m', '')] || 0;
                                    let diff = targetVal - originalVal;
                                    if (diff > 6) diff -= 12;
                                    if (diff < -5) diff += 12;
                                    setTransposeOffset(diff);
                                    
                                    setTimeout(() => {
                                      setShowKeySelector(false);
                                      setDetectionState('idle');
                                    }, 50);
                                  }}
                                  className="flex-grow py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-bold transition-all active:scale-95 border border-green-750 shadow-sm"
                                >
                                  Áp dụng tông
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); startKeyDetection(); }}
                                  className="px-3 py-2 bg-stone-200 hover:bg-stone-300 text-stone-700 rounded-lg text-xs font-bold transition-all active:scale-95"
                                >
                                  Thử lại
                                </button>
                              </div>
                            </div>
                          )}

                          {detectionState === 'error' && (
                            <div className="w-full flex flex-col items-center gap-2 py-1">
                              <span className="text-xs text-red-500 font-semibold text-center">{detectionErrorMsg || 'Không nghe rõ, hãy hát to hơn hoặc kiểm tra Micro!'}</span>
                              <button
                                onClick={(e) => { e.stopPropagation(); startKeyDetection(); }}
                                className="w-full py-2 bg-stone-900 hover:bg-stone-850 text-white rounded-lg text-xs font-bold transition-all active:scale-95"
                              >
                                Thử lại / Try Again
                              </button>
                            </div>
                          )}
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

      {showVersionTracker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-sm p-4 animate-fade-in" onClick={() => setShowVersionTracker(false)}>
          <div className="bg-white border border-stone-200 rounded-2xl max-w-lg w-full max-h-[80vh] overflow-y-auto shadow-2xl p-6 relative select-none flex flex-col no-scrollbar" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setShowVersionTracker(false)}
              className="absolute right-4 top-4 p-1 hover:bg-stone-100 rounded-full text-stone-400 hover:text-stone-700 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            
            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-stone-100">
              <div className="w-10 h-10 bg-amber-50 border border-amber-255/60 rounded-full flex items-center justify-center text-amber-600">
                <Info className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-stone-900 leading-none">Nhật ký phiên bản</h3>
                <p className="text-[10px] text-stone-400 uppercase font-black tracking-widest mt-1">Version History & Changelog</p>
              </div>
            </div>

            <div className="flex flex-col gap-6 overflow-y-auto pr-1 no-scrollbar">
              {/* v1.8.0 */}
              <div className="flex gap-4">
                <div className="flex flex-col items-center">
                  <span className="text-xs font-black px-2.5 py-0.5 rounded-full bg-red-50 border border-red-200 text-red-700 tracking-wider font-mono">v1.8.0</span>
                  <div className="w-[1.5px] bg-stone-200 flex-grow mt-2"></div>
                </div>
                <div className="flex-grow pb-2">
                  <span className="text-[10px] font-black uppercase text-stone-400 tracking-widest">Hiện tại / Current</span>
                  <p className="text-xs font-bold text-stone-800 mt-1">Giao diện Trang chủ & Setlists mới</p>
                  <ul className="list-disc list-inside text-[11px] text-stone-600 mt-2 space-y-1 pl-1">
                    <li>Trang chủ mới: Thêm 4 thẻ Thao tác nhanh, thanh cuộn Khám phá thể loại và Xếp hạng Bài hát thịnh hành.</li>
                    <li>Nâng cấp Setlists: Bố cục 2 cột, bảng Tạo nhanh từ mẫu (Templates), bộ lọc Tìm kiếm, Sắp xếp và tùy chọn Xem Lưới/Danh sách.</li>
                    <li>Định vị thương hiệu HátCùngNhau cho mọi dịp ca hát (Tiệc gia đình, Acoustic, Worship, Karaoke, Biểu diễn...).</li>
                  </ul>
                </div>
              </div>

              {/* v1.7.3 */}
              <div className="flex gap-4">
                <div className="flex flex-col items-center">
                  <span className="text-xs font-black px-2.5 py-0.5 rounded-full bg-stone-100 border border-stone-200 text-stone-755 tracking-wider font-mono">v1.7.3</span>
                  <div className="w-[1.5px] bg-stone-200 flex-grow mt-2"></div>
                </div>
                <div className="flex-grow pb-2">
                  <span className="text-[10px] font-black uppercase text-stone-400 tracking-widest">12/06/2026 (Tối)</span>
                  <p className="text-xs font-bold text-stone-800 mt-1">Đồng bộ Đóng Jam, Gửi Email Báo cáo & Trở về Trang chủ</p>
                  <ul className="list-disc list-inside text-[11px] text-stone-600 mt-2 space-y-1 pl-1">
                    <li>Đóng kết nối và thông báo cho toàn bộ Follower ngay khi Host kết thúc Jam Session.</li>
                    <li>Mô phỏng gửi email báo cáo tổng kết Jam tới Host và toàn bộ danh sách thành viên tham gia.</li>
                    <li>Click vào Logo HátCùngNhau ở Header để trở về trang chủ và đóng trình xem hợp âm.</li>
                  </ul>
                </div>
              </div>

              {/* v1.7.2 */}
              <div className="flex gap-4">
                <div className="flex flex-col items-center">
                  <span className="text-xs font-black px-2.5 py-0.5 rounded-full bg-stone-100 border border-stone-200 text-stone-755 tracking-wider font-mono">v1.7.2</span>
                  <div className="w-[1.5px] bg-stone-200 flex-grow mt-2"></div>
                </div>
                <div className="flex-grow pb-2">
                  <span className="text-[10px] font-black uppercase text-stone-400 tracking-widest">12/06/2026 (Chiều)</span>
                  <p className="text-xs font-bold text-stone-800 mt-1">In-App QR Scanner & Khắc phục tự động tham gia</p>
                  <ul className="list-disc list-inside text-[11px] text-stone-600 mt-2 space-y-1 pl-1">
                    <li>Tích hợp Camera quét mã QR trực tiếp trong ứng dụng mà không cần rời sang Safari.</li>
                    <li>Tự động đăng ký và kết nối với server ngay khi quét mã tham gia Jam hoặc Playlist.</li>
                  </ul>
                </div>
              </div>

              {/* v1.7.1 */}
              <div className="flex gap-4">
                <div className="flex flex-col items-center">
                  <span className="text-xs font-black px-2.5 py-0.5 rounded-full bg-stone-100 border border-stone-200 text-stone-755 tracking-wider font-mono">v1.7.1</span>
                  <div className="w-[1.5px] bg-stone-200 flex-grow mt-2"></div>
                </div>
                <div className="flex-grow pb-2">
                  <span className="text-[10px] font-black uppercase text-stone-400 tracking-widest">12/06/2026 (Trưa)</span>
                  <p className="text-xs font-bold text-stone-800 mt-1">Sửa lỗi giao diện trắng (White Screen Fix)</p>
                  <ul className="list-disc list-inside text-[11px] text-stone-600 mt-2 space-y-1 pl-1">
                    <li>Sửa lỗi thiếu biểu tượng Chevron trong import khiến ứng dụng crash khi mở bài hát từ playlist.</li>
                  </ul>
                </div>
              </div>

              {/* v1.7.0 */}
              <div className="flex gap-4">
                <div className="flex flex-col items-center">
                  <span className="text-xs font-black px-2.5 py-0.5 rounded-full bg-stone-100 border border-stone-200 text-stone-755 tracking-wider font-mono">v1.7.0</span>
                  <div className="w-[1.5px] bg-stone-200 flex-grow mt-2"></div>
                </div>
                <div className="flex-grow pb-2">
                  <span className="text-[10px] font-black uppercase text-stone-400 tracking-widest">12/06/2026 (Chiều)</span>
                  <p className="text-xs font-bold text-stone-800 mt-1">Playlist Autoplay, Chia sẻ QR & Collaborative Session</p>
                  <ul className="list-disc list-inside text-[11px] text-stone-600 mt-2 space-y-1 pl-1">
                    <li>Tự động chuyển bài kế tiếp (Autoplay) với bảng đếm ngược 3 giây sinh động.</li>
                    <li>Chia sẻ playlist tiện lợi qua QR Code và liên kết nhập playlist một chạm.</li>
                    <li>Chế độ Jam Session trực tuyến: theo dõi danh sách thành viên tham gia, đồng bộ hóa bài hát/tông giọng từ Host theo thời gian thực và ghi lại báo cáo tổng kết Jam kèm đánh giá bình luận.</li>
                  </ul>
                </div>
              </div>

              {/* v1.6.0 */}
              <div className="flex gap-4">
                <div className="flex flex-col items-center">
                  <span className="text-xs font-black px-2.5 py-0.5 rounded-full bg-stone-100 border border-stone-200 text-stone-755 tracking-wider font-mono">v1.6.0</span>
                  <div className="w-[1.5px] bg-stone-200 flex-grow mt-2"></div>
                </div>
                <div className="flex-grow pb-2">
                  <span className="text-[10px] font-black uppercase text-stone-400 tracking-widest">12/06/2026 (Sáng)</span>
                  <p className="text-xs font-bold text-stone-800 mt-1">Tối ưu hóa Tone Detector & App Version Tracker</p>
                  <ul className="list-disc list-inside text-[11px] text-stone-600 mt-2 space-y-1 pl-1">
                    <li>Rút ngắn thời gian ghi âm Tone Detector từ 20 giây xuống còn 10 giây.</li>
                    <li>Loại bỏ công cụ nghe lại (Playback player) giúp giao diện sạch và tập trung hơn.</li>
                    <li>Tích hợp bảng theo dõi lịch sử cập nhật phiên bản (Version Tracker) trong Menu.</li>
                  </ul>
                </div>
              </div>

              {/* v1.5.0 */}
              <div className="flex gap-4">
                <div className="flex flex-col items-center">
                  <span className="text-xs font-black px-2.5 py-0.5 rounded-full bg-stone-100 border border-stone-200 text-stone-755 tracking-wider font-mono">v1.5.0</span>
                  <div className="w-[1.5px] bg-stone-200 flex-grow mt-2"></div>
                </div>
                <div className="flex-grow pb-2">
                  <span className="text-[10px] font-black uppercase text-stone-400 tracking-widest">12/06/2026</span>
                  <p className="text-xs font-bold text-stone-800 mt-1">Cải tiến bộ lọc và thuật toán nhận diện Tone</p>
                  <ul className="list-disc list-inside text-[11px] text-stone-600 mt-2 space-y-1 pl-1">
                    <li>Thêm bộ lọc độ ổn định cao độ (Pitch Stability Filter) thời gian ~70ms để loại bỏ tạp âm và tiếng thở.</li>
                    <li>Áp dụng thuật toán Hybrid Key Scoring kết hợp tương quan Pearson với tính điểm bậc âm (Scale Degree Fit) để tối ưu nhận diện giọng hát mộc / ngân nga.</li>
                  </ul>
                </div>
              </div>

              {/* v1.4.0 */}
              <div className="flex gap-4">
                <div className="flex flex-col items-center">
                  <span className="text-xs font-black px-2.5 py-0.5 rounded-full bg-stone-100 border border-stone-200 text-stone-755 tracking-wider font-mono">v1.4.0</span>
                  <div className="w-[1.5px] bg-stone-200 flex-grow mt-2"></div>
                </div>
                <div className="flex-grow pb-2">
                  <span className="text-[10px] font-black uppercase text-stone-400 tracking-widest">11/06/2026</span>
                  <p className="text-xs font-bold text-stone-800 mt-1">Thu âm offline & Xử lý client-side PCM</p>
                  <ul className="list-disc list-inside text-[11px] text-stone-600 mt-2 space-y-1 pl-1">
                    <li>Chuyển sang ghi âm trước rồi giải mã ngoại tuyến (offline audio decoding) để tránh giật lag CPU trên trình duyệt.</li>
                  </ul>
                </div>
              </div>

              {/* v1.3.0 */}
              <div className="flex gap-4">
                <div className="flex flex-col items-center">
                  <span className="text-xs font-black px-2.5 py-0.5 rounded-full bg-stone-100 border border-stone-200 text-stone-755 tracking-wider font-mono">v1.3.0</span>
                  <div className="w-[1.5px] bg-stone-200 flex-grow mt-2"></div>
                </div>
                <div className="flex-grow pb-2">
                  <span className="text-[10px] font-black uppercase text-stone-400 tracking-widest">10/06/2026</span>
                  <p className="text-xs font-bold text-stone-800 mt-1">Chế độ thu gọn & Tự động khớp màn hình</p>
                  <ul className="list-disc list-inside text-[11px] text-stone-600 mt-2 space-y-1 pl-1">
                    <li>Thêm chế độ xem hợp âm rút gọn (chỉ hiển thị hợp âm và từ gợi ý).</li>
                    <li>Thuật toán tự động co giãn font chữ (fit-to-screen) giúp hiển thị toàn bộ bài hát trên một màn hình điện thoại.</li>
                  </ul>
                </div>
              </div>

              {/* v1.2.0 */}
              <div className="flex gap-4">
                <div className="flex flex-col items-center">
                  <span className="text-xs font-black px-2.5 py-0.5 rounded-full bg-stone-100 border border-stone-200 text-stone-755 tracking-wider font-mono">v1.2.0</span>
                  <div className="w-[1.5px] bg-stone-200 flex-grow mt-2"></div>
                </div>
                <div className="flex-grow pb-2">
                  <span className="text-[10px] font-black uppercase text-stone-400 tracking-widest">08/06/2026</span>
                  <p className="text-xs font-bold text-stone-800 mt-1">Cải tiến Tuner UI chuyên nghiệp</p>
                  <ul className="list-disc list-inside text-[11px] text-stone-600 mt-2 space-y-1 pl-1">
                    <li>Thiết kế lại bảng pegboard dạng lưới và mô phỏng cần đàn (fretboard) cho Guitar/Ukulele.</li>
                  </ul>
                </div>
              </div>

              {/* v1.1.0 */}
              <div className="flex gap-4">
                <div className="flex flex-col items-center">
                  <span className="text-xs font-black px-2.5 py-0.5 rounded-full bg-stone-100 border border-stone-200 text-stone-755 tracking-wider font-mono">v1.1.0</span>
                  <div className="w-[1.5px] bg-stone-200 flex-grow mt-2"></div>
                </div>
                <div className="flex-grow pb-2">
                  <span className="text-[10px] font-black uppercase text-stone-400 tracking-widest">04/06/2026</span>
                  <p className="text-xs font-bold text-stone-800 mt-1">Hộp hợp âm & Lưu bài hát yêu thích</p>
                  <ul className="list-disc list-inside text-[11px] text-stone-600 mt-2 space-y-1 pl-1">
                    <li>Hỗ trợ hiển thị sơ đồ thế bấm khi rê chuột vào tên hợp âm.</li>
                    <li>Cho phép lưu danh sách yêu thích và đồng bộ hóa cài đặt tông giọng cho từng bài.</li>
                  </ul>
                </div>
              </div>

              {/* v1.0.0 */}
              <div className="flex gap-4 font-black">
                <div className="flex flex-col items-center">
                  <span className="text-xs font-black px-2.5 py-0.5 rounded-full bg-stone-100 border border-stone-200 text-stone-755 tracking-wider font-mono">v1.0.0</span>
                </div>
                <div className="flex-grow">
                  <span className="text-[10px] font-black uppercase text-stone-400 tracking-widest">03/06/2026</span>
                  <p className="text-xs font-bold text-stone-800 mt-1">Phiên bản đầu tiên</p>
                  <p className="text-[11px] text-stone-600 mt-1">Khởi chạy ứng dụng đọc hợp âm Campfire Chords.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {importingPlaylist && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-sm p-4 animate-fade-in" onClick={() => setImportingPlaylist(null)}>
          <div className="bg-white border border-stone-200 rounded-2xl max-w-sm w-full shadow-2xl p-6 relative select-none" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setImportingPlaylist(null)}
              className="absolute right-4 top-4 p-1 hover:bg-stone-100 rounded-full text-stone-400 hover:text-stone-700 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            
            <div className="flex items-center gap-3 mb-4 pb-3 border-b border-stone-100">
              <div className="w-10 h-10 bg-blue-50 border border-blue-200 rounded-full flex items-center justify-center text-blue-600">
                <Upload className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-stone-900 leading-none">Nhập Playlist</h3>
                <p className="text-[10px] text-stone-400 uppercase font-black tracking-widest mt-1">Import Shared Playlist</p>
              </div>
            </div>

            <div className="bg-stone-50 border border-stone-200/85 rounded-xl p-4 my-4 font-sans text-xs">
              <div className="flex justify-between">
                <span className="text-stone-500 font-medium">Tên Playlist:</span>
                <span className="font-bold text-stone-850">{importingPlaylist.name}</span>
              </div>
              <div className="flex justify-between mt-2">
                <span className="text-stone-500 font-medium">Số lượng bài hát:</span>
                <span className="font-bold text-stone-850">{importingPlaylist.songIds?.length || 0} bài</span>
              </div>
            </div>

            <p className="text-[11px] text-stone-500 text-center leading-relaxed mb-4">
              Lưu playlist này vào thư viện Setlists của bạn để chơi nhạc dễ dàng hơn cùng bạn bè.
            </p>

            <div className="flex gap-2">
              <button
                onClick={() => setImportingPlaylist(null)}
                className="w-1/2 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-bold rounded-xl transition cursor-pointer"
              >
                Hủy / Cancel
              </button>
              <button
                onClick={handleConfirmImport}
                className="w-1/2 py-2 bg-blue-600 hover:bg-blue-750 text-white text-xs font-bold rounded-xl transition shadow-md cursor-pointer"
              >
                Nhập / Import
              </button>
            </div>
          </div>
        </div>
      )}

      {sharePlaylistId && (
        (() => {
          const isSessionShare = sharePlaylistId === 'session';
          const playlist = isSessionShare ? null : playlists.find(p => p.id === sharePlaylistId);
          
          let shareUrl = '';
          let title = '';
          let subtitle = '';

          if (isSessionShare) {
            shareUrl = `${window.location.origin}?joinSession=${sessionCode}`;
            title = 'Jam Session: ' + sessionCode;
            subtitle = 'Quét mã QR để tham gia phiên hát trực tiếp cùng host';
          } else if (playlist) {
            shareUrl = `${window.location.origin}?importPlaylist=${playlist.id}`;
            title = 'Chia sẻ Playlist';
            subtitle = `Quét mã QR để nhập danh sách "${playlist.name}"`;
          } else {
            return null;
          }

          const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(shareUrl)}`;

          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-sm p-4 animate-fade-in" onClick={() => setSharePlaylistId(null)}>
              <div className="bg-white border border-stone-200 rounded-2xl max-w-sm w-full shadow-2xl p-6 relative select-none flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => setSharePlaylistId(null)}
                  className="absolute right-4 top-4 p-1 hover:bg-stone-100 rounded-full text-stone-400 hover:text-stone-700 transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
                
                <div className="flex flex-col items-center mb-4 text-center">
                  <h3 className="text-base font-black text-stone-900 leading-none">{title}</h3>
                  <p className="text-[10px] text-stone-500 mt-2 font-medium max-w-xs">{subtitle}</p>
                </div>

                <div className="bg-stone-50 border border-stone-200/80 rounded-xl p-3 mb-4 shadow-inner flex items-center justify-center">
                  <img src={qrUrl} alt="QR Code Link" className="w-[180px] h-[180px]" />
                </div>

                <div className="w-full flex flex-col gap-2">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(shareUrl);
                      alert('Đã sao chép liên kết vào bộ nhớ tạm!');
                    }}
                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-755 text-white font-bold text-xs rounded-xl transition shadow-md flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 animate-pulse"
                  >
                    Sao chép liên kết / Copy Link
                  </button>
                  <button
                    onClick={() => setSharePlaylistId(null)}
                    className="w-full py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs rounded-xl transition cursor-pointer"
                  >
                    Đóng / Close
                  </button>
                </div>
              </div>
            </div>
          );
        })()
      )}

      {sessionReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-sm p-4 animate-fade-in" onClick={() => setSessionReport(null)}>
          <div className="bg-white border border-stone-200 rounded-2xl max-w-md w-full shadow-2xl p-6 relative select-none flex flex-col no-scrollbar max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setSessionReport(null)}
              className="absolute right-4 top-4 p-1 hover:bg-stone-100 rounded-full text-stone-400 hover:text-stone-700 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            
            <div className="flex items-center gap-3 mb-4 pb-3 border-b border-stone-100">
              <div className="w-10 h-10 bg-green-50 border border-green-200 rounded-full flex items-center justify-center text-green-600">
                <BarChart3 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-stone-900 leading-none">Báo cáo Session</h3>
                <p className="text-[10px] text-stone-400 uppercase font-black tracking-widest mt-1">Jam Session Report</p>
              </div>
            </div>

            <div className="bg-stone-50 border border-stone-200/80 rounded-xl p-4 my-2 flex flex-col gap-2 font-sans text-xs text-left">
              <div className="flex justify-between">
                <span className="text-stone-500 font-medium">Mã Session:</span>
                <span className="font-bold text-stone-850 font-mono">{sessionReport.sessionId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500 font-medium">Host:</span>
                <span className="font-bold text-stone-850">{sessionReport.hostName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500 font-medium">Thời lượng:</span>
                <span className="font-bold text-stone-850">{Math.floor(sessionReport.durationSeconds / 60)} phút {sessionReport.durationSeconds % 60} giây</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500 font-medium">Người tham gia:</span>
                <span className="font-bold text-stone-850">{sessionReport.followers.length} thành viên</span>
              </div>
            </div>

            {sessionReport.followers.length > 0 && (
              <div className="my-2 text-left">
                <span className="text-[10px] uppercase font-black tracking-widest text-stone-400">Danh sách thành viên:</span>
                <div className="max-h-20 overflow-y-auto mt-1 border border-stone-100 rounded-lg p-2 bg-white text-[11px] font-bold text-stone-700 flex flex-col gap-1">
                  {sessionReport.followers.map((f, i) => (
                    <div key={i} className="flex justify-between items-center">
                      <span>{f.email}</span>
                      <span className="text-[9px] text-stone-400">Đã tham gia</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="my-2 text-left">
              <span className="text-[10px] uppercase font-black tracking-widest text-stone-400">Danh sách bài đã chơi:</span>
              <div className="max-h-28 overflow-y-auto mt-1 border border-stone-100 rounded-lg p-2 bg-white text-[11px] font-bold text-stone-750 flex flex-col gap-1">
                {sessionReport.songsHistory.length === 0 ? (
                  <span className="text-stone-400 italic font-medium">Chưa chơi bài hát nào</span>
                ) : (
                  sessionReport.songsHistory.map((songId, i) => {
                    const song = songs.find(s => s.id === songId);
                    return (
                      <div key={i} className="flex items-center gap-1.5 py-0.5 border-b border-stone-55 last:border-0">
                        <span className="text-stone-400 font-mono">{i + 1}.</span>
                        <span className="truncate">{song ? song.title : 'Bài hát trực tuyến'}</span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Comment Section */}
            <div className="my-2 text-left flex flex-col gap-1.5">
              <label className="text-[10px] uppercase font-black tracking-widest text-stone-400">Ghi chú & Đánh giá (Jam Comment):</label>
              <textarea
                rows={3}
                placeholder="Nhập ghi chú cho đêm nhạc, ví dụ: Đêm nhạc Acoustic cực vui, mọi người hát rất hay..."
                value={sessionComment}
                onChange={(e) => setSessionComment(e.target.value)}
                className="w-full border border-stone-200 p-2.5 rounded-xl text-xs bg-white text-stone-800 placeholder-stone-400 shadow-inner outline-none focus:ring-1 focus:ring-green-500/25"
              />
            </div>

            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setSessionReport(null)}
                className="w-1/2 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs rounded-xl transition cursor-pointer"
              >
                Đóng / Close
              </button>
              <button
                onClick={() => {
                  const recipientEmails = [sessionReport.hostName, ...sessionReport.followers.map(f => f.email)];
                  const emailListStr = recipientEmails.join('\n- ');
                  alert(`Hệ thống đã gửi email báo cáo tổng kết Jam Session tới:\n- ${emailListStr}\n\nNội dung báo cáo & bình luận gửi đi thành công!`);
                  setSessionReport(null);
                }}
                className="w-1/2 py-2.5 bg-green-600 hover:bg-green-700 text-white font-bold text-xs rounded-xl transition shadow-md cursor-pointer active:scale-95"
              >
                Gửi báo cáo / Submit
              </button>
            </div>
          </div>
        </div>
      )}

      {showQrScanner && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-stone-900/90 backdrop-blur-md p-4 animate-fade-in text-white select-none">
          <style>{`
            @keyframes scan {
              0% { top: 0%; }
              50% { top: 100%; }
              100% { top: 0%; }
            }
            .animate-scanner-line {
              position: absolute;
              animation: scan 2s linear infinite;
            }
          `}</style>
          <button
            onClick={() => setShowQrScanner(false)}
            className="absolute right-6 top-6 p-2 bg-stone-800 hover:bg-stone-750 rounded-full border border-stone-700 text-stone-300 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="text-center mb-6">
            <h3 className="text-base font-black tracking-wide">Quét mã QR</h3>
            <p className="text-xs text-stone-400 mt-1.5 max-w-xs font-medium">Đặt mã QR của Jam Session hoặc Playlist vào khung quét để tự động tham gia hoặc nhập danh sách.</p>
          </div>

          <div className="relative w-[260px] h-[260px] border-2 border-stone-700 rounded-3xl overflow-hidden bg-black/45 shadow-2xl flex items-center justify-center">
            <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-green-500 rounded-tl-xl animate-pulse"></div>
            <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-green-500 rounded-tr-xl animate-pulse"></div>
            <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-green-500 rounded-bl-xl animate-pulse"></div>
            <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-green-500 rounded-br-xl animate-pulse"></div>
            <div className="absolute left-0 right-0 h-0.5 bg-green-400 opacity-60 shadow-[0_0_10px_rgba(34,197,94,0.8)] top-4 animate-scanner-line pointer-events-none"></div>
            <div id="qr-reader-target" className="w-full h-full object-cover"></div>
          </div>

          <button
            onClick={() => setShowQrScanner(false)}
            className="mt-8 px-6 py-2.5 bg-stone-800 border border-stone-700 hover:bg-stone-750 text-stone-300 font-bold text-xs rounded-xl transition cursor-pointer active:scale-95"
          >
            Hủy bỏ / Cancel
          </button>
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
