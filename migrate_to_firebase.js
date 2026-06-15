import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp } from 'firebase/app';
import { getFirestore, writeBatch, doc, setDoc } from 'firebase/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load Firebase Web SDK config
const CONFIG_FILE = path.join(__dirname, 'firebase-config.json');
if (!fs.existsSync(CONFIG_FILE)) {
  console.error('firebase-config.json not found! Please make sure it is in the root directory.');
  process.exit(1);
}
const firebaseConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));

// Initialize Firebase App & Firestore
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

console.log(`Initialized Firebase for project: ${firebaseConfig.projectId}`);

// Helper to batch-write arrays of objects
async function migrateCollection(collectionName, items, docKeyField, transformFn = (item) => item) {
  console.log(`Migrating ${items.length} items to collection "${collectionName}"...`);
  
  const batchLimit = 300; // Firestore limit is 500, using 300 to be safe
  let currentBatch = writeBatch(db);
  let operationCount = 0;
  let batchCount = 1;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const transformed = transformFn(item);
    
    // Get doc reference
    let docRef;
    if (docKeyField && transformed[docKeyField]) {
      docRef = doc(db, collectionName, String(transformed[docKeyField]));
    } else {
      // Auto-generate ID if no key field specified
      docRef = doc(db, collectionName, `auto_${Date.now()}_${i}`);
    }

    currentBatch.set(docRef, transformed);
    operationCount++;

    if (operationCount >= batchLimit || i === items.length - 1) {
      console.log(`Committing batch ${batchCount} (${operationCount} operations)...`);
      await currentBatch.commit();
      
      // Start a new batch
      currentBatch = writeBatch(db);
      operationCount = 0;
      batchCount++;
    }
  }
  console.log(`Successfully migrated collection "${collectionName}"!`);
}

async function startMigration() {
  try {
    // 1. Migrate Users
    const usersFile = path.join(__dirname, 'users.json');
    if (fs.existsSync(usersFile)) {
      const users = JSON.parse(fs.readFileSync(usersFile, 'utf-8'));
      await migrateCollection('users', users, 'id');
    }

    // 2. Migrate Playlists
    const playlistsFile = path.join(__dirname, 'playlists.json');
    if (fs.existsSync(playlistsFile)) {
      const playlists = JSON.parse(fs.readFileSync(playlistsFile, 'utf-8'));
      await migrateCollection('playlists', playlists, 'id');
    }

    // 3. Migrate Play History
    const playHistoryFile = path.join(__dirname, 'play_history.json');
    if (fs.existsSync(playHistoryFile)) {
      const playHistory = JSON.parse(fs.readFileSync(playHistoryFile, 'utf-8'));
      await migrateCollection('play_history', playHistory, null, (item) => {
        // Add a composite key field to avoid duplicates
        return {
          ...item,
          id: `${item.userId}_${item.songId}`
        };
      });
    }

    // 4. Migrate Favorites
    const favoritesFile = path.join(__dirname, 'favorites.json');
    if (fs.existsSync(favoritesFile)) {
      const favoritesData = JSON.parse(fs.readFileSync(favoritesFile, 'utf-8'));
      const favoritesList = Object.entries(favoritesData).map(([userId, songIds]) => ({
        id: userId,
        userId,
        songIds
      }));
      await migrateCollection('favorites', favoritesList, 'id');
    }

    // 5. Migrate Songs (Largest collection, chunked)
    const songsFile = path.join(__dirname, 'songs.json');
    if (fs.existsSync(songsFile)) {
      const songs = JSON.parse(fs.readFileSync(songsFile, 'utf-8'));
      await migrateCollection('songs', songs, 'id');
    }

    console.log('\n🎉 All local JSON data successfully migrated to Firebase Firestore!');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

startMigration();
