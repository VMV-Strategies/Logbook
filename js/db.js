// IndexedDB layer. The only file that talks to the database.
//
// Stores
//   workouts  (key: id)    one record per workout, exercises and sets nested inside,
//                          so every save is a single all-or-nothing write
//   body      (key: date)  one record per local calendar date (YYYY-MM-DD)
//   exercises (key: id)    custom exercises only; the built-in library lives in code
//   settings  (key: key)   { key, value }
//
// App updates never touch this database. If the structure ever has to change,
// raise DB_VERSION and add a step in upgrade() that converts existing records.
// Never delete a store or clear data in a migration.

const DB_NAME = 'logbook';
const DB_VERSION = 1;
const STORES = ['workouts', 'body', 'exercises', 'settings'];

let dbPromise = null;

function upgrade(db, oldVersion) {
  if (oldVersion < 1) {
    db.createObjectStore('workouts', { keyPath: 'id' });
    db.createObjectStore('body', { keyPath: 'date' });
    db.createObjectStore('exercises', { keyPath: 'id' });
    db.createObjectStore('settings', { keyPath: 'key' });
  }
  // if (oldVersion < 2) { ...convert records in place... }
}

function open() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) { reject(new Error('IndexedDB is not available')); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => upgrade(req.result, e.oldVersion);
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => { db.close(); dbPromise = null; };
      db.onclose = () => { dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Database is in use by another tab'));
  });
}

function getDb() {
  if (!dbPromise) dbPromise = open().catch((err) => { dbPromise = null; throw err; });
  return dbPromise;
}

// Runs fn inside one transaction. iOS sometimes drops the connection while the
// app is in the background, so a failed start reopens the database and retries once.
async function tx(stores, mode, fn, retry = true) {
  const db = await getDb();
  let t;
  try {
    t = db.transaction(stores, mode);
  } catch (err) {
    if (!retry) throw err;
    try { db.close(); } catch { /* already closed */ }
    dbPromise = null;
    return tx(stores, mode, fn, false);
  }
  return new Promise((resolve, reject) => {
    let result;
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error || new Error('Database write failed'));
    t.onabort = () => reject(t.error || new Error('Database write was cancelled'));
    try { result = fn(t); } catch (err) { try { t.abort(); } catch { /* ignore */ } reject(err); }
  });
}

export const db = {
  loadAll() {
    return tx(STORES, 'readonly', (t) => {
      const out = {};
      for (const name of STORES) {
        const req = t.objectStore(name).getAll();
        req.onsuccess = () => { out[name] = req.result; };
      }
      return out;
    });
  },
  put(store, value) {
    return tx([store], 'readwrite', (t) => { t.objectStore(store).put(value); });
  },
  delete(store, key) {
    return tx([store], 'readwrite', (t) => { t.objectStore(store).delete(key); });
  },
  /** Restore a backup: everything is replaced in ONE transaction, so a failure leaves the old data untouched. */
  replaceAll(data) {
    return tx(STORES, 'readwrite', (t) => {
      for (const name of STORES) t.objectStore(name).clear();
      for (const w of data.workouts) t.objectStore('workouts').put(w);
      for (const m of data.body) t.objectStore('body').put(m);
      for (const e of data.customExercises) t.objectStore('exercises').put(e);
      for (const [key, value] of Object.entries(data.settings)) t.objectStore('settings').put({ key, value });
    });
  },
};
