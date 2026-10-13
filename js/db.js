/* Local persistence: IndexedDB holds the app state (JSON) and attached files (blobs).
   Everything stays on this device; use Settings → Export to back up or move data. */
(function () {
  'use strict';

  const DB_NAME = 'alfred-facilities';
  const DB_VERSION = 1;
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
        if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  function tx(store, mode, fn) {
    return open().then(db => new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      const s = t.objectStore(store);
      let result;
      const r = fn(s);
      if (r) r.onsuccess = () => { result = r.result; };
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    }));
  }

  window.DB = {
    loadState: () => tx('kv', 'readonly', s => s.get('state')),
    getKv: key => tx('kv', 'readonly', s => s.get(key)),
    putKv: (key, val) => tx('kv', 'readwrite', s => s.put(val, key)),
    saveState: state => tx('kv', 'readwrite', s => s.put(state, 'state')),
    putFile: rec => tx('files', 'readwrite', s => s.put(rec)),
    getFile: id => tx('files', 'readonly', s => s.get(id)),
    deleteFile: id => tx('files', 'readwrite', s => s.delete(id)),
    allFiles: () => tx('files', 'readonly', s => s.getAll()),
    clearAll: () => tx('kv', 'readwrite', s => s.clear()).then(() => tx('files', 'readwrite', s => s.clear())),
  };
})();
