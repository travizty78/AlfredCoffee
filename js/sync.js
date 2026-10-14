/* Cloud login + sync. The app always reads/writes its local copy (IndexedDB) so it is
   instant and works offline; this module pushes local changes up and pulls teammates'
   changes down. Records live in one Supabase table (records); files in a private bucket. */
(function () {
  'use strict';

  const COLLECTIONS = ['locations', 'assets', 'vendors', 'workorders', 'pm', 'docs', 'visits'];
  const BUCKET = 'files';
  const PAGE = 1000;

  // ---------- backends ----------
  function supabaseBackend(cfg) {
    const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    const ok = r => { if (r.error) throw r.error; return r.data; };
    return {
      getSession: async () => (await sb.auth.getSession()).data.session,
      signIn: async (email, password) => ok(await sb.auth.signInWithPassword({ email, password })).session,
      signUp: async (email, password, data) => ok(await sb.auth.signUp({ email, password, options: { data } })).session,
      signOut: async () => { await sb.auth.signOut(); },
      resetPassword: async (email, redirectTo) => ok(await sb.auth.resetPasswordForEmail(email, { redirectTo })),
      updatePassword: async password => ok(await sb.auth.updateUser({ password })),
      onAuthChange: cb => sb.auth.onAuthStateChange((event, session) => cb(event, session)),
      upsert: async rows => ok(await sb.from('records').upsert(rows, { onConflict: 'collection,id' })),
      fetchSince: async (since, from, to) => {
        let q = sb.from('records').select('collection,id,data,deleted,updated_at').order('updated_at', { ascending: true }).range(from, to);
        if (since) q = q.gt('updated_at', since);
        return ok(await q);
      },
      upload: async (path, blob, type) => ok(await sb.storage.from(BUCKET).upload(path, blob, { upsert: true, contentType: type || 'application/octet-stream' })),
      download: async path => ok(await sb.storage.from(BUCKET).download(path)),
      removeFile: async path => ok(await sb.storage.from(BUCKET).remove([path])),
      subscribe: cb => sb.channel('records-feed').on('postgres_changes', { event: '*', schema: 'public', table: 'records' }, cb).subscribe(),
    };
  }

  const cfg = window.ALFRED_CONFIG || {};
  let backend = null;
  if (window.__ALFRED_TEST_BACKEND__) backend = window.__ALFRED_TEST_BACKEND__;
  else if (cfg.supabaseUrl && cfg.supabaseKey && window.supabase) backend = supabaseBackend(cfg);
  if (!backend) return; // Not configured: app runs device-only.

  // ---------- helpers ----------
  const stable = v => {
    if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
    if (v && typeof v === 'object') return '{' + Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
    return JSON.stringify(v === undefined ? null : v);
  };

  // ---------- engine ----------
  let hooks = null;      // { getState, setState, persist, onRemoteChange, onStatus }
  let meta = { snap: {}, lastPull: '', uploads: [], userId: '' };
  let session = null;
  let running = null, again = false, timer = null;
  let status = { state: 'idle', pending: 0, last: '', error: '' };

  const saveMeta = () => DB.putKv('sync', meta);
  const setStatus = patch => { status = { ...status, ...patch }; if (hooks) hooks.onStatus(status); };

  function localRecords(state) {
    const out = new Map();
    for (const c of COLLECTIONS) for (const r of state[c] || []) out.set(c + '/' + r.id, { collection: c, id: r.id, data: r, json: stable(r) });
    out.set('meta/settings', { collection: 'meta', id: 'settings', data: state.settings || {}, json: stable(state.settings || {}) });
    return out;
  }

  function changes(state) {
    const cur = localRecords(state);
    const rows = [];
    for (const [k, r] of cur) if (meta.snap[k] !== r.json) rows.push({ k, row: { collection: r.collection, id: r.id, data: r.data, deleted: false }, json: r.json });
    for (const k of Object.keys(meta.snap)) if (!cur.has(k)) { const [collection, ...rest] = k.split('/'); rows.push({ k, row: { collection, id: rest.join('/'), data: null, deleted: true }, json: null }); }
    return rows;
  }

  async function push() {
    const rows = changes(hooks.getState());
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      await backend.upsert(chunk.map(x => x.row));
      for (const x of chunk) { if (x.json === null) delete meta.snap[x.k]; else meta.snap[x.k] = x.json; }
    }
    return rows.length;
  }

  async function pull() {
    const state = hooks.getState();
    // Small overlap so rows committed in the same instant are never skipped; re-applying is harmless.
    const since = meta.lastPull ? new Date(new Date(meta.lastPull).getTime() - 3000).toISOString() : '';
    let from = 0, changed = 0, maxTs = meta.lastPull;
    for (;;) {
      const page = await backend.fetchSince(since, from, from + PAGE - 1);
      for (const row of page) {
        if (!maxTs || row.updated_at > maxTs) maxTs = row.updated_at;
        const k = row.collection + '/' + row.id;
        if (row.collection === 'meta') {
          if (row.id === 'settings' && !row.deleted) { const j = stable(row.data || {}); if (meta.snap[k] !== j || stable(state.settings) !== j) { state.settings = row.data || {}; meta.snap[k] = j; changed++; } }
          continue;
        }
        if (!COLLECTIONS.includes(row.collection)) continue;
        const list = state[row.collection];
        const i = list.findIndex(r => r.id === row.id);
        if (row.deleted) {
          if (i >= 0) {
            const gone = list.splice(i, 1)[0];
            if (row.collection === 'docs' && gone.fileId) DB.deleteFile(gone.fileId).catch(() => {});
            changed++;
          }
          delete meta.snap[k];
        } else {
          const j = stable(row.data);
          if (i < 0 || stable(list[i]) !== j) { if (i < 0) list.push(row.data); else list[i] = row.data; changed++; }
          meta.snap[k] = j;
        }
      }
      if (page.length < PAGE) break;
      from += PAGE;
    }
    meta.lastPull = maxTs;
    return changed;
  }

  async function uploadFiles() {
    for (const fileId of [...meta.uploads]) {
      const rec = await DB.getFile(fileId);
      if (rec) await backend.upload(fileId, rec.blob, rec.type);
      meta.uploads = meta.uploads.filter(x => x !== fileId);
      await saveMeta();
    }
  }

  async function cycle() {
    if (!session || !hooks) return;
    if (session.offline && navigator.onLine) {
      // Opened offline earlier; now that we're online, confirm the login is still valid.
      try {
        const real = await backend.getSession();
        if (!real) { session = null; if (hooks.onSignedOut) hooks.onSignedOut(); return; }
        session = real;
      } catch (e) { return; }
    }
    if (!navigator.onLine) { setStatus({ state: 'offline', pending: changes(hooks.getState()).length + meta.uploads.length }); return; }
    setStatus({ state: 'syncing', error: '' });
    try {
      await push();
      await uploadFiles();
      const changed = await pull();
      await saveMeta();
      if (changed) { await hooks.persist(); hooks.onRemoteChange(changed); }
      setStatus({ state: 'synced', pending: changes(hooks.getState()).length + meta.uploads.length, last: new Date().toISOString() });
    } catch (e) {
      console.warn('Sync failed', e);
      setStatus({ state: 'error', error: e.message || String(e), pending: changes(hooks.getState()).length + meta.uploads.length });
    }
  }

  function syncNow() {
    if (running) { again = true; return running; }
    running = cycle().finally(() => { running = null; if (again) { again = false; syncNow(); } });
    return running;
  }
  const syncSoon = (ms = 1200) => { clearTimeout(timer); timer = setTimeout(syncNow, ms); };

  // First sign-in on this device: upload what's here if the cloud is empty, otherwise adopt the cloud copy.
  async function adoptAccount(userId) {
    if (meta.userId === userId) return;
    const state = hooks.getState();
    const probe = await backend.fetchSince('', 0, 0);
    const hasLocal = COLLECTIONS.some(c => (state[c] || []).length);
    if (probe.length && hasLocal) {
      await DB.putKv('pre-sync-copy', JSON.parse(JSON.stringify(state)));
      hooks.setState(null); // reset to blank; cloud copy is pulled next
    }
    meta = { snap: {}, lastPull: '', uploads: probe.length ? [] : (await DB.allFiles()).map(f => f.id), userId, email: (session.user || {}).email || '' };
    await saveMeta();
  }

  async function start() {
    const u = session.user || {};
    if (!session.offline) await adoptAccount(u.id);
    if (u.email && meta.email !== u.email) { meta.email = u.email; await saveMeta(); }
    await syncNow();
    if (!start.wired) {
      start.wired = true;
      try { backend.subscribe(() => syncSoon(400)); } catch (e) { /* realtime optional */ }
      setInterval(() => syncNow(), 60000);
      window.addEventListener('online', () => syncNow());
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncNow(); });
    }
  }

  window.Cloud = {
    enabled: true,
    get email() { return session && session.user ? session.user.email : ''; },
    get status() { return status; },
    async init(h) {
      hooks = h;
      meta = Object.assign({ snap: {}, lastPull: '', uploads: [], userId: '' }, await DB.getKv('sync') || {});
      backend.onAuthChange((event, s) => {
        if (event === 'PASSWORD_RECOVERY' && hooks.onPasswordRecovery) hooks.onPasswordRecovery();
        if (s) session = s;
        if (event === 'SIGNED_OUT') session = null;
      });
      try { session = await backend.getSession(); } catch (e) { session = null; }
      // No signal and the saved login could not be refreshed: keep working from this device's copy.
      if (!session && meta.userId && !navigator.onLine) session = { offline: true, user: { id: meta.userId, email: meta.email || '' } };
      return session;
    },
    async signIn(email, password) {
      session = await backend.signIn(email, password);
      return session;
    },
    async signUp(email, password, data) {
      session = await backend.signUp(email, password, data);
      return session;
    },
    start: () => start(),
    async signOut() {
      try { await backend.signOut(); } catch (e) { /* offline: still sign out locally */ }
      session = null;
      meta = { snap: {}, lastPull: '', uploads: [], userId: '' };
      await DB.clearAll();
    },
    resetPassword: email => backend.resetPassword(email, location.origin + location.pathname),
    updatePassword: pw => backend.updatePassword(pw),
    changed: () => syncSoon(),
    syncNow,
    pendingCount: () => (hooks ? changes(hooks.getState()).length : 0) + meta.uploads.length,
    queueUpload(fileId) { if (!meta.uploads.includes(fileId)) meta.uploads.push(fileId); saveMeta(); syncSoon(); },
    async fetchFile(fileId) {
      const blob = await backend.download(fileId);
      return blob;
    },
    async removeFile(fileId) {
      meta.uploads = meta.uploads.filter(x => x !== fileId);
      saveMeta();
      try { await backend.removeFile(fileId); } catch (e) { /* best effort */ }
    },
  };
})();
