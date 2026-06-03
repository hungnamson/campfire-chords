import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SONGS_FILE = path.join(__dirname, 'songs.json');
const PLAYLISTS_FILE = path.join(__dirname, 'playlists.json');

// Helper to generate a URL-friendly slug
export function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .normalize('NFD') // Separate accents
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[đĐ]/g, 'd')
    .replace(/[^a-z0-9 -]/g, '') // Remove invalid chars
    .replace(/\s+/g, '-') // Replace spaces with -
    .replace(/-+/g, '-'); // Collapse dashes
}

const DEFAULT_SONGS = [
  {
    id: "nho-oi",
    title: "Nhỏ Ơi",
    artist: "Chí Tài",
    rhythm: "Valse",
    key: "Am",
    chordPro: `Intro: [Am] [Dm] [G] [C] [Am] [Dm] [E] [Am]

1. Lần [Am]đầu ta gặp [G]nhỏ, trong [Em]nắng chiều bay [Am]bay
Ngập[Am] ngừng ta hỏi [G]nhỏ, nhỏ [G7]bảo nhỏ không [C]tên
Ừ [A7]thì nhỏ không [Dm]tên, bây [G7]giờ quen nhé [E7]nhỏ, nhỏ [Am]ơi.

2. Lần [Am]này ta gặp [G]nhỏ trong [Em]nắng chiều bay [Am]bay
Ngập [Am]ngừng ta hỏi [G]nhỏ, nhỏ [G7]bảo nhỏ chưa [C]yêu
Ừ [A7]thì nhỏ chưa [Dm]yêu, bây [G7]giờ yêu nhé [E7]nhỏ nhỏ [Am]ơi.

ĐK: Lần [Am]này, nhỏ quay [Dm]đi không [G7]thèm nhìn ta [C]nữa
Giọt [Am]sầu rơi một [Dm]mình chỉ [A7]còn ta một [Dm]mình, nhỏ [Am]ơi
[Am] [Dm] [G] [C] [Am] [Dm] [E] [Am]

ĐK: Lần [Am]này, nhỏ quay [Dm]đi không [G7]thèm nhìn ta [C]nữa
Giọt [Am]sầu rơi một [Dm]mình chỉ [A7]còn ta một [Dm]mình, nhỏ [Am]ơi

3. Còn [Am]gì đâu hỡi [G]nhỏ, bao [Em]nắng chiều phôi [Am]phai
Kỷ[Am] niệm ta cùng [G]nhỏ, giờ [G7]chỉ là hư [C]vô
Ừ [A7]Thì là hư [Dm]vô, xa [G7]rồi vẫn nhớ [E7]hoài, [Am]nhỏ ơi.

4. Tình [Am]cờ ta gặp [G]nhỏ, trong [Em]nắng vàng ban [Am]mai
Thẹn [Am]thùng ta hỏi [G]nhỏ, nhỏ [G7]bảo khờ ghê [C]đi
Ừ [A7]thì khờ ghê [Dm]đi, thương [G7]rồi sao chẳng [E7]hiểu, nhỏ [Am]ơi.
Ừ [A7]thì khờ ghê [Dm]đi, thương [G7]rồi sao chẳng [E7]hiểu, nhỏ [Am]ơi.`,
    isFavorite: true,
    dateAdded: new Date().toISOString()
  },
  {
    id: "yesterday",
    title: "Yesterday",
    artist: "The Beatles",
    rhythm: "Slow Rock",
    key: "F",
    chordPro: `[F]Yesterday, all my [Em7]troubles seemed so [A7]far a[Dm]way [C] [Bb]
Now it [C]looks as though they're [Bb]here to [F]stay
Oh, [Dm]I be[G7]lieve in [Bb]yester[F]day.

[F]Suddenly, I'm not [Em7]half the man I [A7]used to [Dm]be [C] [Bb]
There's a [C]shadow hanging [Bb]over [F]me.
Oh, [Dm]yester[G]day came [Bb]sudden[F]ly.

Refrain:
[Em7]Why  [A7]she  [Dm]had [C]to  [Bb]go,
I don't [Gm]know, she [C]wouldn't [F]say.
[Em7]I  [A7]said [Dm]some[C]thing [Bb]wrong,
now I [Gm]long for [C]yester[F]day.

[F]Yesterday, love was [Em7]such an easy [A7]game to [Dm]play [C] [Bb]
Now I [C]need a place to [Bb]hide a[F]way
Oh, [Dm]I be[G7]lieve in [Bb]yester[F]day.

[Dm]I be[G7]lieve in [Bb]yester[F]day.`,
    isFavorite: false,
    dateAdded: new Date().toISOString()
  },
  {
    id: "cat-bui",
    title: "Cát Bụi",
    artist: "Trịnh Công Sơn",
    rhythm: "Boston",
    key: "Am",
    chordPro: `1. Hạt bụi [Am]nào hóa kiếp thân [Dm]tôi
Để một [G]mai vươn hình hài nâng [C]đỡ
Ôi cát [F]bụi tuyệt [Dm]vời
Mặt trời [E7]soi một kiếp rong [Am]chơi.

2. Hạt bụi [Am]nào hóa kiếp thân [Dm]tôi
Để một [G]mai tôi về làm cát [C]bụi
Ôi cát [F]bụi mệt [Dm]nhoài
Tiếng động [E7]nào gõ nhịp khôn [Am]nguôi.

ĐK: Bao nhiêu [C]năm làm kiếp con [Am]người
Chợt một [F]chiều tóc trắng như [E7]vôi
Lá úa trên [Dm]cao rụng đầy
Cho trăm [F]năm vào chết một [E7]ngày.

3. Mặt trời [Am]nào soi sáng tim [Dm]tôi
Để tình [G]yêu xay mòn thành đá [C]cuội
Xin úp [F]mặt bùi [Dm]ngùi
Từng ngày [E7]qua mỏi ngóng tin [Am]vui.

4. Cụm rừng [Am]nào lá xác xơ [Dm]cây
Từ vực [G]sâu nghe lời mời đã [C]dậy
Ôi cát [F]bụi phận [Dm]này
Vết mực [E7]nào xóa bỏ không [Am]hay.`,
    isFavorite: false,
    dateAdded: new Date().toISOString()
  }
];

export function addSpacesAroundChords(text) {
  if (!text) return '';
  return text
    // Letter/number followed by [ -> add space
    .replace(/([\p{L}\p{N}])\[/gu, '$1 [')
    // ] followed by letter/number -> add space
    .replace(/\]([\p{L}\p{N}])/gu, '] $1');
}

export function getSongs() {
  try {
    if (!fs.existsSync(SONGS_FILE)) {
      fs.writeFileSync(SONGS_FILE, JSON.stringify(DEFAULT_SONGS, null, 2), 'utf-8');
      return DEFAULT_SONGS;
    }
    const data = fs.readFileSync(SONGS_FILE, 'utf-8');
    const songs = JSON.parse(data);

    let modified = false;
    const fixedSongs = songs.map(song => {
      let updatedSong = { ...song };
      let songModified = false;
      
      const originalChordPro = song.chordPro || '';
      const fixedChordPro = addSpacesAroundChords(originalChordPro);
      if (fixedChordPro !== originalChordPro) {
        updatedSong.chordPro = fixedChordPro;
        songModified = true;
      }
      
      if (song.artist && song.artist.includes("Tất cả 0-9 A B C D E F G H I J K L M N O P Q R S T U V W X Y Z")) {
        updatedSong.artist = "Khuyết Danh";
        songModified = true;
      }

      if (song.composer && song.composer.includes("Tất cả 0-9 A B C D E F G H I J K L M N O P Q R S T U V W X Y Z")) {
        updatedSong.composer = "";
        songModified = true;
      }

      if (songModified) {
        modified = true;
        return updatedSong;
      }
      return song;
    });

    if (modified) {
      console.log('🧹 Automatically fixed spaces and artists in songs database!');
      saveSongs(fixedSongs);
      return fixedSongs;
    }

    return songs;
  } catch (error) {
    console.error('Error reading songs database:', error);
    return DEFAULT_SONGS;
  }
}

export function saveSongs(songs) {
  try {
    fs.writeFileSync(SONGS_FILE, JSON.stringify(songs, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error('Error writing songs database:', error);
    return false;
  }
}

export function getSong(id) {
  const songs = getSongs();
  return songs.find(s => s.id === id);
}

export function addSong(songData) {
  const songs = getSongs();
  const id = slugify(songData.title + '-' + (songData.artist || 'unknown'));
  
  // Prevent duplicate ids
  let finalId = id;
  let counter = 1;
  while (songs.some(s => s.id === finalId)) {
    finalId = `${id}-${counter}`;
    counter++;
  }

  const newSong = {
    id: finalId,
    title: songData.title.trim(),
    artist: songData.artist ? songData.artist.trim() : 'Khuyết Danh',
    composer: songData.composer ? songData.composer.trim() : '',
    rhythm: songData.rhythm ? songData.rhythm.trim() : 'Chưa xác định',
    key: songData.key ? songData.key.trim() : 'C',
    chordPro: addSpacesAroundChords(songData.chordPro.trim()),
    isFavorite: songData.isFavorite || false,
    dateAdded: new Date().toISOString()
  };

  songs.push(newSong);
  saveSongs(songs);
  return newSong;
}

export function updateSong(id, songData) {
  const songs = getSongs();
  const index = songs.findIndex(s => s.id === id);
  if (index === -1) return null;

  songs[index] = {
    ...songs[index],
    title: songData.title.trim(),
    artist: songData.artist ? songData.artist.trim() : 'Khuyết Danh',
    composer: songData.composer !== undefined ? songData.composer.trim() : (songs[index].composer || ''),
    rhythm: songData.rhythm ? songData.rhythm.trim() : 'Chưa xác định',
    key: songData.key ? songData.key.trim() : 'C',
    chordPro: addSpacesAroundChords(songData.chordPro.trim()),
    isFavorite: songData.isFavorite !== undefined ? songData.isFavorite : songs[index].isFavorite
  };

  saveSongs(songs);
  return songs[index];
}

export function deleteSong(id) {
  const songs = getSongs();
  const filtered = songs.filter(s => s.id !== id);
  if (songs.length === filtered.length) return false;
  saveSongs(filtered);
  return true;
}

export function toggleFavorite(id) {
  const songs = getSongs();
  const index = songs.findIndex(s => s.id === id);
  if (index === -1) return null;

  songs[index].isFavorite = !songs[index].isFavorite;
  saveSongs(songs);
  return songs[index];
}

// Playlists
export function getPlaylists() {
  try {
    if (!fs.existsSync(PLAYLISTS_FILE)) {
      const defaultPlaylists = [{ id: 'campfire-night', name: 'Đêm Lửa Trại', songIds: ['nho-oi', 'cat-bui'] }];
      fs.writeFileSync(PLAYLISTS_FILE, JSON.stringify(defaultPlaylists, null, 2), 'utf-8');
      return defaultPlaylists;
    }
    const data = fs.readFileSync(PLAYLISTS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading playlists database:', error);
    return [];
  }
}

export function savePlaylists(playlists) {
  try {
    fs.writeFileSync(PLAYLISTS_FILE, JSON.stringify(playlists, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error('Error writing playlists database:', error);
    return false;
  }
}

export function createPlaylist(name) {
  const playlists = getPlaylists();
  const id = slugify(name);
  
  let finalId = id;
  let counter = 1;
  while (playlists.some(p => p.id === finalId)) {
    finalId = `${id}-${counter}`;
    counter++;
  }

  const newPlaylist = {
    id: finalId,
    name: name.trim(),
    songIds: []
  };

  playlists.push(newPlaylist);
  savePlaylists(playlists);
  return newPlaylist;
}

export function addSongToPlaylist(playlistId, songId) {
  const playlists = getPlaylists();
  const index = playlists.findIndex(p => p.id === playlistId);
  if (index === -1) return false;

  if (!playlists[index].songIds.includes(songId)) {
    playlists[index].songIds.push(songId);
    savePlaylists(playlists);
  }
  return playlists[index];
}

export function removeSongFromPlaylist(playlistId, songId) {
  const playlists = getPlaylists();
  const index = playlists.findIndex(p => p.id === playlistId);
  if (index === -1) return false;

  playlists[index].songIds = playlists[index].songIds.filter(id => id !== songId);
  savePlaylists(playlists);
  return playlists[index];
}

export function deletePlaylist(id) {
  const playlists = getPlaylists();
  const filtered = playlists.filter(p => p.id !== id);
  if (playlists.length === filtered.length) return false;
  savePlaylists(filtered);
  return true;
}
