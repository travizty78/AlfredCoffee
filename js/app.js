/* Alfred Facilities – offline-first facility management app (vanilla JS, no build step). */
(function () {
  'use strict';

  const S = window.SCHEMA;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  // ---------- helpers ----------
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const iso = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const today = () => iso(new Date());
  const parseD = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const daysUntil = s => Math.round((parseD(s) - parseD(today())) / 86400000);
  const addDays = (s, n) => { const d = parseD(s); d.setDate(d.getDate() + n); return iso(d); };
  const fmtDate = s => s ? parseD(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  const money = n => n === '' || n == null || isNaN(+n) ? '' : '$' + (+n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const priId = label => (label || '').slice(0, 2);
  const isClosed = wo => S.WO_CLOSED.includes(wo.status);
  const telLink = p => p ? `<a href="tel:${esc(p.replace(/[^\d+]/g, ''))}">${esc(p)}</a>` : '';
  const mailLink = e => e ? `<a href="mailto:${esc(e)}">${esc(e)}</a>` : '';
  const fmtSize = b => b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';

  function addFreq(s, label) {
    const f = S.PM_FREQS.find(x => x.label === label);
    if (!f || !s) return '';
    const d = parseD(s);
    if (f.days) d.setDate(d.getDate() + f.days); else d.setMonth(d.getMonth() + f.months);
    return iso(d);
  }

  function dueBadge(s, closed) {
    if (!s) return '<span class="muted">—</span>';
    if (closed) return esc(fmtDate(s));
    const n = daysUntil(s);
    if (n < 0) return `<span class="badge red" title="${esc(fmtDate(s))}">Overdue ${-n}d</span>`;
    if (n === 0) return `<span class="badge amber">Due today</span>`;
    if (n <= 7) return `<span class="badge amber" title="${esc(fmtDate(s))}">In ${n}d</span>`;
    return `<span class="badge">${esc(fmtDate(s))}</span>`;
  }

  function statusPill(status) {
    const cls = { 'Open': 'blue', 'Assigned': 'blue', 'In progress': 'amber', 'Completed': 'green', 'Closed': 'green', 'Cancelled': 'gray',
      'In service': 'green', 'Needs repair': 'amber', 'Out of service': 'red', 'Retired': 'gray', 'Pending install': 'blue' }[status] || (status && status.startsWith('On hold') ? 'gray' : '');
    return status ? `<span class="pill ${cls}">${esc(status)}</span>` : '';
  }
  const priPill = p => p ? `<span class="pill pri-${priId(p)}">${esc(priId(p))}</span>` : '';

  function toast(msg, ms = 2600) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), ms);
  }

  // ---------- state ----------
  let state = null;
  const blankState = () => ({ version: 1, locations: [], assets: [], vendors: [], workorders: [], pm: [], docs: [], visits: [], seq: { wo: 1 }, createdAt: new Date().toISOString() });

  let saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      DB.saveState(state).catch(err => { console.error(err); toast('⚠️ Could not save: ' + err.message, 6000); });
    }, 150);
  }

  function upsert(coll, rec) {
    const list = state[coll];
    const now = new Date().toISOString();
    if (rec.id) {
      const i = list.findIndex(x => x.id === rec.id);
      if (i >= 0) { list[i] = { ...list[i], ...rec, updatedAt: now }; save(); return list[i]; }
    }
    const created = { ...rec, id: rec.id || uid(), createdAt: now, updatedAt: now };
    list.push(created);
    save();
    return created;
  }

  function remove(coll, id) {
    state[coll] = state[coll].filter(x => x.id !== id);
    save();
  }

  const byId = (coll, id) => state[coll].find(x => x.id === id);
  const locName = id => (byId('locations', id) || {}).name || '—';
  const vendorName = id => (byId('vendors', id) || {}).company || '';
  const catLabel = id => { const c = S.catById(id); return c ? `${c.icon} ${c.label}` : ''; };
  const assetName = id => (byId('assets', id) || {}).name || '';
  const sortedLocations = () => [...state.locations].sort((a, b) => a.name.localeCompare(b.name));

  // ---------- UI prefs (per device convenience only) ----------
  const ui = (() => {
    const defaults = { wo: { loc: '', status: 'open', pri: '', cat: '', q: '' }, pm: { loc: '', cat: '', due: 'all', q: '' }, vendors: { trade: '', q: '' }, docs: { loc: '', kind: '', q: '' }, visits: { loc: '' }, reports: { range: '90' }, locs: { region: '', q: '' }, theme: '' };
    try {
      const saved = JSON.parse(localStorage.getItem('af-ui') || '{}');
      for (const k of Object.keys(saved)) defaults[k] = typeof defaults[k] === 'object' ? { ...defaults[k], ...saved[k] } : saved[k];
    } catch (e) { /* ignore */ }
    return defaults;
  })();
  const saveUi = () => { try { localStorage.setItem('af-ui', JSON.stringify(ui)); } catch (e) { /* ignore */ } };

  function applyTheme() {
    if (ui.theme) document.documentElement.dataset.theme = ui.theme;
    else delete document.documentElement.dataset.theme;
  }

  // ---------- forms & modal ----------
  function selectHtml(name, pairs, val, blank = '— Select —', attrs = '') {
    val = val ?? '';
    if (val && !pairs.some(p => p[0] === val)) pairs = [[val, val], ...pairs];
    return `<select name="${name}" id="f_${name}" ${attrs}><option value="">${esc(blank)}</option>${pairs.map(([v, l]) => `<option value="${esc(v)}"${v === val ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  }

  const isInternal = v => (v.kind || '').startsWith('Internal');
  const vendorPairs = () => [...state.vendors].sort((a, b) => isInternal(b) - isInternal(a) || a.company.localeCompare(b.company))
    .map(v => [v.id, (isInternal(v) ? '👷 ' : '') + v.company + (v.trade ? ' – ' + v.trade : '')]);
  const locationPairs = () => sortedLocations().map(l => [l.id, l.name]);
  const categoryPairs = () => S.CATEGORIES.map(c => [c.id, `${c.icon} ${c.label}`]);
  function assetPairs(locId, cat) {
    return state.assets.filter(a => (!locId || a.locationId === locId) && (!cat || a.category === cat))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(a => [a.id, a.name + (a.type ? ` (${a.type})` : '') + (!locId ? ' – ' + locName(a.locationId) : '')]);
  }

  function fieldHtml(f, val, ctx, values) {
    val = val ?? '';
    const id = 'f_' + f.k;
    const req = f.required ? ' <b class="req">*</b>' : '';
    const ph = f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : '';
    let input;
    switch (f.type) {
      case 'textarea': input = `<textarea name="${f.k}" id="${id}" rows="3"${ph}>${esc(val)}</textarea>`; break;
      case 'select': input = selectHtml(f.k, f.options.map(o => [o, o]), val); break;
      case 'vendor': input = selectHtml(f.k, vendorPairs(), val, state.vendors.length ? '— None —' : '— Add vendors in the directory —'); break;
      case 'location': input = selectHtml(f.k, locationPairs(), val); break;
      case 'category': input = selectHtml(f.k, categoryPairs(), val); break;
      case 'asset': input = selectHtml(f.k, assetPairs(values.locationId, values.category), val, '— None / general —', 'data-asset-select'); break;
      case 'locations': {
        const set = new Set(Array.isArray(val) ? val : []);
        input = `<div class="checks">${sortedLocations().map(l => `<label class="check"><input type="checkbox" name="${f.k}" value="${esc(l.id)}"${set.has(l.id) ? ' checked' : ''}> ${esc(l.name)}</label>`).join('') || '<span class="muted">No locations yet</span>'}</div>`;
        return `<div class="field full"><span>${esc(f.label)}</span>${input}</div>`;
      }
      case 'file': input = `<input type="file" name="${f.k}" id="${id}" multiple accept="${esc(f.accept || '')}">`; break;
      default: {
        const list = f.list && ctx.brands && ctx.brands.length ? ` list="dl_${f.k}"` : '';
        const dl = list ? `<datalist id="dl_${f.k}">${ctx.brands.map(b => `<option value="${esc(b)}">`).join('')}</datalist>` : '';
        const step = f.type === 'number' ? ' step="any"' : '';
        input = `<input type="${f.type}" name="${f.k}" id="${id}" value="${esc(val)}"${ph}${list}${step}>${dl}`;
      }
    }
    return `<label class="field${f.full ? ' full' : ''}" for="${id}"><span>${esc(f.label)}${req}</span>${input}</label>`;
  }

  function collect(form, fields) {
    const out = {};
    for (const f of fields) {
      if (f.type === 'locations') out[f.k] = $$(`input[name="${f.k}"]:checked`, form).map(i => i.value);
      else if (f.type === 'file') out[f.k] = [...(form.elements[f.k].files || [])];
      else { const el = form.elements[f.k]; out[f.k] = el ? el.value.trim() : ''; }
    }
    return out;
  }

  const dialog = () => $('#modal');
  function openModal(title, bodyHtml, wide) {
    const d = dialog();
    d.className = wide ? 'wide' : '';
    d.innerHTML = `<div class="modal-head"><h2>${esc(title)}</h2><button class="icon-btn" data-action="close-modal" aria-label="Close">✕</button></div><div class="modal-body">${bodyHtml}</div>`;
    if (!d.open) d.showModal();
    return d;
  }
  function closeModal() { const d = dialog(); if (d.open) d.close(); d.innerHTML = ''; }

  function openForm({ title, fields, values = {}, ctx = {}, onSave, onDelete, extra = '', wide = true }) {
    const html = `<form id="modal-form" novalidate>
      <div class="form-grid">${fields.map(f => fieldHtml(f, values[f.k], ctx, values)).join('')}</div>
      ${extra}
      <p class="form-error" hidden></p>
      <div class="modal-actions">
        ${onDelete ? '<button type="button" class="btn danger" data-form="delete">Delete</button>' : ''}
        <span class="spacer"></span>
        <button type="button" class="btn" data-action="close-modal">Cancel</button>
        <button type="submit" class="btn primary">Save</button>
      </div></form>`;
    const d = openModal(title, html, wide);
    const form = $('#modal-form', d);

    // Keep asset dropdown in sync with chosen location / category.
    form.addEventListener('change', e => {
      if (e.target.name === 'locationId' || e.target.name === 'category') {
        const sel = $('[data-asset-select]', form);
        if (sel) {
          const cur = sel.value;
          const locEl = form.elements.locationId, catEl = form.elements.category;
          sel.outerHTML = selectHtml(sel.name, assetPairs(locEl ? locEl.value : '', catEl ? catEl.value : ''), cur, '— None / general —', 'data-asset-select');
        }
      }
    });

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const v = collect(form, fields);
      const missing = fields.filter(f => f.required && (!v[f.k] || (Array.isArray(v[f.k]) && !v[f.k].length)));
      const err = $('.form-error', form);
      if (missing.length) {
        err.hidden = false;
        err.textContent = 'Required: ' + missing.map(f => f.label).join(', ');
        const first = form.elements[missing[0].k];
        if (first && first.focus) first.focus();
        return;
      }
      try {
        await onSave(v);
        closeModal();
        render();
      } catch (ex) {
        console.error(ex);
        err.hidden = false;
        err.textContent = ex.message || String(ex);
      }
    });

    if (onDelete) {
      $('[data-form="delete"]', form).addEventListener('click', () => {
        if (confirm('Delete this record? This cannot be undone.')) { onDelete(); closeModal(); render(); }
      });
    }
    const first = $('input:not([type=checkbox]):not([type=file]), select, textarea', form);
    if (first && !values.id) first.focus();
    return d;
  }

  // ---------- files / attachments ----------
  const urlCache = new Map();
  async function fileUrl(fileId) {
    if (urlCache.has(fileId)) return urlCache.get(fileId);
    const rec = await DB.getFile(fileId);
    if (!rec) throw new Error('File not found on this device');
    const url = URL.createObjectURL(rec.blob);
    urlCache.set(fileId, url);
    return url;
  }

  async function addFiles(files, meta) {
    for (const file of files) {
      const fileId = uid();
      await DB.putFile({ id: fileId, blob: file, name: file.name, type: file.type, size: file.size });
      upsert('docs', {
        fileId, fileName: file.name, mime: file.type, size: file.size,
        title: meta.title && files.length === 1 ? meta.title : file.name.replace(/\.[^.]+$/, ''),
        kind: meta.kind || 'Other', locationId: meta.locationId || '', ownerType: meta.ownerType || '', ownerId: meta.ownerId || '',
        date: today(), notes: meta.notes || '',
      });
    }
  }

  async function deleteDoc(id) {
    const doc = byId('docs', id);
    if (!doc) return;
    remove('docs', id);
    try { await DB.deleteFile(doc.fileId); } catch (e) { /* ignore */ }
    if (urlCache.has(doc.fileId)) { URL.revokeObjectURL(urlCache.get(doc.fileId)); urlCache.delete(doc.fileId); }
  }

  const isImage = d => (d.mime || '').startsWith('image/');
  const docIcon = d => isImage(d) ? '🖼️' : (d.mime || '').includes('pdf') ? '📄' : '📎';

  function attachmentsHtml(ownerType, ownerId, locationId) {
    const docs = state.docs.filter(d => d.ownerId === ownerId);
    return `<section class="attach" data-attach="${esc(ownerId)}">
      <h3>Photos & files</h3>
      <ul class="file-list">${docs.map(d => `<li>${docIcon(d)} <a href="#" data-action="open-doc" data-id="${d.id}">${esc(d.title)}</a> <span class="muted">${esc(d.kind)} · ${fmtSize(d.size || 0)}</span>
        <button type="button" class="link danger" data-action="delete-doc-inline" data-id="${d.id}">remove</button></li>`).join('') || '<li class="muted">No files yet</li>'}</ul>
      <div class="attach-row">
        ${selectHtml('attachKind', S.DOC_KINDS.map(k => [k, k]), ownerType === 'workorder' ? 'Photo' : 'Photo', 'Kind', 'class="sm"')}
        <label class="btn sm">📷 Add photo / file<input type="file" multiple hidden data-change="attach" data-owner-type="${ownerType}" data-owner-id="${esc(ownerId)}" data-loc="${esc(locationId || '')}" accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.dwg"></label>
      </div></section>`;
  }

  function refreshAttachments(ownerId) {
    const sec = $(`[data-attach="${CSS.escape(ownerId)}"]`);
    if (!sec) return;
    const input = $('input[type=file]', sec);
    sec.outerHTML = attachmentsHtml(input.dataset.ownerType, ownerId, input.dataset.loc);
  }

  async function openDoc(id) {
    const doc = byId('docs', id);
    if (!doc) return;
    try {
      const url = await fileUrl(doc.fileId);
      if (isImage(doc) && !dialog().open) {
        openModal(doc.title, `<div class="viewer"><img src="${url}" alt="${esc(doc.title)}"></div>
          <div class="modal-actions"><a class="btn" href="${url}" download="${esc(doc.fileName || doc.title)}">Download</a><span class="spacer"></span><a class="btn" href="${url}" target="_blank" rel="noopener">Open full size</a></div>`, true);
      } else {
        const w = window.open(url, '_blank');
        if (!w) { const a = document.createElement('a'); a.href = url; a.download = doc.fileName || doc.title; a.click(); }
      }
    } catch (e) { toast(e.message); }
  }

  async function loadThumbs() {
    for (const img of $$('img[data-thumb]')) {
      try { img.src = await fileUrl(img.dataset.thumb); } catch (e) { img.alt = 'missing'; }
      img.removeAttribute('data-thumb');
    }
  }

  // ---------- record editors ----------
  function editLocation(id) {
    const loc = id ? byId('locations', id) : { status: 'Open' };
    openForm({
      title: id ? 'Edit location' : 'Add location', fields: S.LOCATION_FIELDS, values: loc,
      onSave: v => { const r = upsert('locations', { ...loc, ...v }); if (!id) location.hash = `#/loc/${r.id}/overview`; toast('Location saved'); },
      onDelete: id ? () => {
        const n = state.assets.filter(a => a.locationId === id).length + state.workorders.filter(w => w.locationId === id).length;
        if (n && !confirm(`This location has ${n} assets / work orders. Delete them too?`)) return;
        state.assets = state.assets.filter(a => a.locationId !== id);
        state.workorders = state.workorders.filter(w => w.locationId !== id);
        state.pm = state.pm.filter(p => p.locationId !== id);
        state.visits = state.visits.filter(v => v.locationId !== id);
        state.docs.filter(d => d.locationId === id).forEach(d => deleteDoc(d.id));
        remove('locations', id);
        location.hash = '#/locations';
      } : null,
    });
  }

  function editAsset(id, defaults = {}) {
    const asset = id ? byId('assets', id) : { status: 'In service', condition: 'Good', ...defaults };
    const cat = S.catById(asset.category) || S.CATEGORIES[0];
    const fields = [{ k: 'locationId', label: 'Location', type: 'location', required: true }, ...S.fieldsFor(cat)];
    const extra = id ? attachmentsHtml('asset', id, asset.locationId) + assetHistoryHtml(id) : '<p class="muted small">Save the asset first, then reopen it to attach photos, manuals, and warranty docs.</p>';
    openForm({
      title: `${cat.icon} ${id ? 'Edit' : 'Add'} – ${cat.label}`, fields, values: asset, ctx: { brands: cat.brands }, extra,
      onSave: v => { upsert('assets', { ...asset, ...v, category: cat.id }); toast('Saved'); },
      onDelete: id ? () => { state.docs.filter(d => d.ownerId === id).forEach(d => deleteDoc(d.id)); remove('assets', id); } : null,
    });
  }

  function assetHistoryHtml(assetId) {
    const wos = state.workorders.filter(w => w.assetId === assetId).sort((a, b) => (b.reportedDate || '').localeCompare(a.reportedDate || ''));
    if (!wos.length) return '';
    const total = wos.reduce((s, w) => s + (+w.cost || 0), 0);
    const asset = byId('assets', assetId);
    const rc = +asset.replacementCost || 0;
    const rvr = rc && total >= rc * 0.5
      ? `<div class="callout warn">⚖️ Repair spend is <b>${Math.round(total / rc * 100)}%</b> of replacement cost (${money(rc)}) — consider replacing.</div>` : '';
    return rvr + `<section class="attach"><h3>Work order history <span class="muted">(${wos.length} · ${money(total) || '$0'} spent)</span></h3><ul class="file-list">${wos.map(w =>
      `<li><a href="#" data-action="edit-wo" data-id="${w.id}">${esc(w.number)} – ${esc(w.title)}</a> ${statusPill(w.status)} <span class="muted">${esc(fmtDate(w.reportedDate))}${w.cost ? ' · ' + money(w.cost) : ''}</span></li>`).join('')}</ul></section>`;
  }

  function editWO(id, defaults = {}) {
    const wo = id ? byId('workorders', id) : { status: 'Open', priority: S.WO_PRIORITIES[2].label, woType: 'Repair', reportedDate: today(), ...defaults };
    const extra = id ? attachmentsHtml('workorder', id, wo.locationId) + woHistoryHtml(wo) : '';
    const vendor = wo.vendorId && byId('vendors', wo.vendorId);
    const vendorBox = vendor ? `<div class="callout">📞 <b>${esc(vendor.company)}</b> ${telLink(vendor.phone)} ${vendor.emergencyPhone ? ' · After-hours: ' + telLink(vendor.emergencyPhone) : ''} ${mailLink(vendor.email)}</div>` : '';
    openForm({
      title: id ? `Work order ${wo.number}` : 'New work order', fields: S.WO_FIELDS, values: wo, extra: vendorBox + extra,
      onSave: v => {
        const rec = { ...wo, ...v };
        if (!rec.dueDate) {
          const p = S.WO_PRIORITIES.find(x => x.label === rec.priority);
          rec.dueDate = addDays(rec.reportedDate || today(), p ? Math.floor(p.hours / 24) : 7);
        }
        if (S.WO_CLOSED.slice(0, 2).includes(rec.status) && !rec.completedDate) rec.completedDate = today();
        rec.history = [...(wo.history || [])];
        if (!id) {
          rec.number = 'WO-' + String(state.seq.wo++).padStart(4, '0');
          rec.history.push({ at: new Date().toISOString(), text: `Created (${rec.status})` });
        } else if (wo.status !== rec.status) {
          rec.history.push({ at: new Date().toISOString(), text: `Status: ${wo.status} → ${rec.status}` });
        }
        if (id && wo.vendorId !== rec.vendorId && rec.vendorId) rec.history.push({ at: new Date().toISOString(), text: `Assigned to ${vendorName(rec.vendorId)}` });
        const saved = upsert('workorders', rec);
        toast(`${saved.number} saved`);
      },
      onDelete: id ? () => { state.docs.filter(d => d.ownerId === id).forEach(d => deleteDoc(d.id)); remove('workorders', id); } : null,
    });
  }

  function woHistoryHtml(wo) {
    if (!wo.history || !wo.history.length) return '';
    return `<section class="attach"><h3>Activity</h3><ul class="file-list">${wo.history.slice().reverse().map(h =>
      `<li><span class="muted">${esc(new Date(h.at).toLocaleString())}</span> – ${esc(h.text)}</li>`).join('')}</ul></section>`;
  }

  function editPM(id, defaults = {}) {
    const pm = id ? byId('pm', id) : { frequency: 'Quarterly', ...defaults };
    openForm({
      title: id ? 'Edit PM task' : 'Add PM task', fields: S.PM_FIELDS, values: pm,
      onSave: v => {
        const rec = { ...pm, ...v };
        if (rec.lastDone && !rec.nextDue) rec.nextDue = addFreq(rec.lastDone, rec.frequency);
        upsert('pm', rec);
        toast('PM task saved');
      },
      onDelete: id ? () => remove('pm', id) : null,
    });
  }

  function editVendor(id) {
    const v0 = id ? byId('vendors', id) : { preferred: 'No', kind: 'External vendor' };
    const extra = id ? attachmentsHtml('vendor', id, '') : '';
    openForm({
      title: id ? 'Edit team member / vendor' : 'Add team member or vendor', fields: S.VENDOR_FIELDS, values: v0, extra,
      onSave: v => { upsert('vendors', { ...v0, ...v }); toast('Vendor saved'); },
      onDelete: id ? () => remove('vendors', id) : null,
    });
  }

  function uploadDocs(defaults = {}) {
    const fields = [
      { k: 'files', label: 'Files (PDF, images, drawings)', type: 'file', required: true, full: true, accept: 'image/*,application/pdf,.dwg,.doc,.docx,.xls,.xlsx,.csv,.txt' },
      { k: 'locationId', label: 'Location', type: 'location' },
      { k: 'kind', label: 'Document type', type: 'select', options: S.DOC_KINDS, required: true },
      { k: 'title', label: 'Title (single file only)', type: 'text' },
      { k: 'notes', label: 'Notes', type: 'textarea', full: true },
    ];
    openForm({
      title: 'Upload documents & plans', fields, values: { kind: 'Floor plan', ...defaults }, wide: false,
      onSave: async v => { await addFiles(v.files, v); toast(`${v.files.length} file(s) saved offline`); },
    });
  }

  function editDocMeta(id) {
    const d0 = byId('docs', id);
    const fields = [
      { k: 'title', label: 'Title', type: 'text', required: true, full: true },
      { k: 'locationId', label: 'Location', type: 'location' },
      { k: 'kind', label: 'Document type', type: 'select', options: S.DOC_KINDS },
      { k: 'date', label: 'Date', type: 'date' },
      { k: 'notes', label: 'Notes', type: 'textarea', full: true },
    ];
    openForm({
      title: 'Edit document', fields, values: d0, wide: false,
      onSave: v => { upsert('docs', { ...d0, ...v }); },
      onDelete: () => deleteDoc(id),
    });
  }

  function applyPmTemplate(locId) {
    const run = id => {
      const existing = new Set(state.pm.filter(p => p.locationId === id).map(p => p.title));
      let n = 0;
      for (const [title, category, frequency, procedure] of S.PM_TEMPLATE) {
        if (existing.has(title)) continue;
        state.pm.push({ id: uid(), title, category, frequency, procedure, locationId: id, lastDone: '', nextDue: '', createdAt: new Date().toISOString() });
        n++;
      }
      save();
      return n;
    };
    if (locId) { toast(`Added ${run(locId)} PM tasks to ${locName(locId)}`); render(); return; }
    openForm({
      title: 'Apply standard PM program', wide: false,
      fields: [{ k: 'locationId', label: 'Location', type: 'location' }],
      extra: `<p class="muted small">Adds ${S.PM_TEMPLATE.length} typical café PM tasks (fire/life safety, plumbing, HVAC, ice & water, espresso, refrigeration, pest…). Leave location blank to apply to <b>all</b> locations. Duplicates are skipped. Set "Last completed" on each task to start its schedule. Frequencies are common practice — confirm with manufacturer, fire marshal, health dept, and lease.</p>`,
      onSave: v => {
        const ids = v.locationId ? [v.locationId] : state.locations.map(l => l.id);
        const n = ids.reduce((s, id) => s + run(id), 0);
        toast(`Added ${n} PM tasks`);
      },
    });
  }

  function pmDone(id) {
    const p = byId('pm', id);
    const d = today();
    upsert('pm', { ...p, lastDone: d, nextDue: addFreq(d, p.frequency), history: [...(p.history || []), d] });
    toast(`Marked done · next due ${fmtDate(addFreq(d, p.frequency))}`);
    render();
  }

  // ---------- views ----------
  function pageHead(title, actions = '', sub = '') {
    return `<header class="page-head"><div><h1>${title}</h1>${sub ? `<p class="muted">${sub}</p>` : ''}</div><div class="actions">${actions}</div></header>`;
  }

  function emptyState(msg, action = '') {
    return `<div class="empty"><p>${msg}</p>${action}</div>`;
  }

  function filterSelect(group, key, pairs, blank) {
    return selectHtml(`flt_${group}_${key}`, pairs, ui[group][key], blank, `data-change="filter" data-group="${group}" data-key="${key}"`);
  }
  function filterSearch(group, placeholder) {
    return `<input type="search" id="flt_${group}_q" placeholder="${esc(placeholder)}" value="${esc(ui[group].q)}" data-input="filter" data-group="${group}" data-key="q">`;
  }

  function stats() {
    const t = today();
    const openWO = state.workorders.filter(w => !isClosed(w));
    return {
      openWO,
      p1: openWO.filter(w => priId(w.priority) === 'P1'),
      overdueWO: openWO.filter(w => w.dueDate && w.dueDate < t),
      pmOverdue: state.pm.filter(p => p.nextDue && p.nextDue < t),
      pmSoon: state.pm.filter(p => p.nextDue && p.nextDue >= t && daysUntil(p.nextDue) <= 14),
      coi: state.vendors.filter(v => v.coiExp && !isInternal(v) && daysUntil(v.coiExp) <= 30),
      warranty: state.assets.filter(a => a.warrantyExp && daysUntil(a.warrantyExp) >= 0 && daysUntil(a.warrantyExp) <= 60),
      assetDue: state.assets.filter(a => [a.nextService, a.nextInspection].some(d => d && daysUntil(d) <= 14)),
      notVisited: state.locations.filter(l => isCafe(l) && l.status !== 'Closed' && (!lastVisit(l.id) || daysUntil(lastVisit(l.id)) < -30)),
      monthSpend: state.workorders.filter(w => (w.completedDate || '').slice(0, 7) === t.slice(0, 7)).reduce((s, w) => s + (+w.cost || 0), 0),
    };
  }

  function viewDashboard() {
    const st = stats();
    const kpi = (n, label, href, tone) => `<a class="kpi ${n ? tone : ''}" href="${href}"><b>${n}</b><span>${label}</span></a>`;
    const kpis = `<div class="kpis">
      ${kpi(st.openWO.length, 'Open work orders', '#/wo', 'blue')}
      ${kpi(st.p1.length, 'P1 emergencies', '#/wo', 'red')}
      ${kpi(st.overdueWO.length, 'Overdue work orders', '#/wo', 'red')}
      ${kpi(st.pmOverdue.length, 'PM overdue', '#/pm', 'red')}
      ${kpi(st.pmSoon.length, 'PM due ≤ 14 days', '#/pm', 'amber')}
      ${kpi(st.coi.length, 'Vendor COIs expiring', '#/vendors', 'amber')}
      ${kpi(st.assetDue.length, 'Asset inspections due', '#/search/', 'amber')}
      ${kpi(st.notVisited.length, 'Cafés not visited in 30 days', '#/visits', 'amber')}
      <div class="kpi"><b>${money(st.monthSpend) || '$0'}</b><span>Repair spend this month</span></div>
    </div>`;

    if (!state.locations.length) {
      return pageHead('Dashboard') + kpis + emptyState('No locations yet. Load the Alfred café list to get started.',
        `<button class="btn primary" data-action="seed">Load Alfred café list (24 cafés + HQ + warehouse)</button> <button class="btn" data-action="add-location">Add location</button>`);
    }

    const rows = sortedLocations().map(l => {
      const wo = st.openWO.filter(w => w.locationId === l.id);
      const od = wo.filter(w => w.dueDate && w.dueDate < today()).length;
      const pmo = st.pmOverdue.filter(p => p.locationId === l.id).length;
      return `<tr data-href="#/loc/${l.id}/overview"><td><a href="#/loc/${l.id}/overview">${esc(l.name)}</a><div class="muted small">${esc(l.city || '')}</div></td>
        <td class="num">${wo.length || ''}</td><td class="num">${od ? `<span class="badge red">${od}</span>` : ''}</td>
        <td class="num">${pmo ? `<span class="badge red">${pmo}</span>` : ''}</td>
        <td class="num">${state.assets.filter(a => a.locationId === l.id).length}</td><td class="nowrap">${lastVisit(l.id) ? esc(fmtDate(lastVisit(l.id))) : '<span class="muted">—</span>'}</td></tr>`;
    }).join('');

    const woList = [...st.p1, ...st.overdueWO.filter(w => priId(w.priority) !== 'P1')].slice(0, 10);
    const pmList = [...st.pmOverdue, ...st.pmSoon].sort((a, b) => a.nextDue.localeCompare(b.nextDue)).slice(0, 10);
    const alerts = [
      ...st.coi.map(v => `<li>📄 COI ${daysUntil(v.coiExp) < 0 ? 'expired' : 'expires'} – <a href="#" data-action="edit-vendor" data-id="${v.id}">${esc(v.company)}</a> ${dueBadge(v.coiExp)}</li>`),
      ...st.assetDue.map(a => `<li>🔧 <a href="#" data-action="edit-asset" data-id="${a.id}">${esc(a.name)}</a> <span class="muted">${esc(locName(a.locationId))}</span> ${dueBadge([a.nextService, a.nextInspection].filter(Boolean).sort()[0])}</li>`),
      ...st.warranty.map(a => `<li>🛡️ Warranty ending – <a href="#" data-action="edit-asset" data-id="${a.id}">${esc(a.name)}</a> <span class="muted">${esc(locName(a.locationId))}</span> ${dueBadge(a.warrantyExp)}</li>`),
    ];

    return pageHead('Dashboard', `<button class="btn" data-action="add-visit">📋 Site visit</button><button class="btn primary" data-action="add-wo">+ Work order</button>`, new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }))
      + kpis
      + `<div class="cols">
        <section class="card"><h2>Locations at a glance</h2><div class="table-wrap"><table class="table click">
          <thead><tr><th>Location</th><th class="num">Open WO</th><th class="num">Overdue</th><th class="num">PM overdue</th><th class="num">Assets</th><th>Last visit</th></tr></thead>
          <tbody>${rows}</tbody></table></div></section>
        <div class="stack">
          <section class="card"><h2>🚨 Needs attention</h2>${woList.length ? `<ul class="list">${woList.map(w => `<li>${priPill(w.priority)} <a href="#" data-action="edit-wo" data-id="${w.id}">${esc(w.number)} ${esc(w.title)}</a> <span class="muted">${esc(locName(w.locationId))}</span> ${dueBadge(w.dueDate)}</li>`).join('')}</ul>` : '<p class="muted">No emergencies or overdue work orders. 🎉</p>'}</section>
          <section class="card"><h2>🗓️ Preventive maintenance</h2>${pmList.length ? `<ul class="list">${pmList.map(p => `<li><a href="#" data-action="edit-pm" data-id="${p.id}">${esc(p.title)}</a> <span class="muted">${esc(locName(p.locationId))}</span> ${dueBadge(p.nextDue)} <button class="link" data-action="pm-done" data-id="${p.id}">✓ done</button></li>`).join('')}</ul>` : '<p class="muted">Nothing due in the next 14 days.</p>'}</section>
          <section class="card"><h2>⏰ Expirations & inspections</h2>${alerts.length ? `<ul class="list">${alerts.join('')}</ul>` : '<p class="muted">No COIs, warranties, or inspections coming due.</p>'}</section>
        </div></div>`;
  }

  function viewLocations() {
    const f = ui.locs;
    const q = f.q.toLowerCase();
    const list = sortedLocations().filter(l => (!f.region || l.region === f.region) && (!q || [l.name, l.city, l.address, l.storeNo, l.manager].join(' ').toLowerCase().includes(q)));
    const regions = [...new Set(state.locations.map(l => l.region).filter(Boolean))].sort().map(r => [r, r]);
    const cards = list.map(l => {
      const open = state.workorders.filter(w => w.locationId === l.id && !isClosed(w)).length;
      return `<a class="loc-card" href="#/loc/${l.id}/overview">
        <div class="loc-top"><h3>${esc(l.name)}</h3>${l.status && l.status !== 'Open' ? `<span class="pill gray">${esc(l.status)}</span>` : ''}</div>
        <p class="muted">${esc([l.address, l.city, l.zip].filter(Boolean).join(', ')) || '<i>Address not set</i>'}</p>
        <div class="loc-meta"><span>🧾 ${open} open WO</span><span>🔧 ${state.assets.filter(a => a.locationId === l.id).length} assets</span>${l.manager ? `<span>👤 ${esc(l.manager)}</span>` : ''}</div></a>`;
    }).join('');
    return pageHead(`Locations <span class="count">${state.locations.length}</span>`, `<button class="btn primary" data-action="add-location">+ Add location</button>`)
      + `<div class="filters">${filterSearch('locs', 'Search locations…')}${filterSelect('locs', 'region', regions, 'All regions')}</div>`
      + (cards ? `<div class="loc-grid">${cards}</div>` : emptyState(state.locations.length ? 'No matching locations.' : 'No locations yet.', state.locations.length ? '' : '<button class="btn primary" data-action="seed">Load Alfred café list</button>'));
  }

  function viewLocation(id, tab) {
    const l = byId('locations', id);
    if (!l) return emptyState('Location not found.', '<a class="btn" href="#/locations">Back to locations</a>');
    tab = tab || 'overview';
    const assets = state.assets.filter(a => a.locationId === id);
    const counts = Object.fromEntries(S.CATEGORIES.map(c => [c.id, assets.filter(a => a.category === c.id).length]));
    const addr = [l.address, l.city, 'CA', l.zip].filter(Boolean).join(', ');
    const mapUrl = l.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}` : '';
    const openWO = state.workorders.filter(w => w.locationId === id && !isClosed(w)).length;
    const pmOver = state.pm.filter(p => p.locationId === id && p.nextDue && p.nextDue < today()).length;

    const tabs = [['overview', '🏪 Overview'], ['wo', `🧾 Work orders${openWO ? ` (${openWO})` : ''}`], ['pm', `🗓️ PM${pmOver ? ` (${pmOver}!)` : ''}`], ['visits', '📋 Site visits'], ['docs', '📐 Plans & docs']];
    const sysOptions = S.CATEGORIES.map(c => [c.id, `${c.icon} ${c.label} (${counts[c.id]})`]);

    const head = `<div class="crumbs"><a href="#/locations">Locations</a> ›</div>`
      + pageHead(esc(l.name), `<button class="btn" data-action="edit-location" data-id="${l.id}">Edit info</button><button class="btn" data-action="print">Print</button><button class="btn" data-action="add-visit" data-loc="${l.id}">📋 Site visit</button><button class="btn primary" data-action="add-wo" data-loc="${l.id}">+ Work order</button>`,
        [addr ? (mapUrl ? `<a href="${mapUrl}" target="_blank" rel="noopener">📍 ${esc(addr)}</a>` : esc(addr)) : '', l.phone ? '☎ ' + telLink(l.phone) : ''].filter(Boolean).join(' · '))
      + `<nav class="tabs">${tabs.map(([t, label]) => `<a href="#/loc/${id}/${t}" class="${tab === t ? 'active' : ''}">${label}</a>`).join('')}
         <label class="sys-select">Facility system: ${selectHtml('sys', sysOptions, S.catById(tab) ? tab : '', '— Choose a system —', `data-change="goto-system" data-loc="${id}"`)}</label></nav>`;

    let body;
    if (tab === 'overview') body = locationOverview(l, counts);
    else if (tab === 'wo') body = woSection({ loc: id }, true);
    else if (tab === 'pm') body = pmSection({ loc: id }, true);
    else if (tab === 'docs') body = docsSection({ loc: id }, true);
    else if (tab === 'visits') body = visitsSection({ loc: id }, true);
    else if (S.catById(tab)) body = categorySection(l, S.catById(tab), assets.filter(a => a.category === tab));
    else body = emptyState('Unknown section');
    return head + body;
  }

  function locationOverview(l, counts) {
    const info = S.LOCATION_FIELDS.filter(f => l[f.k] && !['name', 'notes', 'maintResp', 'accessNotes', 'waterShutoff', 'gasShutoff', 'electricMain'].includes(f.k))
      .map(f => `<div><dt>${esc(f.label)}</dt><dd>${f.type === 'tel' ? telLink(l[f.k]) : f.type === 'email' ? mailLink(l[f.k]) : f.type === 'date' ? esc(fmtDate(l[f.k])) : esc(l[f.k])}</dd></div>`).join('');
    const critical = [['🚰 Water shutoff', l.waterShutoff], ['🔥 Gas shutoff', l.gasShutoff], ['⚡ Electrical main', l.electricMain]];
    const plans = state.docs.filter(d => d.locationId === l.id && /plan|as-built/i.test(d.kind));
    const text = (label, v) => v ? `<h3>${label}</h3><p class="pre">${esc(v)}</p>` : '';
    return `<div class="cols">
      <div class="stack">
        <section class="card"><h2>Facility systems</h2><p class="muted small">Pick a system to see every tracked item with make, model, serial, service history, and files.</p>
          <div class="sys-grid">${S.CATEGORIES.map(c => `<a href="#/loc/${l.id}/${c.id}" class="sys ${counts[c.id] ? '' : 'empty'}"><span class="ico">${c.icon}</span><span>${esc(c.label)}</span><b>${counts[c.id]}</b></a>`).join('')}</div></section>
        <section class="card"><h2>Emergency shutoffs</h2><dl class="info">${critical.map(([k, v]) => `<div><dt>${k}</dt><dd>${v ? esc(v) : '<span class="muted">Not recorded – <a href="#" data-action="edit-location" data-id="' + l.id + '">add</a></span>'}</dd></div>`).join('')}</dl></section>
      </div>
      <div class="stack">
        <section class="card"><h2>Location info</h2>${info ? `<dl class="info">${info}</dl>` : '<p class="muted">No details yet.</p>'}
          ${text('Lease maintenance responsibilities', l.maintResp)}${text('Access / parking / delivery', l.accessNotes)}${text('Notes', l.notes)}
          <button class="btn sm" data-action="edit-location" data-id="${l.id}">Edit info</button></section>
        <section class="card"><h2>Floor plans & life safety</h2>${plans.length ? `<ul class="list">${plans.map(d => `<li>${docIcon(d)} <a href="#" data-action="open-doc" data-id="${d.id}">${esc(d.title)}</a> <span class="muted">${esc(d.kind)}</span></li>`).join('')}</ul>` : '<p class="muted">No plans uploaded.</p>'}
          <button class="btn sm" data-action="upload-doc" data-loc="${l.id}">Upload plan</button></section>
      </div></div>`;
  }

  function categorySection(l, cat, assets) {
    const keyFields = cat.fields.filter(f => ['date', 'textarea'].indexOf(f.type) < 0).slice(0, 3);
    assets.sort((a, b) => (a.area || '').localeCompare(b.area || '') || a.name.localeCompare(b.name));
    const rows = assets.map(a => `<tr>
      <td><a href="#" data-action="edit-asset" data-id="${a.id}"><b>${esc(a.name)}</b></a><div class="muted small">${esc([a.type, a.area].filter(Boolean).join(' · '))}</div></td>
      <td>${esc([a.make, a.model].filter(Boolean).join(' '))}${a.serial ? `<div class="muted small">S/N ${esc(a.serial)}</div>` : ''}</td>
      <td class="small">${keyFields.map(f => a[f.k] ? `<div><span class="muted">${esc(f.label)}:</span> ${esc(a[f.k])}</div>` : '').join('')}</td>
      <td>${statusPill(a.status)}${a.condition ? `<div class="muted small">${esc(a.condition)}</div>` : ''}</td>
      <td>${dueBadge([a.nextService, a.nextInspection].filter(Boolean).sort()[0])}</td>
      <td class="row-actions"><button class="btn sm" data-action="add-wo" data-loc="${l.id}" data-cat="${cat.id}" data-asset="${a.id}" title="Create work order">+ WO</button><button class="btn sm" data-action="dup-asset" data-id="${a.id}" title="Duplicate">⧉</button></td></tr>`).join('');
    const openWO = state.workorders.filter(w => w.locationId === l.id && w.category === cat.id && !isClosed(w));
    return `<section class="card"><div class="card-head"><h2>${cat.icon} ${esc(cat.label)} <span class="count">${assets.length}</span></h2>
        <div class="actions"><button class="btn" data-action="add-wo" data-loc="${l.id}" data-cat="${cat.id}">+ Work order</button><button class="btn primary" data-action="add-asset" data-loc="${l.id}" data-cat="${cat.id}">+ Add ${esc(cat.label.toLowerCase())} item</button></div></div>
      ${rows ? `<div class="table-wrap"><table class="table"><thead><tr><th>Item</th><th>Make / model</th><th>Specs</th><th>Status</th><th>Next service</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`
        : emptyState(`No ${esc(cat.label.toLowerCase())} tracked at this location yet.`, `<button class="btn primary" data-action="add-asset" data-loc="${l.id}" data-cat="${cat.id}">+ Add first item</button>`)}
      </section>
      ${openWO.length ? `<section class="card"><h2>Open work orders – ${esc(cat.label)}</h2>${woTable(openWO, false)}</section>` : ''}`;
  }

  // --- work orders ---
  function filteredWOs(f) {
    const q = (f.q || '').toLowerCase();
    const t = today();
    return state.workorders.filter(w =>
      (!f.loc || w.locationId === f.loc) && (!f.pri || priId(w.priority) === f.pri) && (!f.cat || w.category === f.cat)
      && (f.status === 'all' || !f.status ? true : f.status === 'open' ? !isClosed(w) : f.status === 'closed' ? isClosed(w) : f.status === 'overdue' ? !isClosed(w) && w.dueDate && w.dueDate < t : w.status === f.status)
      && (!q || [w.number, w.title, w.description, w.resolution, vendorName(w.vendorId), assetName(w.assetId), w.vendorTicket, w.po, w.invoice].join(' ').toLowerCase().includes(q))
    ).sort((a, b) => (isClosed(a) - isClosed(b)) || priId(a.priority).localeCompare(priId(b.priority)) || (a.dueDate || '9').localeCompare(b.dueDate || '9'));
  }

  function woTable(list, showLoc = true) {
    if (!list.length) return emptyState('No work orders match.');
    return `<div class="table-wrap"><table class="table"><thead><tr><th>#</th><th>Pri</th><th>Issue</th>${showLoc ? '<th>Location</th>' : ''}<th>Vendor</th><th>Status</th><th>Due</th><th class="num">Cost</th></tr></thead><tbody>${list.map(w => `<tr>
      <td class="nowrap"><a href="#" data-action="edit-wo" data-id="${w.id}">${esc(w.number)}</a></td><td>${priPill(w.priority)}</td>
      <td><a href="#" data-action="edit-wo" data-id="${w.id}">${esc(w.title)}</a><div class="muted small">${esc([catLabel(w.category), assetName(w.assetId)].filter(Boolean).join(' · '))}</div></td>
      ${showLoc ? `<td>${esc(locName(w.locationId))}</td>` : ''}<td>${esc(vendorName(w.vendorId))}</td>
      <td>${selectHtml('st_' + w.id, S.WO_STATUSES.map(s => [s, s]), w.status, '—', `class="sm status-select" data-change="wo-status" data-id="${w.id}"`)}</td>
      <td>${dueBadge(w.dueDate, isClosed(w))}</td><td class="num">${money(w.cost || w.estimate)}</td></tr>`).join('')}</tbody></table></div>`;
  }

  function woSection(fixed = {}, inLocation = false) {
    const f = { ...ui.wo, ...fixed };
    const list = filteredWOs(f);
    const statusPairs = [['open', 'Open (all active)'], ['overdue', 'Overdue'], ['closed', 'Completed / closed'], ['all', 'All'], ...S.WO_STATUSES.map(s => [s, s])];
    const total = list.reduce((s, w) => s + (+w.cost || 0), 0);
    return `<div class="filters">${filterSearch('wo', 'Search # / issue / vendor / PO…')}
      ${inLocation ? '' : filterSelect('wo', 'loc', locationPairs(), 'All locations')}
      ${selectHtml('flt_wo_status', statusPairs, ui.wo.status, 'Any status', 'data-change="filter" data-group="wo" data-key="status"')}
      ${filterSelect('wo', 'pri', S.WO_PRIORITIES.map(p => [p.id, p.label]), 'Any priority')}
      ${filterSelect('wo', 'cat', categoryPairs(), 'All systems')}
      ${inLocation ? `<button class="btn primary" data-action="add-wo" data-loc="${fixed.loc}">+ Work order</button>` : ''}</div>
      <p class="muted small">${list.length} work order(s)${total ? ` · ${money(total)} actual cost` : ''}</p>${woTable(list, !inLocation)}`;
  }

  function viewWO() {
    return pageHead('Work orders', `<button class="btn" data-action="export-csv" data-what="workorders">Export CSV</button><button class="btn primary" data-action="add-wo">+ New work order</button>`) + woSection();
  }

  // --- PM ---
  function pmSection(fixed = {}, inLocation = false) {
    const f = { ...ui.pm, ...fixed };
    const q = (f.q || '').toLowerCase();
    const t = today();
    const list = state.pm.filter(p => (!f.loc || p.locationId === f.loc) && (!f.cat || p.category === f.cat)
      && (f.due === 'all' || (f.due === 'overdue' && p.nextDue && p.nextDue < t) || (f.due === '30' && p.nextDue && daysUntil(p.nextDue) <= 30) || (f.due === 'unscheduled' && !p.nextDue))
      && (!q || [p.title, p.procedure, vendorName(p.vendorId)].join(' ').toLowerCase().includes(q)))
      .sort((a, b) => (a.nextDue || '9999').localeCompare(b.nextDue || '9999') || a.title.localeCompare(b.title));
    const rows = list.map(p => `<tr>
      <td><a href="#" data-action="edit-pm" data-id="${p.id}">${esc(p.title)}</a><div class="muted small">${esc([catLabel(p.category), assetName(p.assetId)].filter(Boolean).join(' · '))}</div></td>
      ${inLocation ? '' : `<td>${esc(locName(p.locationId))}</td>`}<td>${esc(p.frequency)}</td><td>${esc(vendorName(p.vendorId))}</td>
      <td>${p.lastDone ? esc(fmtDate(p.lastDone)) : '<span class="muted">—</span>'}</td><td>${p.nextDue ? dueBadge(p.nextDue) : '<span class="muted">Unscheduled</span>'}</td>
      <td class="row-actions"><button class="btn sm" data-action="pm-done" data-id="${p.id}" title="Mark completed today">✓ Done</button><button class="btn sm" data-action="pm-wo" data-id="${p.id}" title="Create a work order for this task">+ WO</button></td></tr>`).join('');
    return `<div class="filters">${filterSearch('pm', 'Search tasks…')}
      ${inLocation ? '' : filterSelect('pm', 'loc', locationPairs(), 'All locations')}
      ${filterSelect('pm', 'cat', categoryPairs(), 'All systems')}
      ${selectHtml('flt_pm_due', [['overdue', 'Overdue'], ['30', 'Due ≤ 30 days'], ['unscheduled', 'Unscheduled']], ui.pm.due === 'all' ? '' : ui.pm.due, 'All tasks', 'data-change="filter" data-group="pm" data-key="due"')}
      ${inLocation ? `<button class="btn" data-action="apply-pm" data-loc="${fixed.loc}">Add standard PM program</button><button class="btn primary" data-action="add-pm" data-loc="${fixed.loc}">+ PM task</button>` : ''}</div>
      ${rows ? `<div class="table-wrap"><table class="table"><thead><tr><th>Task</th>${inLocation ? '' : '<th>Location</th>'}<th>Frequency</th><th>Vendor</th><th>Last done</th><th>Next due</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`
        : emptyState('No preventive maintenance tasks match.', `<button class="btn primary" data-action="apply-pm" ${fixed.loc ? `data-loc="${fixed.loc}"` : ''}>Add standard café PM program</button>`)}`;
  }

  function viewPM() {
    return pageHead('Preventive maintenance', `<button class="btn" data-action="export-csv" data-what="pm">Export CSV</button><button class="btn" data-action="apply-pm">Apply standard program</button><button class="btn primary" data-action="add-pm">+ PM task</button>`,
      'Recurring inspections and service. Hit ✓ Done to log completion and roll the next due date forward.') + pmSection();
  }

  // --- vendors ---
  function viewVendors() {
    const f = ui.vendors;
    const q = f.q.toLowerCase();
    const list = state.vendors.filter(v => (!f.trade || v.trade === f.trade || v.trade2 === f.trade) && (!f.kind || (f.kind === 'internal' ? isInternal(v) : !isInternal(v)))
      && (!q || [v.company, v.contact, v.trade, v.trade2, v.phone, v.email, v.notes, v.accountNo].join(' ').toLowerCase().includes(q)))
      .sort((a, b) => isInternal(b) - isInternal(a) || (b.preferred === 'Yes') - (a.preferred === 'Yes') || a.company.localeCompare(b.company));
    const trades = [...new Set(state.vendors.flatMap(v => [v.trade, v.trade2]).filter(Boolean))].sort().map(t => [t, t]);
    const cards = list.map(v => {
      const served = (v.locations || []).length;
      const p = vendorPerf(v.id, addDays(today(), -365));
      const openWO = p.open;
      const perf = p.total ? `<div class="perf small">12 mo: ${p.total} WOs · ${money(p.spend) || '$0'} · avg ${fmtDays(p.avgComplete)} to complete${p.onTime != null ? ` · ${p.onTime}% on time` : ''}</div>` : '';
      return `<article class="vendor-card${isInternal(v) ? ' internal' : ''}">
        <div class="loc-top"><h3><a href="#" data-action="edit-vendor" data-id="${v.id}">${v.preferred === 'Yes' ? '⭐ ' : ''}${esc(v.company)}</a></h3>${v.rating ? `<span class="muted small">${esc(v.rating.split(' – ')[0])}/5</span>` : ''}</div>
        <p class="muted">${isInternal(v) ? '<span class="pill blue">Alfred team</span> ' : ''}${esc([v.trade, v.trade2].filter(Boolean).join(' · '))}</p>
        <ul class="kv">
          ${v.contact ? `<li>👤 ${esc(v.contact)}</li>` : ''}${v.phone ? `<li>☎ ${telLink(v.phone)}</li>` : ''}
          ${v.emergencyPhone ? `<li>🚨 ${telLink(v.emergencyPhone)} <span class="muted">after-hours</span></li>` : ''}${v.email ? `<li>✉ ${mailLink(v.email)}</li>` : ''}
          ${v.accountNo ? `<li>🧾 Acct ${esc(v.accountNo)}</li>` : ''}${v.responseTime ? `<li>⏱ ${esc(v.responseTime)} response</li>` : ''}
        </ul>
        ${perf}<div class="loc-meta">${isInternal(v) ? '' : v.coiExp ? `<span>COI ${dueBadge(v.coiExp)}</span>` : '<span class="badge amber">No COI on file</span>'}<span>${served ? served + ' locations' : 'All / unassigned'}</span>${openWO ? `<span>${openWO} open WO</span>` : ''}</div>
      </article>`;
    }).join('');
    return pageHead(`Team & vendors <span class="count">${state.vendors.length}</span>`, `<button class="btn" data-action="export-csv" data-what="vendors">Export CSV</button><button class="btn primary" data-action="add-vendor">+ Add team member / vendor</button>`)
      + `<div class="filters">${filterSearch('vendors', 'Search company, contact, phone…')}${filterSelect('vendors', 'kind', [['internal', 'Alfred team'], ['external', 'External vendors']], 'Team + vendors')}${filterSelect('vendors', 'trade', trades, 'All trades')}</div>`
      + (cards ? `<div class="loc-grid">${cards}</div>` : emptyState('No one here yet. Add your internal facilities team and beverage equipment tech (so you can assign them work orders), plus HVAC, plumbing, electrical, fire protection, cleaning, signage and other vendors.', '<button class="btn primary" data-action="add-vendor">+ Add team member / vendor</button>'));
  }

  // --- documents ---
  function docsSection(fixed = {}, inLocation = false) {
    const f = { ...ui.docs, ...fixed };
    const q = (f.q || '').toLowerCase();
    const list = state.docs.filter(d => (!f.loc || d.locationId === f.loc) && (!f.kind || d.kind === f.kind)
      && (!q || [d.title, d.kind, d.notes, d.fileName].join(' ').toLowerCase().includes(q)))
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const cards = list.map(d => `<article class="doc-card">
      <a href="#" class="thumb" data-action="open-doc" data-id="${d.id}">${isImage(d) ? `<img data-thumb="${esc(d.fileId)}" alt="">` : `<span>${docIcon(d)}</span>`}</a>
      <div><a href="#" data-action="open-doc" data-id="${d.id}"><b>${esc(d.title)}</b></a>
        <div class="muted small">${esc(d.kind)}${inLocation ? '' : ' · ' + esc(d.locationId ? locName(d.locationId) : 'All locations')}</div>
        <div class="muted small">${esc(fmtDate(d.date))} · ${fmtSize(d.size || 0)} ${d.ownerType ? '· attached to ' + esc(d.ownerType) : ''}</div>
        <button class="link" data-action="edit-doc" data-id="${d.id}">edit</button></div></article>`).join('');
    return `<div class="filters">${filterSearch('docs', 'Search documents…')}
      ${inLocation ? '' : filterSelect('docs', 'loc', locationPairs(), 'All locations')}
      ${filterSelect('docs', 'kind', S.DOC_KINDS.map(k => [k, k]), 'All types')}
      <button class="btn primary" data-action="upload-doc" ${fixed.loc ? `data-loc="${fixed.loc}"` : ''}>⬆ Upload</button></div>
      ${cards ? `<div class="doc-grid">${cards}</div>` : emptyState('No documents yet. Upload floor plans, life safety / evacuation plans, permits, manuals, warranties, and photos — they are stored on this device and open offline.')}`;
  }

  function viewDocs() {
    return pageHead('Plans & documents', '', 'Floor plans, life safety plans, permits, manuals, warranties, photos — available offline.') + docsSection();
  }

  // --- search ---
  function viewSearch(q) {
    q = (q || '').trim();
    const ql = q.toLowerCase();
    const t = today();
    const head = pageHead('Search', '', q ? `Results for “${esc(q)}”` : 'Assets with service or inspection due in the next 14 days');
    const match = obj => Object.values(obj).some(v => typeof v === 'string' && v.toLowerCase().includes(ql));
    const assets = q ? state.assets.filter(match) : state.assets.filter(a => [a.nextService, a.nextInspection].some(d => d && daysUntil(d) <= 14));
    const sections = [];
    if (assets.length) sections.push(`<section class="card"><h2>Assets (${assets.length})</h2><ul class="list">${assets.slice(0, 200).map(a => `<li>${(S.catById(a.category) || {}).icon || ''} <a href="#" data-action="edit-asset" data-id="${a.id}">${esc(a.name)}</a> <span class="muted">${esc([a.make, a.model, a.serial && 'S/N ' + a.serial].filter(Boolean).join(' '))} · <a href="#/loc/${a.locationId}/${a.category}">${esc(locName(a.locationId))}</a></span> ${q ? '' : dueBadge([a.nextService, a.nextInspection].filter(Boolean).sort()[0])}</li>`).join('')}</ul></section>`);
    if (q) {
      const locs = state.locations.filter(match);
      const vendors = state.vendors.filter(match);
      const wos = state.workorders.filter(match);
      const pms = state.pm.filter(match);
      const docs = state.docs.filter(match);
      if (locs.length) sections.push(`<section class="card"><h2>Locations (${locs.length})</h2><ul class="list">${locs.map(l => `<li><a href="#/loc/${l.id}/overview">${esc(l.name)}</a> <span class="muted">${esc(l.city || '')}</span></li>`).join('')}</ul></section>`);
      if (vendors.length) sections.push(`<section class="card"><h2>Vendors (${vendors.length})</h2><ul class="list">${vendors.map(v => `<li><a href="#" data-action="edit-vendor" data-id="${v.id}">${esc(v.company)}</a> <span class="muted">${esc(v.trade || '')}</span> ${telLink(v.phone)}</li>`).join('')}</ul></section>`);
      if (wos.length) sections.push(`<section class="card"><h2>Work orders (${wos.length})</h2>${woTable(wos.slice(0, 200))}</section>`);
      if (pms.length) sections.push(`<section class="card"><h2>PM tasks (${pms.length})</h2><ul class="list">${pms.map(p => `<li><a href="#" data-action="edit-pm" data-id="${p.id}">${esc(p.title)}</a> <span class="muted">${esc(locName(p.locationId))}</span> ${dueBadge(p.nextDue)}</li>`).join('')}</ul></section>`);
      if (docs.length) sections.push(`<section class="card"><h2>Documents (${docs.length})</h2><ul class="list">${docs.map(d => `<li>${docIcon(d)} <a href="#" data-action="open-doc" data-id="${d.id}">${esc(d.title)}</a> <span class="muted">${esc(d.kind)} · ${esc(locName(d.locationId))}</span></li>`).join('')}</ul></section>`);
    }
    void t;
    return head + `<form class="filters" data-form="search"><input type="search" name="q" id="search-page-q" value="${esc(q)}" placeholder="Serial #, model, vendor, filter part #, WO #…"><button class="btn primary">Search</button></form>`
      + (sections.join('') || emptyState(q ? 'Nothing found.' : 'Nothing due. Search above for any serial #, model, vendor, part #…'));
  }

  // --- settings / data ---
  function viewSettings() {
    const counts = ['locations', 'assets', 'workorders', 'pm', 'vendors', 'visits', 'docs'].map(k => `<li><b>${state[k].length}</b> ${k === 'pm' ? 'PM tasks' : k === 'workorders' ? 'work orders' : k}</li>`).join('');
    return pageHead('Settings & data') + `<div class="cols">
      <div class="stack">
      <section class="card"><h2>Backup & transfer</h2>
        <p>All data is stored <b>only in this browser on this device</b> — it works offline, but is not synced. Export a backup regularly (e.g. weekly to Google Drive) and import it on another device to move data.</p>
        <ul class="inline-stats">${counts}</ul>
        <p class="muted small" id="storage-est"></p>
        <div class="btn-row"><button class="btn primary" data-action="export-json" data-files="1">⬇ Full backup (with files)</button><button class="btn" data-action="export-json">⬇ Backup (data only)</button>
        <label class="btn">⬆ Restore backup<input type="file" accept=".json,application/json" hidden data-change="import-json"></label></div>
        <h3>Spreadsheet exports (CSV)</h3>
        <div class="btn-row">${['locations', 'assets', 'workorders', 'pm', 'vendors', 'visits'].map(w => `<button class="btn sm" data-action="export-csv" data-what="${w}">${w}</button>`).join('')}</div>
      </section>
      <section class="card"><h2>Install & offline</h2>
        <p>Status: <b id="net-status-2">${navigator.onLine ? 'Online' : 'Offline'}</b> · Offline cache: <b>${'serviceWorker' in navigator && navigator.serviceWorker.controller ? 'active' : location.protocol === 'file:' ? 'n/a (opened as a file — still works offline)' : 'not yet active (reload once)'}</b></p>
        <p class="muted small">On Chromebook / Chrome: click the install icon in the address bar (or ⋮ → Cast, save and share → Install page as app). On iPhone: Share → Add to Home Screen. Once installed it opens like a regular app and works without signal.</p>
        <button class="btn" data-action="persist">Ask browser to keep data permanently</button>
      </section></div>
      <div class="stack">
      <section class="card"><h2>Appearance</h2>
        ${selectHtml('theme', [['light', 'Light'], ['dark', 'Dark']], ui.theme, 'Match system', 'data-change="theme"')}</section>
      <section class="card"><h2>Starter data</h2>
        <p class="muted small">Adds Alfred's 24 California cafés (from locations.alfred.la) plus HQ (Van Nuys) and Warehouse. Existing locations are kept; blank address / phone fields are filled in.</p>
        <button class="btn" data-action="seed">Load / update Alfred café list</button>
        <button class="btn" data-action="apply-pm">Apply standard PM program…</button></section>
      <section class="card danger-zone"><h2>Danger zone</h2><p class="muted small">Erase everything stored by this app on this device.</p><button class="btn danger" data-action="reset">Erase all data</button></section>
      </div></div>`;
  }

  // --- shared: work-order creation & metrics ---
  function createWO(rec) {
    const p = S.WO_PRIORITIES.find(x => x.label === rec.priority) || S.WO_PRIORITIES[2];
    return upsert('workorders', {
      status: 'Open', woType: 'Repair', reportedDate: today(), ...rec, priority: p.label,
      dueDate: rec.dueDate || addDays(rec.reportedDate || today(), Math.floor(p.hours / 24)),
      number: 'WO-' + String(state.seq.wo++).padStart(4, '0'),
      history: [{ at: new Date().toISOString(), text: rec.historyText || 'Created' }],
    });
  }

  const daysBetween = (a, b) => Math.max(0, Math.round((parseD(b) - parseD(a)) / 86400000));
  const avg = arr => arr.length ? arr.reduce((x, y) => x + y, 0) / arr.length : null;
  const fmtDays = n => n == null ? '—' : n < 1 ? '< 1 d' : n.toFixed(1) + ' d';

  function vendorPerf(vendorId, since) {
    const wos = state.workorders.filter(w => w.vendorId === vendorId && (!since || (w.reportedDate || '') >= since));
    const done = wos.filter(w => w.completedDate && w.reportedDate && S.WO_CLOSED.slice(0, 2).includes(w.status));
    const withDue = done.filter(w => w.dueDate);
    return {
      total: wos.length, open: wos.filter(w => !isClosed(w)).length, completed: done.length,
      avgResponse: avg(wos.filter(w => w.arrivedDate && w.reportedDate).map(w => daysBetween(w.reportedDate, w.arrivedDate))),
      avgComplete: avg(done.map(w => daysBetween(w.reportedDate, w.completedDate))),
      onTime: withDue.length ? Math.round(withDue.filter(w => w.completedDate <= w.dueDate).length / withDue.length * 100) : null,
      spend: wos.reduce((t, w) => t + (+w.cost || 0), 0),
    };
  }

  // --- site visits ---
  const isCafe = l => !/Headquarters|Warehouse/.test(l.format || '');
  const lastVisit = locId => state.visits.filter(v => v.locationId === locId).map(v => v.date).sort().pop() || '';
  function visitScore(v) {
    const scored = (v.items || []).filter(i => ['pass', 'attn', 'fail'].includes(i.result));
    return scored.length ? Math.round(scored.filter(i => i.result === 'pass').length / scored.length * 100) : null;
  }
  const scoreBadge = n => n == null ? '<span class="muted">—</span>' : `<span class="badge ${n >= 90 ? 'green' : n >= 75 ? 'amber' : 'red'}">${n}%</span>`;

  function editVisit(id, defaults = {}) {
    const v = id ? byId('visits', id) : { date: today(), items: [], ...defaults };
    const prev = Object.fromEntries((v.items || []).map(i => [i.key, i]));
    const head = [
      { k: 'locationId', label: 'Location', type: 'location', required: true },
      { k: 'date', label: 'Visit date', type: 'date', required: true },
      { k: 'by', label: 'Visited by', type: 'text' },
      { k: 'mod', label: 'Manager on duty', type: 'text' },
      { k: 'cleanliness', label: 'Cleanliness rating', type: 'select', options: ['5 – Excellent', '4 – Good', '3 – Acceptable', '2 – Below standard', '1 – Unacceptable'] },
    ];
    let lastArea = '';
    const rows = S.VISIT_CHECKLIST.map(([area, label], i) => {
      const key = 'c' + i, r = prev[key] || {};
      const areaRow = area !== lastArea ? `<tr class="area-row"><th colspan="3">${esc(area)}</th></tr>` : '';
      lastArea = area;
      const opt = (val, txt, cls, title) => `<label class="seg ${cls}" title="${title}"><input type="radio" name="${key}" value="${val}"${r.result === val ? ' checked' : ''}><span>${txt}</span></label>`;
      return areaRow + `<tr><td>${esc(label)}</td><td class="nowrap">${opt('pass', '✓', 'ok', 'Good')}${opt('attn', '!', 'attn', 'Needs attention')}${opt('fail', '✗', 'bad', 'Failed / broken')}${opt('na', 'N/A', 'na', 'Not applicable')}</td>
        <td><input name="n_${key}" value="${esc(r.note || '')}" placeholder="Note"></td></tr>`;
    }).join('');
    const html = `<form id="modal-form" novalidate>
      <div class="form-grid">${head.map(f => fieldHtml(f, v[f.k], {}, v)).join('')}</div>
      <div class="btn-row" style="margin:14px 0 6px"><button type="button" class="btn sm" data-visit="allpass">Mark all unanswered ✓</button><span class="muted small">✓ good · ! needs attention · ✗ failed</span></div>
      <div class="table-wrap"><table class="table checklist">${rows}</table></div>
      <label class="field full" style="margin-top:12px"><span>Visit notes</span><textarea name="notes" rows="3">${esc(v.notes || '')}</textarea></label>
      <label class="check" style="margin-top:10px"><input type="checkbox" name="makeWO" checked> Create work orders for ✗ (P2) and ! (P3) items that don't have one yet</label>
      <p class="form-error" hidden></p>
      <div class="modal-actions">${id ? '<button type="button" class="btn danger" data-visit="delete">Delete</button>' : ''}<span class="spacer"></span>
        <button type="button" class="btn" data-action="close-modal">Cancel</button><button type="submit" class="btn primary">Save visit</button></div></form>`;
    const d = openModal(id ? 'Site visit' : 'New site visit', html, true);
    const form = $('#modal-form', d);
    form.addEventListener('click', e => {
      const b = e.target.closest('[data-visit]');
      if (!b) return;
      if (b.dataset.visit === 'allpass') S.VISIT_CHECKLIST.forEach((_, i) => { if (!$(`input[name=c${i}]:checked`, form)) $(`input[name=c${i}][value=pass]`, form).checked = true; });
      if (b.dataset.visit === 'delete' && confirm('Delete this visit? Work orders it created are kept.')) { remove('visits', id); closeModal(); render(); }
    });
    form.addEventListener('submit', e => {
      e.preventDefault();
      const err = $('.form-error', form);
      const hv = collect(form, head);
      if (!hv.locationId || !hv.date) { err.hidden = false; err.textContent = 'Location and date are required.'; return; }
      const items = S.VISIT_CHECKLIST.map(([area, label, cat], i) => {
        const key = 'c' + i, r = $(`input[name=${key}]:checked`, form);
        return { key, area, label, cat, result: r ? r.value : '', note: form.elements['n_' + key].value.trim(), woId: (prev[key] || {}).woId || '' };
      });
      let made = 0;
      if (form.elements.makeWO.checked) {
        for (const it of items) {
          if (!['fail', 'attn'].includes(it.result) || (it.woId && byId('workorders', it.woId))) continue;
          const wo = createWO({
            title: it.label + (it.note ? ' – ' + it.note : ''), locationId: hv.locationId, category: it.cat, reportedBy: hv.by, reportedDate: hv.date,
            priority: S.WO_PRIORITIES[it.result === 'fail' ? 1 : 2].label, description: `From site visit ${fmtDate(hv.date)} (${it.area}).${it.note ? '\n' + it.note : ''}`,
            historyText: 'Created from site visit',
          });
          it.woId = wo.id;
          made++;
        }
      }
      upsert('visits', { ...v, ...hv, notes: form.elements.notes.value.trim(), items });
      closeModal();
      toast(`Visit saved${made ? ` · ${made} work order(s) created` : ''}`);
      render();
    });
  }

  function visitsSection(fixed = {}, inLocation = false) {
    const f = { ...ui.visits, ...fixed };
    const list = state.visits.filter(v => !f.loc || v.locationId === f.loc).sort((a, b) => b.date.localeCompare(a.date));
    const rows = list.map(v => {
      const issues = (v.items || []).filter(i => ['fail', 'attn'].includes(i.result));
      return `<tr><td class="nowrap"><a href="#" data-action="edit-visit" data-id="${v.id}">${esc(fmtDate(v.date))}</a></td>${inLocation ? '' : `<td>${esc(locName(v.locationId))}</td>`}
        <td>${esc(v.by || '')}</td><td>${scoreBadge(visitScore(v))}</td><td>${esc((v.cleanliness || '').split(' – ')[0] ? v.cleanliness : '')}</td>
        <td>${issues.length ? issues.slice(0, 4).map(i => `<div class="small">${i.result === 'fail' ? '✗' : '!'} ${esc(i.label)}${i.woId && byId('workorders', i.woId) ? ` <a href="#" data-action="edit-wo" data-id="${i.woId}">${esc(byId('workorders', i.woId).number)}</a>` : ''}</div>`).join('') + (issues.length > 4 ? `<div class="muted small">+${issues.length - 4} more</div>` : '') : '<span class="muted">None</span>'}</td></tr>`;
    }).join('');
    return `<div class="filters">${inLocation ? '' : filterSelect('visits', 'loc', locationPairs(), 'All locations')}
      <button class="btn primary" data-action="add-visit" ${fixed.loc ? `data-loc="${fixed.loc}"` : ''}>+ Start site visit</button></div>
      ${rows ? `<div class="table-wrap"><table class="table"><thead><tr><th>Date</th>${inLocation ? '' : '<th>Location</th>'}<th>By</th><th>Score</th><th>Cleanliness</th><th>Issues found</th></tr></thead><tbody>${rows}</tbody></table></div>`
        : emptyState('No site visits logged yet. Walk the café with the checklist — anything marked ✗ or ! becomes a work order automatically.')}`;
  }

  function viewVisits() {
    const cov = sortedLocations().filter(isCafe).map(l => ({ l, d: lastVisit(l.id) })).sort((a, b) => (a.d || '').localeCompare(b.d || ''));
    const covRows = cov.map(({ l, d }) => `<tr><td><a href="#/loc/${l.id}/visits">${esc(l.name)}</a><div class="muted small">${esc(l.region || '')}</div></td>
      <td>${d ? esc(fmtDate(d)) : '<span class="muted">Never</span>'}</td><td>${!d ? '<span class="badge red">Never</span>' : daysUntil(d) < -30 ? `<span class="badge red">${-daysUntil(d)}d ago</span>` : `<span class="badge">${-daysUntil(d)}d ago</span>`}</td>
      <td class="row-actions"><button class="btn sm" data-action="add-visit" data-loc="${l.id}">Visit</button></td></tr>`).join('');
    return pageHead('Site visits', `<button class="btn" data-action="export-csv" data-what="visits">Export CSV</button>`, 'Walkthrough checklist for proactive maintenance & cleanliness. Longest-unvisited cafés are listed first.')
      + `<div class="cols"><section class="card"><h2>Visit log</h2>${visitsSection()}</section>
        <section class="card"><h2>Visit coverage</h2>${covRows ? `<div class="table-wrap"><table class="table"><thead><tr><th>Café</th><th>Last visit</th><th></th><th></th></tr></thead><tbody>${covRows}</tbody></table></div>` : emptyState('No cafés yet.')}</section></div>`;
  }

  // --- reports ---
  function rangeStart(r) {
    const t = today();
    if (r === 'ytd') return t.slice(0, 4) + '-01-01';
    if (r === 'all') return '';
    return addDays(t, -(+r || 90));
  }

  function viewReports() {
    const r = ui.reports.range;
    const since = rangeStart(r);
    const ytd = today().slice(0, 4) + '-01-01';
    const woDate = w => w.completedDate || w.reportedDate || '';
    const inRange = state.workorders.filter(w => !since || woDate(w) >= since);
    const sum = arr => arr.reduce((t, w) => t + (+w.cost || 0), 0);
    const totalSpend = sum(inRange);
    const pct = (n, d) => d ? Math.round(n / d * 100) + '%' : '—';
    const table = (headCols, rows, empty) => rows.length ? `<div class="table-wrap"><table class="table"><thead><tr>${headCols.map(h => `<th${h.startsWith('#') ? ' class="num"' : ''}>${esc(h.replace(/^#/, ''))}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>` : `<p class="muted">${empty}</p>`;

    const locRows = sortedLocations().map(l => {
      const w = inRange.filter(x => x.locationId === l.id);
      const ytdSpend = sum(state.workorders.filter(x => x.locationId === l.id && woDate(x) >= ytd));
      const b = +l.annualBudget || 0;
      return { l, n: w.length, spend: sum(w), ytdSpend, b };
    }).filter(x => x.n || x.b).sort((a, b) => b.spend - a.spend)
      .map(x => `<tr><td><a href="#/loc/${x.l.id}/wo">${esc(x.l.name)}</a></td><td class="num">${x.n}</td><td class="num">${money(x.spend) || '$0'}</td><td class="num">${money(x.ytdSpend) || '$0'}</td><td class="num">${x.b ? money(x.b) : '<span class="muted">set in location</span>'}</td>
        <td class="num">${x.b ? `<span class="badge ${x.ytdSpend > x.b ? 'red' : x.ytdSpend > x.b * 0.8 ? 'amber' : ''}">${pct(x.ytdSpend, x.b)}</span>` : ''}</td></tr>`);

    const catRows = S.CATEGORIES.map(c => ({ c, w: inRange.filter(x => x.category === c.id) })).filter(x => x.w.length).sort((a, b) => sum(b.w) - sum(a.w))
      .map(({ c, w }) => `<tr><td>${c.icon} ${esc(c.label)}</td><td class="num">${w.length}</td><td class="num">${money(sum(w)) || '$0'}</td><td class="num">${pct(sum(w), totalSpend)}</td></tr>`);

    const typeRows = S.WO_TYPES.map(t => ({ t, w: inRange.filter(x => (x.woType || 'Repair') === t) })).filter(x => x.w.length)
      .map(({ t, w }) => `<tr><td>${esc(t)}</td><td class="num">${w.length}</td><td class="num">${money(sum(w)) || '$0'}</td></tr>`);

    const vRows = state.vendors.map(v => ({ v, p: vendorPerf(v.id, since) })).filter(x => x.p.total).sort((a, b) => b.p.spend - a.p.spend)
      .map(({ v, p }) => `<tr><td><a href="#" data-action="edit-vendor" data-id="${v.id}">${isInternal(v) ? '👷 ' : ''}${esc(v.company)}</a><div class="muted small">${esc(v.trade || '')}</div></td>
        <td class="num">${p.total}</td><td class="num">${p.open}</td><td class="num">${fmtDays(p.avgResponse)}</td><td class="num">${fmtDays(p.avgComplete)}</td>
        <td class="num">${p.onTime == null ? '—' : `<span class="badge ${p.onTime >= 90 ? 'green' : p.onTime >= 70 ? 'amber' : 'red'}">${p.onTime}%</span>`}</td><td class="num">${money(p.spend) || '$0'}</td></tr>`);

    const byAsset = {};
    inRange.filter(w => w.assetId).forEach(w => { (byAsset[w.assetId] = byAsset[w.assetId] || []).push(w); });
    const recurAssets = Object.entries(byAsset).filter(([, w]) => w.length >= 3).sort((a, b) => b[1].length - a[1].length)
      .map(([id, w]) => `<tr><td><a href="#" data-action="edit-asset" data-id="${id}">${esc(assetName(id))}</a></td><td>${esc(locName((byId('assets', id) || {}).locationId))}</td><td class="num">${w.length}</td><td class="num">${money(sum(w)) || '$0'}</td></tr>`);
    const byLocCat = {};
    inRange.filter(w => w.category).forEach(w => { const k = w.locationId + '|' + w.category; (byLocCat[k] = byLocCat[k] || []).push(w); });
    const recurLoc = Object.entries(byLocCat).filter(([, w]) => w.length >= 3).sort((a, b) => b[1].length - a[1].length)
      .map(([k, w]) => { const [lid, cat] = k.split('|'); return `<tr><td>${esc(locName(lid))}</td><td>${esc(catLabel(cat))}</td><td class="num">${w.length}</td><td class="num">${money(sum(w)) || '$0'}</td></tr>`; });

    const rvr = state.assets.map(a => {
      const spent = sum(state.workorders.filter(w => w.assetId === a.id));
      const rc = +a.replacementCost || 0;
      const age = a.installDate ? (daysBetween(a.installDate, today()) / 365) : null;
      return { a, spent, rc, ratio: rc ? spent / rc : 0, age };
    }).filter(x => x.ratio >= 0.5 || ['Poor', 'Failed'].includes(x.a.condition) || x.a.status === 'Out of service')
      .sort((a, b) => b.ratio - a.ratio)
      .map(x => `<tr><td><a href="#" data-action="edit-asset" data-id="${x.a.id}">${esc(x.a.name)}</a><div class="muted small">${esc([x.a.make, x.a.model].filter(Boolean).join(' '))}</div></td><td>${esc(locName(x.a.locationId))}</td>
        <td>${esc(x.a.condition || '')}</td><td class="num">${x.age == null ? '—' : x.age.toFixed(1) + ' yr'}</td><td class="num">${money(x.spent) || '$0'}</td><td class="num">${x.rc ? money(x.rc) : '—'}</td>
        <td class="num">${x.rc ? `<span class="badge ${x.ratio >= 0.5 ? 'red' : ''}">${Math.round(x.ratio * 100)}%</span>` : ''}</td></tr>`);

    const ranges = [['30', 'Last 30 days'], ['90', 'Last 90 days'], ['365', 'Last 12 months'], ['ytd', 'Year to date'], ['all', 'All time']];
    return pageHead('Reports', '', 'Spend, budgets, vendor performance, recurring issues, and repair-vs-replace — for Operations & Finance.')
      + `<div class="filters">${selectHtml('flt_reports_range', ranges, r, 'Range', 'data-change="filter" data-group="reports" data-key="range"')}<button class="btn" data-action="print">Print / PDF</button></div>
      <div class="kpis"><div class="kpi"><b>${inRange.length}</b><span>Work orders</span></div><div class="kpi"><b>${money(totalSpend) || '$0'}</b><span>Total spend</span></div>
        <div class="kpi"><b>${fmtDays(avg(inRange.filter(w => w.completedDate && w.reportedDate).map(w => daysBetween(w.reportedDate, w.completedDate))))}</b><span>Avg days to complete</span></div>
        <div class="kpi"><b>${inRange.filter(w => priId(w.priority) === 'P1').length}</b><span>Emergencies (P1)</span></div></div>
      <div class="cols">
        <section class="card"><h2>Spend by location vs. budget</h2>${table(['Location', '#WOs', '#Spend (range)', '#YTD spend', '#Annual budget', '#YTD used'], locRows, 'No costs recorded in this range.')}</section>
        <div class="stack"><section class="card"><h2>Spend by system</h2>${table(['System', '#WOs', '#Spend', '#Share'], catRows, 'No work orders in this range.')}</section>
          <section class="card"><h2>By work type</h2>${table(['Type', '#WOs', '#Spend'], typeRows, 'No work orders in this range.')}</section></div>
      </div>
      <section class="card"><h2>Team & vendor performance</h2><p class="muted small">Response = reported → tech on site. Completion = reported → completed. On-time = completed by due date.</p>
        ${table(['Team / vendor', '#WOs', '#Open', '#Avg response', '#Avg completion', '#On-time', '#Spend'], vRows, 'Assign work orders to team members / vendors to see performance.')}</section>
      <div class="cols">
        <section class="card"><h2>Recurring issues – assets (3+ WOs)</h2>${table(['Asset', 'Location', '#WOs', '#Spend'], recurAssets, 'No asset has 3+ work orders in this range.')}</section>
        <section class="card"><h2>Recurring issues – location × system</h2>${table(['Location', 'System', '#WOs', '#Spend'], recurLoc, 'No location/system has 3+ work orders in this range.')}</section>
      </div>
      <section class="card"><h2>⚖️ Repair vs. replace candidates</h2><p class="muted small">Assets whose lifetime repair spend is ≥ 50% of replacement cost, or rated Poor / Failed / Out of service. Add a replacement cost on each asset to enable this.</p>
        ${table(['Asset', 'Location', 'Condition', '#Age', '#Repair spend', '#Replacement', '#Ratio'], rvr, 'No candidates right now.')}</section>`;
  }

  // ---------- export / import ----------
  function download(name, content, type) {
    const blob = content instanceof Blob ? content : new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  const blobToDataUrl = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });

  async function exportJson(withFiles) {
    const out = { app: 'alfred-facilities', exportedAt: new Date().toISOString(), state };
    if (withFiles) {
      toast('Packaging files…');
      const files = await DB.allFiles();
      out.files = await Promise.all(files.map(async f => ({ id: f.id, name: f.name, type: f.type, size: f.size, data: await blobToDataUrl(f.blob) })));
    }
    download(`alfred-facilities-backup-${today()}${withFiles ? '-full' : ''}.json`, JSON.stringify(out), 'application/json');
    toast('Backup downloaded');
  }

  async function importJson(file) {
    let data;
    try { data = JSON.parse(await file.text()); } catch (e) { return toast('Not a valid backup file'); }
    if (!data || data.app !== 'alfred-facilities' || !data.state) return toast('Not an Alfred Facilities backup');
    if (!confirm(`Replace ALL current data on this device with the backup from ${new Date(data.exportedAt).toLocaleString()}?`)) return;
    await DB.clearAll();
    for (const f of data.files || []) {
      const blob = await (await fetch(f.data)).blob();
      await DB.putFile({ id: f.id, blob, name: f.name, type: f.type, size: f.size });
    }
    state = Object.assign(blankState(), data.state);
    urlCache.clear();
    await DB.saveState(state);
    toast(`Restored${data.files ? ` with ${data.files.length} files` : ' (data only – files not included)'}`);
    location.hash = '#/';
    render();
  }

  function toCsv(rows, cols) {
    const cell = v => { v = Array.isArray(v) ? v.join('; ') : String(v ?? ''); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };
    return [cols.map(c => cell(c[1])).join(','), ...rows.map(r => cols.map(c => cell(typeof c[0] === 'function' ? c[0](r) : r[c[0]])).join(','))].join('\r\n');
  }

  function exportCsv(what) {
    const L = r => locName(r.locationId);
    const fieldCols = fields => fields.filter(f => !['location', 'locations', 'vendor', 'category', 'asset'].includes(f.type)).map(f => [f.k, f.label]);
    let cols;
    if (what === 'locations') cols = fieldCols(S.LOCATION_FIELDS);
    else if (what === 'vendors') cols = [...fieldCols(S.VENDOR_FIELDS), [r => (r.locations || []).map(locName), 'Locations served']];
    else if (what === 'workorders') cols = [['number', 'WO #'], [L, 'Location'], [r => catLabel(r.category), 'System'], [r => assetName(r.assetId), 'Asset'], [r => vendorName(r.vendorId), 'Vendor'], ...fieldCols(S.WO_FIELDS)];
    else if (what === 'pm') cols = [[L, 'Location'], [r => catLabel(r.category), 'System'], [r => assetName(r.assetId), 'Asset'], [r => vendorName(r.vendorId), 'Vendor'], ...fieldCols(S.PM_FIELDS)];
    else if (what === 'visits') {
      cols = [['date', 'Date'], [L, 'Location'], ['by', 'Visited by'], ['mod', 'Manager on duty'], [r => visitScore(r), 'Score %'], ['cleanliness', 'Cleanliness'],
        [r => (r.items || []).filter(i => ['fail', 'attn'].includes(i.result)).map(i => `${i.result === 'fail' ? 'FAIL' : 'ATTN'}: ${i.label}${i.note ? ' (' + i.note + ')' : ''}`), 'Issues'], ['notes', 'Notes']];
    }
    else if (what === 'assets') {
      const keys = new Map();
      S.CATEGORIES.forEach(c => S.fieldsFor(c).forEach(f => { if (f.type !== 'vendor' && !keys.has(f.k)) keys.set(f.k, f.label); }));
      cols = [[L, 'Location'], [r => (S.catById(r.category) || {}).label, 'System'], [r => vendorName(r.vendorId), 'Vendor'], ...keys];
    }
    download(`alfred-${what}-${today()}.csv`, toCsv(state[what], cols), 'text/csv');
  }

  function seedLocations() {
    let added = 0, updated = 0, removed = 0;
    const realNames = new Set(S.SEED_LOCATIONS.map(r => r[0]));
    const isStarter = l => /^Starter entry/.test(l.notes || '');
    const hasRecords = id => ['assets', 'workorders', 'pm', 'docs', 'visits'].some(c => state[c].some(r => r.locationId === id));
    // Upgrade entries from the earlier guessed starter list.
    for (const l of [...state.locations]) {
      if (!isStarter(l)) continue;
      const real = S.SEED_ALIASES[l.name] || l.name.replace(/^Alfred – /, '');
      if (realNames.has(real) && !state.locations.some(o => o !== l && o.name === real)) { l.name = real; l.notes = ''; }
      else if (!hasRecords(l.id)) { state.locations = state.locations.filter(o => o !== l); removed++; }
    }
    for (const [name, storeNo, address, city, zip, phone, region, format] of S.SEED_LOCATIONS) {
      const data = { storeNo, address, city, zip, phone, region, format: format || 'Café' };
      const existing = state.locations.find(l => l.name === name);
      if (existing) {
        let changed = false;
        for (const [k, v] of Object.entries(data)) if (v && !existing[k]) { existing[k] = v; changed = true; }
        if (changed) updated++;
        continue;
      }
      upsert('locations', { name, status: 'Open', ...data });
      added++;
    }
    save();
    toast(`Alfred locations: ${added} added, ${updated} filled in${removed ? `, ${removed} old placeholders removed` : ''}`, 4000);
    render();
  }

  // ---------- router ----------
  function route() {
    const parts = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
    return { name: parts[0] || 'dashboard', args: parts.slice(1) };
  }

  function render() {
    if (!state) return;
    const active = document.activeElement;
    const focusId = active && active.id && active.matches('input, textarea') ? active.id : null;
    const sel = focusId ? [active.selectionStart, active.selectionEnd] : null;

    const r = route();
    const views = {
      dashboard: () => viewDashboard(), locations: () => viewLocations(), loc: () => viewLocation(r.args[0], r.args[1]),
      wo: () => viewWO(), pm: () => viewPM(), vendors: () => viewVendors(), docs: () => viewDocs(),
      search: () => viewSearch(r.args.join('/')), settings: () => viewSettings(), visits: () => viewVisits(), reports: () => viewReports(),
    };
    const html = (views[r.name] || views.dashboard)();
    $('#main').innerHTML = html;
    $$('#nav a').forEach(a => a.classList.toggle('active', a.dataset.route === (r.name === 'loc' ? 'locations' : r.name)));
    document.title = 'Alfred Facilities';

    if (focusId) {
      const el = document.getElementById(focusId);
      if (el) { el.focus(); try { el.setSelectionRange(sel[0], sel[1]); } catch (e) { /* ignore */ } }
    }
    loadThumbs();
    if (r.name === 'settings' && navigator.storage && navigator.storage.estimate) {
      navigator.storage.estimate().then(e => { const el = $('#storage-est'); if (el) el.textContent = `Using ${fmtSize(e.usage || 0)} of ~${fmtSize(e.quota || 0)} available browser storage.`; });
    }
  }

  // ---------- events ----------
  const actions = {
    'close-modal': () => closeModal(),
    'add-location': () => editLocation(),
    'edit-location': el => editLocation(el.dataset.id),
    'add-asset': el => editAsset(null, { locationId: el.dataset.loc, category: el.dataset.cat }),
    'edit-asset': el => editAsset(el.dataset.id),
    'dup-asset': el => {
      const a = byId('assets', el.dataset.id);
      const copy = { ...a, id: undefined, name: a.name + ' (copy)', serial: '', tag: '' };
      delete copy.id;
      editAsset(null, copy);
    },
    'add-wo': el => editWO(null, { locationId: el.dataset.loc || ui.wo.loc || '', category: el.dataset.cat || '', assetId: el.dataset.asset || '' }),
    'edit-wo': el => editWO(el.dataset.id),
    'add-pm': el => editPM(null, { locationId: el.dataset.loc || ui.pm.loc || '' }),
    'edit-pm': el => editPM(el.dataset.id),
    'pm-done': el => pmDone(el.dataset.id),
    'pm-wo': el => {
      const p = byId('pm', el.dataset.id);
      editWO(null, { woType: 'Preventive maintenance', title: p.title, locationId: p.locationId, category: p.category, assetId: p.assetId, vendorId: p.vendorId, priority: S.WO_PRIORITIES[3].label, description: p.procedure, dueDate: p.nextDue });
    },
    'apply-pm': el => applyPmTemplate(el.dataset.loc),
    'add-visit': el => editVisit(null, { locationId: el.dataset.loc || '' }),
    'edit-visit': el => editVisit(el.dataset.id),
    'add-vendor': () => editVendor(),
    'edit-vendor': el => editVendor(el.dataset.id),
    'upload-doc': el => uploadDocs({ locationId: el.dataset.loc || ui.docs.loc || '' }),
    'open-doc': el => openDoc(el.dataset.id),
    'edit-doc': el => editDocMeta(el.dataset.id),
    'delete-doc-inline': el => {
      if (!confirm('Remove this file?')) return;
      const doc = byId('docs', el.dataset.id);
      deleteDoc(el.dataset.id).then(() => { if (doc) refreshAttachments(doc.ownerId); });
    },
    'export-json': el => exportJson(!!el.dataset.files),
    'export-csv': el => exportCsv(el.dataset.what),
    'seed': () => seedLocations(),
    'print': () => window.print(),
    'persist': async () => {
      if (!navigator.storage || !navigator.storage.persist) return toast('Not supported in this browser');
      toast(await navigator.storage.persist() ? 'Storage marked persistent ✓' : 'Browser declined — installing the app usually allows it');
    },
    'reset': async () => {
      if (!confirm('Erase ALL locations, assets, work orders, vendors, and files on this device?')) return;
      if (prompt('Type ERASE to confirm') !== 'ERASE') return;
      await DB.clearAll();
      state = blankState();
      await DB.saveState(state);
      location.hash = '#/';
      render();
      toast('All data erased');
    },
    'menu': () => document.body.classList.toggle('nav-open'),
  };

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (el) {
      if (el.tagName === 'A' || el.tagName === 'BUTTON') e.preventDefault();
      const fn = actions[el.dataset.action];
      if (fn) fn(el, e);
      return;
    }
    const row = e.target.closest('tr[data-href]');
    if (row && !e.target.closest('a,button,select,input')) location.hash = row.dataset.href;
    if (e.target.closest('#nav a')) document.body.classList.remove('nav-open');
  });

  document.addEventListener('change', e => {
    const el = e.target;
    const kind = el.dataset && el.dataset.change;
    if (!kind) return;
    if (kind === 'filter') { ui[el.dataset.group][el.dataset.key] = el.value || (el.dataset.key === 'due' ? 'all' : ''); saveUi(); render(); }
    else if (kind === 'goto-system') { if (el.value) location.hash = `#/loc/${el.dataset.loc}/${el.value}`; }
    else if (kind === 'wo-status') {
      const w = byId('workorders', el.dataset.id);
      const rec = { ...w, status: el.value, history: [...(w.history || []), { at: new Date().toISOString(), text: `Status: ${w.status} → ${el.value}` }] };
      if (S.WO_CLOSED.slice(0, 2).includes(el.value) && !rec.completedDate) rec.completedDate = today();
      upsert('workorders', rec);
      toast(`${w.number} → ${el.value}`);
      render();
    } else if (kind === 'attach') {
      const files = [...el.files];
      if (!files.length) return;
      const kindSel = el.closest('.attach').querySelector('select');
      addFiles(files, { ownerType: el.dataset.ownerType, ownerId: el.dataset.ownerId, locationId: el.dataset.loc, kind: kindSel ? kindSel.value || 'Photo' : 'Photo' })
        .then(() => { refreshAttachments(el.dataset.ownerId); toast(`${files.length} file(s) attached`); })
        .catch(err => toast('Upload failed: ' + err.message));
    } else if (kind === 'import-json') { if (el.files[0]) importJson(el.files[0]); el.value = ''; }
    else if (kind === 'theme') { ui.theme = el.value; saveUi(); applyTheme(); }
  });

  let inputTimer = null;
  document.addEventListener('input', e => {
    const el = e.target;
    if (el.dataset && el.dataset.input === 'filter') {
      clearTimeout(inputTimer);
      inputTimer = setTimeout(() => { ui[el.dataset.group][el.dataset.key] = el.value; saveUi(); render(); }, 200);
    }
  });

  document.addEventListener('submit', e => {
    const f = e.target;
    if (f.dataset.form === 'search' || f.id === 'global-search') {
      e.preventDefault();
      location.hash = '#/search/' + encodeURIComponent(f.elements.q.value.trim());
    }
  });

  function updateNet() {
    const on = navigator.onLine;
    const el = $('#net-status');
    el.textContent = on ? 'Online' : 'Offline';
    el.className = 'net ' + (on ? 'on' : 'off');
  }
  window.addEventListener('online', updateNet);
  window.addEventListener('offline', updateNet);
  window.addEventListener('hashchange', () => { closeModal(); render(); window.scrollTo(0, 0); });

  // ---------- boot ----------
  async function boot() {
    applyTheme();
    updateNet();
    // Closing the native dialog via Esc should also clear it.
    $('#modal').addEventListener('close', () => { $('#modal').innerHTML = ''; });
    try {
      state = Object.assign(blankState(), await DB.loadState() || {});
    } catch (e) {
      console.error(e);
      state = blankState();
      toast('⚠️ Browser storage unavailable — data will not be saved', 8000);
    }
    render();
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW registration failed', err));
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
