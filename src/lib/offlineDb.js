import Dexie from 'dexie';
import { supabase } from './supabase';

export const db = new Dexie('ITQuizOfflineDB');

db.version(2).stores({
  student_logs: '++id, email, login_time, synced',
  quiz_results: '++id, timestamp, synced',
  typing_results: '++id, timestamp, synced',
  code_results: '++id, timestamp, synced',
  questions: '++id, level, category, synced',
  typing_texts: '++id, level, synced',
  buggy_codes: '++id, level, synced',
  teachers: '++id, username, synced',
  quiz_settings: '++id, key, synced'
});

export const syncOfflineData = async () => {
  if (!navigator.onLine) return;

  const tablesToSync = ['student_logs', 'quiz_results', 'typing_results', 'code_results'];
  
  for (const tableName of tablesToSync) {
    try {
      const unsynced = await db.table(tableName).where('synced').equals(0).toArray();
      if (unsynced.length === 0) continue;

      console.log(`Syncing ${unsynced.length} records for ${tableName}...`);
      
      for (const item of unsynced) {
        const { id, synced, ...dataToPush } = item;
        // Fix for student_logs mapping if needed
        const { error } = await supabase.from(tableName).insert([dataToPush]);
        
        if (!error) {
          await db.table(tableName).update(id, { synced: 1 });
        }
      }
    } catch (err) {
      console.error(`Error syncing table ${tableName}:`, err);
    }
  }
};

// Auto-sync when coming back online
window.addEventListener('online', () => {
  console.log('Online detected. Starting sync...');
  syncOfflineData();
});
