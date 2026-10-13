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
  const blankState = () => ({ version: 1, locations: [], assets: [], vendors: [], workorders: [], pm: [], docs: [], visits: [], settings: {}, seq: { wo: 1 }, createdAt: new Date().toISOString() });

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
    const extra = id ? `<div class="btn-row" style="margin-top:14px"><button type="button" class="btn sm" data-action="qr-label" data-id="${id}">🏷️ Print QR label</button><span class="muted small">Stick it on the equipment — staff scan it to report problems.</span></div>` + attachmentsHtml('asset', id, asset.locationId) + assetHistoryHtml(id) : '<p class="muted small">Save the asset first, then reopen it to attach photos, manuals, and warranty docs.</p>';
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
    const resqHref = wo.resqLink || state.settings.resqUrl;
    const resqBox = resqHref ? `<div class="callout"><a href="${esc(resqHref)}" target="_blank" rel="noopener">🔗 Open ${wo.resqLink ? `ResQ work order ${esc(wo.resqId || '')}` : 'ResQ'} ↗</a>${!wo.resqId ? ' <span class="muted small">— if this was submitted in ResQ, paste its ResQ # and link above to keep them linked.</span>' : ''}</div>` : '';
    const vendorBox = resqBox + (vendor ? `<div class="callout">📞 <b>${esc(vendor.company)}</b> ${telLink(vendor.phone)} ${vendor.emergencyPhone ? ' · After-hours: ' + telLink(vendor.emergencyPhone) : ''} ${mailLink(vendor.email)}</div>` : '');
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
        `<button class="btn primary" data-action="seed">Load Alfred café list (24 cafés + Calabasas + HQ + warehouse)</button> <button class="btn" data-action="add-location">Add location</button>`);
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
        <section class="card"><h2>🏷️ QR equipment labels</h2><p class="muted small">Print a QR sticker for every tracked item at this café. Staff scan it with their phone camera to report a problem — choosing whether the on-site team can fix it, it needs an Alfred tech, or a vendor.</p>
          <button class="btn sm" data-action="qr-labels" data-loc="${l.id}">Print all labels (${state.assets.filter(a => a.locationId === l.id).length})</button></section>
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
      <td class="row-actions"><button class="btn sm" data-action="add-wo" data-loc="${l.id}" data-cat="${cat.id}" data-asset="${a.id}" title="Create work order">+ WO</button><button class="btn sm" data-action="qr-label" data-id="${a.id}" title="Print QR label">🏷️</button><button class="btn sm" data-action="dup-asset" data-id="${a.id}" title="Duplicate">⧉</button></td></tr>`).join('');
    const openWO = state.workorders.filter(w => w.locationId === l.id && w.category === cat.id && !isClosed(w));
    return `<section class="card"><div class="card-head"><h2>${cat.icon} ${esc(cat.label)} <span class="count">${assets.length}</span></h2>
        <div class="actions">${assets.length ? `<button class="btn" data-action="qr-labels" data-loc="${l.id}" data-cat="${cat.id}">🏷️ QR labels</button>` : ''}<button class="btn" data-action="add-wo" data-loc="${l.id}" data-cat="${cat.id}">+ Work order</button><button class="btn primary" data-action="add-asset" data-loc="${l.id}" data-cat="${cat.id}">+ Add ${esc(cat.label.toLowerCase())} item</button></div></div>
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
      && (!q || [w.number, w.title, w.description, w.resolution, vendorName(w.vendorId), assetName(w.assetId), w.vendorTicket, w.po, w.invoice, w.resqId].join(' ').toLowerCase().includes(q))
    ).sort((a, b) => (isClosed(a) - isClosed(b)) || priId(a.priority).localeCompare(priId(b.priority)) || (a.dueDate || '9').localeCompare(b.dueDate || '9'));
  }

  function woTable(list, showLoc = true) {
    if (!list.length) return emptyState('No work orders match.');
    return `<div class="table-wrap"><table class="table"><thead><tr><th>#</th><th>Pri</th><th>Issue</th>${showLoc ? '<th>Location</th>' : ''}<th>Vendor</th><th>Status</th><th>Due</th><th class="num">Cost</th></tr></thead><tbody>${list.map(w => `<tr>
      <td class="nowrap"><a href="#" data-action="edit-wo" data-id="${w.id}">${esc(w.number)}</a>${w.resqId ? `<div class="muted small" title="ResQ work order #">ResQ ${esc(w.resqId)}</div>` : ''}</td><td>${priPill(w.priority)}</td>
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
    return pageHead('Work orders', `${state.settings.resqUrl ? `<a class="btn" href="${esc(state.settings.resqUrl)}" target="_blank" rel="noopener">🔗 ResQ ↗</a>` : ''}<label class="btn">⬆ Import ResQ CSV<input type="file" accept=".csv,text/csv" hidden data-change="import-wo-csv"></label><button class="btn" data-action="export-csv" data-what="workorders">Export CSV</button><button class="btn primary" data-action="add-wo">+ New work order</button>`) + woSection();
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
      <section class="card"><h2>🏷️ QR codes & facilities contact</h2>
        <p class="small">Printed on every QR label. When staff scan a label and report a problem, the message goes to this contact with a link that opens a pre-filled work order here.</p>
        <div class="form-grid">
          <label class="field"><span>Facilities contact name</span><input id="set-fn" value="${esc(state.settings.facilitiesName || '')}" data-change="setting" data-key="facilitiesName" placeholder="e.g. Facilities – Travis"></label>
          <label class="field"><span>Mobile # (for texts)</span><input type="tel" id="set-fp" value="${esc(state.settings.facilitiesPhone || '')}" data-change="setting" data-key="facilitiesPhone"></label>
          <label class="field"><span>Email</span><input type="email" id="set-fe" value="${esc(state.settings.facilitiesEmail || '')}" data-change="setting" data-key="facilitiesEmail"></label>
          <label class="field full"><span>Public app URL (where phones open the QR link)</span><input type="url" id="set-url" value="${esc(state.settings.appUrl || '')}" data-change="setting" data-key="appUrl" placeholder="${esc(pageBase() || 'https://<you>.github.io/AlfredCoffee/')}"></label>
        </div>
        <p class="muted small">${pageBase() ? `Leave the URL blank to use this address (${esc(pageBase())}).` : '⚠️ You opened the app as a file — host it (e.g. GitHub Pages, see README) and enter that URL so phones can open scanned labels.'} Reprint labels after changing the contact info.</p>
      </section>
      <section class="card"><h2>🔗 ResQ work orders</h2>
        <p class="small">If Alfred runs work orders in <b>ResQ</b>, keep ResQ as the system of record for requests, dispatch, quotes and invoices. Use this app for café specs, site visits, plans, and cross-café reporting. Import a ResQ work-order CSV export any time: columns and café names are matched automatically, and re-importing updates existing ResQ #s instead of creating duplicates.</p>
        <label class="field full"><span>ResQ web app link (for quick-open buttons)</span><input type="url" id="resq-url" value="${esc(state.settings.resqUrl || '')}" placeholder="https://… (the ResQ address you log in at)" data-change="resq-url"></label>
        <div class="btn-row" style="margin-top:10px"><label class="btn primary">⬆ Import ResQ work orders (CSV)<input type="file" accept=".csv,text/csv" hidden data-change="import-wo-csv"></label></div>
        <p class="muted small">Imported work orders show up in Reports (spend, vendor performance, recurring issues, repair vs. replace) and in each café's and asset's history.</p>
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
        <p class="muted small">Adds Alfred's 24 California cafés (from locations.alfred.la), the Calabasas new build, HQ (708 N Croft Ave) and the Van Nuys warehouse. Existing locations are kept; blank address / phone fields are filled in.</p>
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

  // ---------- QR codes: equipment labels → "report a problem" → work order ----------
  const b64e = obj => btoa(unescape(encodeURIComponent(JSON.stringify(obj)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  function b64d(str) {
    try {
      str = str.replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(decodeURIComponent(escape(atob(str + '==='.slice((str.length + 3) % 4)))));
    } catch (e) { return null; }
  }
  const pageBase = () => location.protocol.startsWith('http') ? location.origin + location.pathname : '';
  const appBase = () => (state.settings.appUrl || '').trim().replace(/#.*$/, '') || pageBase();

  function qrSvg(text) {
    const qr = qrcode(0, 'L');
    qr.addData(text);
    qr.make();
    return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true, alt: 'QR code' });
  }

  function assetReportUrl(a) {
    const base = appBase();
    if (!base) return '';
    const v = a.vendorId && byId('vendors', a.vendorId);
    const st = state.settings;
    const data = { a: a.id, li: a.locationId, l: locName(a.locationId), n: a.name, c: a.category, t: a.type, m: [a.make, a.model].filter(Boolean).join(' '), s: a.serial,
      vn: v && !isInternal(v) ? v.company : '', vp: v && !isInternal(v) ? (v.emergencyPhone || v.phone || '') : '', fn: st.facilitiesName, fp: st.facilitiesPhone, fe: st.facilitiesEmail };
    Object.keys(data).forEach(k => { if (!data[k]) delete data[k]; });
    return base + '#/report/' + b64e(data);
  }

  function printLabels(assets) {
    if (!appBase()) { toast('Set your public app URL in Settings → QR codes first (QR codes need a web address phones can open).', 6000); location.hash = '#/settings'; return; }
    const labels = assets.map(a => {
      const cat = S.catById(a.category) || {};
      return `<div class="label"><div class="qr">${qrSvg(assetReportUrl(a))}</div><div class="txt">
        <div class="cta">📱 Scan to report a problem</div><div class="name">${esc(a.name)}</div>
        <div class="meta">${esc(locName(a.locationId))} · ${esc(cat.label || '')}</div>
        <div class="meta">${esc([a.make, a.model].filter(Boolean).join(' '))}${a.serial ? ' · S/N ' + esc(a.serial) : ''}${a.tag ? ' · Tag ' + esc(a.tag) : ''}</div>
        <div class="brand">alfred</div></div></div>`;
    }).join('');
    const w = window.open('', '_blank');
    if (!w) return toast('Allow pop-ups to print labels');
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>QR labels</title><style>
      body{font:12px/1.3 system-ui,sans-serif;margin:16px;color:#111}
      .bar{margin-bottom:12px}.bar button{font:inherit;padding:8px 14px;border-radius:8px;border:1px solid #111;background:#111;color:#fff;cursor:pointer}
      .grid{display:grid;grid-template-columns:repeat(auto-fill,3.4in);gap:.15in}
      .label{display:flex;gap:10px;align-items:center;width:3.4in;height:1.6in;padding:8px;border:1px dashed #999;border-radius:8px;box-sizing:border-box;break-inside:avoid;overflow:hidden}
      .qr{flex:none;width:1.35in;height:1.35in}.qr svg{width:100%;height:100%}
      .cta{font-weight:700;font-size:11px;margin-bottom:4px}.name{font-weight:700;font-size:13px;margin-bottom:2px}
      .meta{color:#444;font-size:10px}.brand{margin-top:6px;font-family:Georgia,serif;font-size:10px;letter-spacing:.05em}
      @media print{.bar{display:none}body{margin:0}.label{border-color:#ccc}}</style></head>
      <body><div class="bar"><button onclick="print()">Print ${assets.length} label${assets.length === 1 ? '' : 's'}</button> <span>Tip: print on weatherproof label stock, or plain paper + clear packing tape.</span></div><div class="grid">${labels}</div></body></html>`);
    w.document.close();
  }

  // Page opened by scanning a QR label (works on any phone; no app data needed).
  function viewReport(code) {
    const d = b64d(code || '');
    document.body.classList.add('report-mode');
    if (!d) return `<div class="report">${emptyState('This QR code could not be read. Ask your manager to reprint the label.')}</div>`;
    const cat = S.catById(d.c) || { label: '', icon: '🔧' };
    const problems = S.REPORT_PROBLEMS[d.c] || S.REPORT_PROBLEMS_DEFAULT;
    const tips = S.SELF_FIX_TIPS[d.c] || S.SELF_FIX_DEFAULT;
    const local = byId('assets', d.a);
    const sel = (name, opts, blank) => `<select name="${name}" required><option value="">${esc(blank)}</option>${opts.map(o => `<option>${esc(o)}</option>`).join('')}</select>`;
    let who = '';
    try { who = localStorage.getItem('af-reporter') || ''; } catch (e) { /* ignore */ }
    return `<div class="report">
      <section class="card report-head"><div class="ico">${cat.icon}</div><div>
        <h1>${esc(d.n || 'Equipment')}</h1>
        <p class="muted">${esc(d.l || '')}${cat.label ? ' · ' + esc(cat.label) : ''}</p>
        ${d.m || d.s ? `<p class="muted small">${esc(d.m || '')}${d.s ? ' · S/N ' + esc(d.s) : ''}</p>` : ''}</div></section>
      ${d.c === 'fire' ? '<div class="callout danger">🔥 Fire / life safety equipment: do <b>not</b> silence, reset or tamper. If there is fire, smoke or an active alarm, evacuate and call 911.</div>' : ''}
      <form id="report-form" class="card" novalidate>
        <h2>Report a problem</h2>
        <label class="field"><span>What's wrong?</span>${sel('problem', [...problems, 'Other'], '— Choose —')}</label>
        <label class="field"><span>Can it still be used?</span>${sel('impact', S.REPORT_IMPACT, '— Choose —')}</label>
        <div class="callout danger" data-show="hazard" hidden>⚠️ Safety hazard: stop using it, keep people away, and shut off water / power only if safe. Gas smell, fire or sparking → evacuate and call 911 first.</div>
        <label class="field"><span>Who should handle it?</span>${sel('route', S.REPORT_ROUTES, '— Choose —')}</label>
        <p class="muted small" data-show="suggest" hidden></p>
        <div data-show="tips" hidden class="tips"><h3>Try these first</h3><ol>${tips.map(t => `<li>${esc(t)}</li>`).join('')}</ol>
          <label class="field"><span>Did that fix it?</span><select name="fixed"><option value="">— Choose —</option><option>Yes – fixed on site</option><option>No – still needs help</option></select></label></div>
        <label class="field"><span>Details (optional)</span><textarea name="details" rows="3" placeholder="Error code, where it's leaking, when it started…"></textarea></label>
        <label class="field"><span>Your name</span><input name="by" value="${esc(who)}" autocomplete="name"></label>
        <p class="muted small">📷 Take a photo — you can attach it to the text or email on the next step.</p>
        <p class="form-error" hidden></p>
        <button class="btn primary big" type="submit">Continue</button>
      </form>
      <section class="card" id="report-send" hidden></section>
      ${local ? '<p class="muted small center">This device has Alfred Facilities data — you can log the work order directly on the next step.</p>' : ''}
    </div>`;
  }

  function bindReport(code) {
    const d = b64d(code || '');
    const form = $('#report-form');
    if (!d || !form) return;
    const show = (k, on) => { const el = $(`[data-show="${k}"]`, form); if (el) el.hidden = !on; };
    const suggest = () => {
      const impact = form.elements.impact.value;
      const hazard = impact.startsWith('Safety');
      show('hazard', hazard);
      const sug = $('[data-show="suggest"]', form);
      const route = form.elements.route.value;
      if ((hazard || impact.startsWith('Down')) && (!route || route === S.REPORT_ROUTES[0])) {
        sug.hidden = false;
        sug.textContent = d.c === 'coffee' || d.c === 'icewater' ? 'Suggested: Alfred maintenance tech (beverage tech) — facilities will be notified right away.' : 'Suggested: Alfred maintenance tech or vendor — facilities will be notified right away.';
      } else sug.hidden = true;
      show('tips', form.elements.route.value === S.REPORT_ROUTES[0]);
    };
    form.addEventListener('change', suggest);
    form.addEventListener('submit', e => {
      e.preventDefault();
      const f = form.elements;
      const err = $('.form-error', form);
      if (!f.problem.value || !f.impact.value || !f.route.value) { err.hidden = false; err.textContent = 'Please answer the three questions above.'; return; }
      try { localStorage.setItem('af-reporter', f.by.value.trim()); } catch (ex) { /* ignore */ }
      const fixed = f.route.value === S.REPORT_ROUTES[0] && f.fixed.value.startsWith('Yes');
      const req = { r: uid(), a: d.a, li: d.li, l: d.l, n: d.n, c: d.c, p: f.problem.value, i: f.impact.value, h: f.route.value, d: f.details.value.trim(), by: f.by.value.trim(), at: new Date().toISOString(), x: fixed ? 1 : 0 };
      const intake = pageBase() + '#/intake/' + b64e(req);
      const lines = [
        fixed ? '✅ Alfred facilities – fixed on site (FYI)' : (req.i.startsWith('Safety') ? '🚨 Alfred facilities – SAFETY' : req.i.startsWith('Down') ? '🔴 Alfred facilities – equipment down' : '🔧 Alfred facilities request'),
        `Café: ${d.l || ''}`, `Equipment: ${d.n || ''}${d.m ? ` (${d.m}${d.s ? ', S/N ' + d.s : ''})` : ''}`,
        `Problem: ${req.p}`, `Status: ${req.i}`, `Handle by: ${req.h}${req.h === S.REPORT_ROUTES[0] ? (fixed ? ' – fixed' : ' – NOT fixed, needs help') : ''}`,
        req.d ? `Details: ${req.d}` : '', `Reported by: ${req.by || '—'} · ${new Date().toLocaleString()}`, '', `Log as work order: ${intake}`,
      ].filter(x => x !== '');
      const body = lines.join('\n');
      const subject = lines[0] + ' – ' + (d.l || '') + ': ' + (d.n || '');
      const btns = [];
      if (byId('assets', d.a)) btns.push(`<a class="btn primary big" href="#/intake/${b64e(req)}">📝 Log work order now</a>`);
      if (d.fp) btns.push(`<a class="btn ${btns.length ? '' : 'primary '}big" href="sms:${esc(d.fp.replace(/[^\d+]/g, ''))}?&body=${encodeURIComponent(body)}">💬 Text ${esc(d.fn || 'facilities')}</a>`);
      if (d.fe) btns.push(`<a class="btn big" href="mailto:${esc(d.fe)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}">✉️ Email ${esc(d.fn || 'facilities')}</a>`);
      if (req.h === S.REPORT_ROUTES[2] && d.vp && !fixed) btns.push(`<a class="btn big" href="tel:${esc(d.vp.replace(/[^\d+]/g, ''))}">📞 Call ${esc(d.vn || 'vendor')}</a>`);
      btns.push(`<button type="button" class="btn big" data-copy>📋 Copy message</button>`);
      const box = $('#report-send');
      box.hidden = false;
      box.innerHTML = `<h2>${fixed ? 'Thanks — let facilities know' : 'Send to facilities'}</h2>
        ${req.i.startsWith('Safety') ? '<div class="callout danger">For a safety hazard, also <b>call</b> your manager / facilities now.</div>' : ''}
        ${!d.fp && !d.fe ? '<p class="muted small">No facilities contact is on this label — copy the message and send it to your manager.</p>' : ''}
        <div class="send-btns">${btns.join('')}</div><pre class="msg">${esc(body)}</pre>`;
      $('[data-copy]', box).addEventListener('click', () => {
        (navigator.clipboard ? navigator.clipboard.writeText(body) : Promise.reject()).then(() => toast('Copied'), () => toast('Select the text below and copy it'));
      });
      form.hidden = true;
      box.scrollIntoView({ behavior: 'smooth' });
    });
  }

  // Link from a QR report (texted / emailed to facilities) → pre-filled work order.
  function handleIntake(code) {
    const q = b64d(code || '');
    history.replaceState(null, '', '#/wo');
    render();
    if (!q) return toast('That request link is damaged.');
    const dup = state.workorders.find(w => w.requestId === q.r);
    if (dup) { toast(`Already logged as ${dup.number}`); return editWO(dup.id); }
    const asset = byId('assets', q.a);
    const locationId = byId('locations', q.li) ? q.li : (asset ? asset.locationId : guessLocation(q.l));
    const pri = q.i.startsWith('Safety') ? 0 : q.i.startsWith('Down') ? 1 : q.i.startsWith('Partially') ? 2 : 3;
    let vendorId = '';
    if (q.h === S.REPORT_ROUTES[2] && asset) vendorId = asset.vendorId || '';
    if (q.h === S.REPORT_ROUTES[1]) {
      const team = state.vendors.filter(isInternal);
      const bev = ['coffee', 'icewater'].includes(q.c) && team.find(v => /beverage/i.test(v.kind));
      vendorId = (bev || team.find(v => /facilities/i.test(v.kind)) || team[0] || {}).id || '';
    }
    const fixed = !!q.x;
    const reported = q.at ? iso(new Date(q.at)) : today();
    editWO(null, {
      requestId: q.r, title: `${q.n || 'Equipment'}: ${q.p}`, locationId, assetId: asset ? asset.id : '', category: q.c || '', reportedBy: q.by || '', reportedDate: reported,
      priority: S.WO_PRIORITIES[fixed ? 3 : pri].label, woType: 'Repair', route: q.h, vendorId,
      status: fixed ? 'Completed' : vendorId ? 'Assigned' : 'Open', completedDate: fixed ? reported : '', resolution: fixed ? 'Fixed on site by café team (self-fix steps).' : '',
      impact: q.i.startsWith('Safety') || q.i.startsWith('Down') ? 'Station / menu item down' : q.i.startsWith('Partially') ? 'Minor – workaround' : 'None',
      description: [`Reported via QR code${q.at ? ' at ' + new Date(q.at).toLocaleString() : ''}.`, `Status: ${q.i}`, `Requested: ${q.h}`, q.d ? `Details: ${q.d}` : ''].filter(Boolean).join('\n'),
    });
    if (!locationId) toast(`Couldn't match café "${q.l}" — pick the location.`, 5000);
  }

  // ---------- ResQ / CSV work-order import ----------
  function updateResqNav() {
    const a = $('#resq-link');
    if (!a) return;
    a.hidden = !state.settings.resqUrl;
    if (state.settings.resqUrl) a.href = state.settings.resqUrl;
  }

  function parseCsv(text) {
    const rows = [];
    let row = [], field = '', q = false;
    text = text.replace(/^﻿/, '');
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); rows.push(row); row = []; field = '';
      } else field += c;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows.filter(r => r.some(x => x.trim() !== ''));
  }

  // [target field, label, header pattern used to pre-select the column]
  const IMPORT_TARGETS = [
    ['resqId', 'ResQ work order #', /^(work ?order|wo|ticket|request|job)?\s*(#|id|number|no\.?)$|^(work ?order|request) (id|#|number)/],
    ['title', 'Title / issue', /title|summary|issue|problem|subject/],
    ['description', 'Description', /description|details|notes?/],
    ['location', 'Location / café', /location|store|site|restaurant|facility|caf[eé]|branch/],
    ['category', 'Category / trade', /category|trade|service type|^type$|equipment type/],
    ['asset', 'Equipment / asset', /equipment|asset/],
    ['priority', 'Priority', /priority|urgency|severity/],
    ['status', 'Status', /status|state|stage/],
    ['vendor', 'Vendor / technician', /vendor|provider|technician|contractor|servicer/],
    ['reportedDate', 'Created / reported date', /created|submitted|reported|opened|requested/],
    ['dueDate', 'Due date', /due|deadline/],
    ['scheduledDate', 'Scheduled date', /scheduled|appointment/],
    ['arrivedDate', 'Tech arrived / checked in', /arriv|check.?in|on.?site|started/],
    ['completedDate', 'Completed date', /complet|resolved|closed|finished/],
    ['cost', 'Total cost', /total|cost|amount|price|spend/],
    ['invoice', 'Invoice #', /invoice/],
    ['po', 'PO #', /\bpo\b|purchase order/],
  ];

  const CATEGORY_WORDS = [
    ['coffee', /espresso|coffee|grinder|brewer|la marzocco|slayer|mahlk|steam wand|portafilter|cold brew|nitro/],
    ['icewater', /\bice\b|ice machine|water filter|filtration|reverse osmosis|\bro\b|softener/],
    ['refrig', /refrig|cooler|freezer|walk.?in|reach.?in|fridge|pastry case|display case/],
    ['hvac', /hvac|\ba\/?c\b|air condition|heating|furnace|thermostat|exhaust fan|rtu|mini.?split|make.?up air|hood/],
    ['plumbing', /plumb|drain|clog|sink|leak|water heater|grease|backflow|faucet|pipe/],
    ['restroom', /restroom|bathroom|toilet|urinal|hand dryer/],
    ['fire', /fire|sprinkler|extinguisher|ansul|suppression|exit sign|emergency light/],
    ['electrical', /electric|breaker|outlet|panel|power|wiring|gfci/],
    ['lighting', /light|lamp|bulb|fixture/],
    ['doors', /door|lock|key|closer|gate/],
    ['security', /security|camera|cctv|alarm|nvr/],
    ['signage', /sign|graphic|menu board|neon/],
    ['cleaning', /clean|janitor|pressure wash|floor care/],
    ['pest', /pest|rodent|roach|ant\b|fly|exterminat/],
    ['flooring', /floor|tile|grout/],
    ['paint', /paint|touch.?up|wall/],
    ['ceilings', /ceiling/],
    ['glass', /glass|window|storefront/],
    ['furniture', /furniture|chair|table|stool|bench|counter|millwork|shelf|umbrella/],
    ['roof', /roof|gutter|awning/],
    ['kitchen', /oven|dishwasher|microwave|toaster|panini|\bpos\b|printer/],
  ];
  const guessCategory = text => { const t = (text || '').toLowerCase(); const m = CATEGORY_WORDS.find(([, re]) => re.test(t)); return m ? m[0] : ''; };

  function mapPriority(t) {
    t = (t || '').toLowerCase();
    if (/emergenc|critical|p1|asap|immediate/.test(t)) return S.WO_PRIORITIES[0].label;
    if (/urgent|high|p2/.test(t)) return S.WO_PRIORITIES[1].label;
    if (/low|schedul|p4|planned/.test(t)) return S.WO_PRIORITIES[3].label;
    return S.WO_PRIORITIES[2].label;
  }
  function mapStatus(t, completed) {
    t = (t || '').toLowerCase();
    if (/cancel|void|declin/.test(t)) return 'Cancelled';
    if (/closed|invoiced|paid/.test(t)) return 'Closed';
    if (/complet|resolved|done|finished/.test(t)) return 'Completed';
    if (/part/.test(t)) return 'On hold – parts';
    if (/quote|approv/.test(t)) return 'On hold – approval';
    if (/hold|await|pending/.test(t)) return 'On hold – vendor';
    if (/progress|on.?site|en route|working|check/.test(t)) return 'In progress';
    if (/assign|dispatch|schedul|accepted/.test(t)) return 'Assigned';
    return completed ? 'Completed' : 'Open';
  }
  function toIsoDate(v) {
    v = (v || '').trim();
    if (!v) return '';
    let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`; }
    const d = new Date(v);
    return isNaN(d) ? '' : iso(d);
  }
  const parseMoney = v => { const n = parseFloat(String(v || '').replace(/[^0-9.\-]/g, '')); return isNaN(n) ? '' : String(n); };

  const normName = x => (x || '').toLowerCase().replace(/^alfred\s*(coffee)?\s*[-–—:|]?\s*/, '').replace(/[^a-z0-9]+/g, ' ').trim();
  function guessLocation(str) {
    const n = normName(str);
    if (!n) return '';
    const locs = [...state.locations].sort((a, b) => b.name.length - a.name.length);
    const words = n.split(' ');
    let l = locs.find(x => normName(x.name) === n)
      || locs.find(x => x.storeNo && words.includes(x.storeNo.toLowerCase()))
      || locs.find(x => { const ln = normName(x.name).replace(/ new build$/, ''); return ln && (n.includes(ln) || ln.includes(n)); })
      || locs.find(x => x.address && n.includes(normName(x.address).split(' ').slice(0, 2).join(' ')));
    return l ? l.id : '';
  }

  async function importWorkOrdersCsv(file) {
    const rows = parseCsv(await file.text());
    if (rows.length < 2) return toast('No rows found in that CSV');
    if (!state.locations.length) return toast('Add your locations first (Settings → Load Alfred café list)');
    const headers = rows[0].map(h => h.trim());
    const data = rows.slice(1);
    const used = new Set(), guess = {};
    for (const [k, , re] of IMPORT_TARGETS) {
      const i = headers.findIndex((h, idx) => !used.has(idx) && re.test(h.toLowerCase()));
      if (i >= 0) { guess[k] = i; used.add(i); }
    }
    const colSel = k => `<select name="map_${k}"><option value="">— not in file —</option>${headers.map((h, i) => `<option value="${i}"${guess[k] === i ? ' selected' : ''}>${esc(h)}</option>`).join('')}</select>`;
    const html = `<form id="modal-form" novalidate>
      <p class="small"><b>${data.length}</b> rows in <b>${esc(file.name)}</b>. Check the column matches, match each café, then import. Rows whose ResQ # already exists are <b>updated</b>, not duplicated.</p>
      <h3>1. Columns</h3><div class="form-grid">${IMPORT_TARGETS.map(([k, label]) => `<label class="field"><span>${esc(label)}</span>${colSel(k)}</label>`).join('')}</div>
      <h3>2. Cafés</h3><div id="imp-locs"></div>
      <p class="form-error" hidden></p>
      <div class="modal-actions"><span class="spacer"></span><button type="button" class="btn" data-action="close-modal">Cancel</button><button type="submit" class="btn primary">Import work orders</button></div></form>`;
    const d = openModal('Import work orders from ResQ (CSV)', html, true);
    const form = $('#modal-form', d);
    const col = k => form.elements['map_' + k].value === '' ? -1 : +form.elements['map_' + k].value;
    const cell = (r, k) => { const i = col(k); return i < 0 ? '' : (r[i] || '').trim(); };
    let uniq = [];
    function renderLocs() {
      const i = col('location');
      const box = $('#imp-locs', form);
      if (i < 0) { uniq = []; box.innerHTML = `<label class="field"><span>No location column — import all rows to:</span>${selectHtml('imp_default', locationPairs(), '', '— choose a location —')}</label>`; return; }
      uniq = [...new Set(data.map(r => (r[i] || '').trim()))].sort();
      box.innerHTML = `<div class="table-wrap"><table class="table"><thead><tr><th>In file</th><th class="num">Rows</th><th>Alfred location</th></tr></thead><tbody>${uniq.map((u, j) =>
        `<tr><td>${esc(u || '(blank)')}</td><td class="num">${data.filter(r => (r[i] || '').trim() === u).length}</td><td>${selectHtml('imp_loc_' + j, locationPairs(), guessLocation(u), '— skip these rows —')}</td></tr>`).join('')}</tbody></table></div>`;
    }
    renderLocs();
    form.addEventListener('change', e => { if (e.target.name === 'map_location') renderLocs(); });
    form.addEventListener('submit', e => {
      e.preventDefault();
      const li = col('location');
      const locFor = r => li < 0 ? form.elements.imp_default.value : (form.elements['imp_loc_' + uniq.indexOf((r[li] || '').trim())] || {}).value || '';
      if (li < 0 && !form.elements.imp_default.value) { const err = $('.form-error', form); err.hidden = false; err.textContent = 'Choose a location for these rows.'; return; }
      let created = 0, updated = 0, skipped = 0, newVendors = 0;
      const now = new Date().toISOString();
      for (const r of data) {
        const locationId = locFor(r);
        if (!locationId) { skipped++; continue; }
        const title = cell(r, 'title') || cell(r, 'description').slice(0, 90) || 'Imported work order';
        let vendorId = '';
        const vn = cell(r, 'vendor');
        if (vn) {
          let v = state.vendors.find(x => x.company.toLowerCase() === vn.toLowerCase());
          if (!v) { v = upsert('vendors', { kind: 'External vendor', company: vn, trade: '', notes: 'Added from ResQ import' }); newVendors++; }
          vendorId = v.id;
        }
        const an = cell(r, 'asset').toLowerCase();
        const asset = an && state.assets.find(a => a.locationId === locationId && a.name.toLowerCase() === an);
        const completedDate = toIsoDate(cell(r, 'completedDate'));
        const catText = [cell(r, 'category'), cell(r, 'asset'), title, cell(r, 'description')].join(' ');
        const rec = {
          resqId: cell(r, 'resqId'), title, description: cell(r, 'description'), locationId, category: guessCategory(catText), assetId: asset ? asset.id : '',
          vendorId, priority: mapPriority(cell(r, 'priority')), status: mapStatus(cell(r, 'status'), completedDate),
          woType: /prevent|\bpm\b/i.test(catText + cell(r, 'category')) ? 'Preventive maintenance' : '',
          reportedDate: toIsoDate(cell(r, 'reportedDate')), dueDate: toIsoDate(cell(r, 'dueDate')), scheduledDate: toIsoDate(cell(r, 'scheduledDate')),
          arrivedDate: toIsoDate(cell(r, 'arrivedDate')), completedDate, cost: parseMoney(cell(r, 'cost')), invoice: cell(r, 'invoice'), po: cell(r, 'po'), source: 'ResQ',
        };
        Object.keys(rec).forEach(k => { if (rec[k] === '') delete rec[k]; });
        const existing = rec.resqId && state.workorders.find(w => w.resqId === rec.resqId);
        if (existing) {
          const changes = existing.status !== rec.status ? `ResQ import: status ${existing.status} → ${rec.status}` : 'Updated from ResQ import';
          upsert('workorders', { ...existing, ...rec, history: [...(existing.history || []), { at: now, text: changes }] });
          updated++;
        } else {
          createWO({ woType: 'Repair', reportedBy: 'ResQ', ...rec, historyText: 'Imported from ResQ' + (rec.resqId ? ' #' + rec.resqId : '') });
          created++;
        }
      }
      closeModal();
      toast(`ResQ import: ${created} new, ${updated} updated${skipped ? `, ${skipped} skipped` : ''}${newVendors ? `, ${newVendors} vendors added` : ''}`, 6000);
      render();
    });
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
    for (const [name, storeNo, address, city, zip, phone, region, format, status] of S.SEED_LOCATIONS) {
      const data = { storeNo, address, city, zip, phone, region, format: format || 'Café' };
      const existing = state.locations.find(l => l.name === name);
      if (existing) {
        let changed = false;
        // A newly known street address replaces the placeholder city / ZIP / region as a set.
        if (address && !existing.address) { Object.assign(existing, { address, city, zip, region }); changed = true; }
        for (const [k, v] of Object.entries(data)) if (v && !existing[k]) { existing[k] = v; changed = true; }
        if (changed) updated++;
        continue;
      }
      upsert('locations', { name, status: status || 'Open', ...data });
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
      report: () => viewReport(r.args[0]),
    };
    if (r.name === 'intake') { handleIntake(r.args[0]); return; }
    document.body.classList.toggle('report-mode', r.name === 'report');
    const html = (views[r.name] || views.dashboard)();
    $('#main').innerHTML = html;
    updateResqNav();
    $$('#nav a').forEach(a => a.classList.toggle('active', a.dataset.route === (r.name === 'loc' ? 'locations' : r.name)));
    document.title = 'Alfred';

    if (focusId) {
      const el = document.getElementById(focusId);
      if (el) { el.focus(); try { el.setSelectionRange(sel[0], sel[1]); } catch (e) { /* ignore */ } }
    }
    loadThumbs();
    if (r.name === 'report') bindReport(r.args[0]);
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
    'qr-label': el => printLabels([byId('assets', el.dataset.id)]),
    'qr-labels': el => {
      const list = state.assets.filter(a => a.locationId === el.dataset.loc && (!el.dataset.cat || a.category === el.dataset.cat)).sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
      if (!list.length) return toast('No equipment tracked here yet');
      printLabels(list);
    },
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
    } else if (kind === 'import-wo-csv') { if (el.files[0]) importWorkOrdersCsv(el.files[0]); el.value = ''; }
    else if (kind === 'setting') { state.settings[el.dataset.key] = el.value.trim(); save(); toast('Saved'); }
    else if (kind === 'resq-url') { state.settings.resqUrl = el.value.trim(); save(); updateResqNav(); toast('ResQ link saved'); }
    else if (kind === 'import-json') { if (el.files[0]) importJson(el.files[0]); el.value = ''; }
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
