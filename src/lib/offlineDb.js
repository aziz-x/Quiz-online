import Dexie from 'dexie';

export const db = new Dexie('ITQuizOfflineDB');

db.version(1).stores({
  student_logs: '++id, email, login_time, synced',
  quiz_results: '++id, timestamp, synced',
  typing_results: '++id, timestamp, synced',
  code_results: '++id, timestamp, synced',
  questions: '++id, level, category',
  typing_texts: '++id, level',
  buggy_codes: '++id, level',
  teachers: '++id, username',
  quiz_settings: '++id, key'
});

export const syncTable = async (tableName, supabaseTable, filterField = 'synced') => {
  if (!navigator.onLine) return;

  // 1. Push unsynced local data to Supabase
  const unsynced = await db.table(tableName).where(filterField).equals(0).toArray();
  for (const item of unsynced) {
    const { id, synced, ...dataToPush } = item;
    try {
      const { error } = await supabase.from(supabaseTable).insert([dataToPush]);
      if (!error) {
        await db.table(tableName).update(id, { synced: 1 });
      }
    } catch (err) {
      console.error(`Sync push error for ${tableName}:`, err);
    }
  }

  // 2. Pull from Supabase to Local (Simple sync: overwrite local with remote for configuration tables)
  // For results/logs, we usually only push. For questions/teachers, we pull.
};
