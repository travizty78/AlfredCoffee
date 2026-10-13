# Alfred Facilities

An offline-first facility management app for Alfred Coffee's California cafés, HQ (Van Nuys), and warehouse. It is built around the Facilities Manager role: maintenance and repairs across 27+ cafés, the internal facilities team and beverage equipment tech, vendor accountability, preventive maintenance, signage and new-café projects, cleaning standards, and budgets and repair-vs-replace calls with Operations and Finance. It runs in any modern browser (Chromebook, laptop, phone, tablet). You can install it as an app, and it keeps working with no internet connection.

## What it tracks

| Area | What you get |
|---|---|
| **Locations** | Address, store #, manager & district manager, hours, sq ft, landlord / PM, lease expiration and maintenance responsibilities, health permit, **water / gas / electrical shutoff locations**, and after-hours access notes |
| **Facility systems** (22 categories, including Signage & graphics and Cleaning & janitorial; each with its own fields and dropdowns) | Coffee equipment · Ice & water / filters · Refrigeration · HVAC · Lighting · Plumbing · Restrooms · Fire sprinklers & life safety · Electrical panels (with circuit directory) · Doors & locks · Alarm & security · Flooring · Painting & finishes · Ceilings · Windows & glass · Seating, counters & tables · Kitchen & small equipment · Roof & exterior · Utilities & accounts · Pest control |
| **Every asset** | Type, area, make (brand suggestions), model, serial, asset tag, condition, status, service vendor, install / warranty / last / next service dates, notes, photos and files, and its full work order history with total spend |
| **Work orders** | Auto-numbered (WO-0001). Types include repair, PM, project, signage install, new café opening, renovation, cleaning, and replacement. You can assign the internal team, the bev tech, or a vendor, and record operational impact. Priority P1–P4 sets the due date automatically. Covers status workflow, vendor assignment, PO / invoice / ticket #, estimate vs. actual cost, warranty claims, photos, and an activity log. You can change status inline and export to CSV |
| **Preventive maintenance** | A one-click standard café PM program with 28 tasks (fire extinguishers, sprinklers, hood, backflow, grease trap, HVAC filters, ice machine sanitizing, water filters, espresso PM, coils, pest, roof…). ✓ Done rolls the next due date forward |
| **Site visits** | A 30-point walkthrough checklist (exterior, front of house, bar, back of house, restrooms, life safety, cleanliness) with a ✓ / ! / ✗ tap per item, a score, and a cleanliness rating. Every ✗ or ! automatically becomes a work order (P2 or P3). A visit-coverage list shows which cafés have gone longest without a visit |
| **Reports** | Spend by location vs. annual budget, spend by system and by work type, team and vendor performance (response time, days to complete, on-time %, spend), recurring issues (assets or location × system with 3+ WOs), and **repair-vs-replace** candidates |
| **Team & vendors** | Trade, contacts, tap-to-call, after-hours line, account #, CSLB license, **COI expiration alerts**, W-9, contract / NTE, response SLA, rating, preferred flag, and locations served |
| **Plans & documents** | Floor plans, life safety / evacuation plans, as-builts, permits, manuals, warranties, invoices, and photos. They are stored on the device and open offline |
| **Dashboard** | Open / emergency / overdue WOs, overdue and upcoming PM, expiring COIs and warranties, inspections due, monthly repair spend, and a per-location status table |
| **Search** | One box searches everything: serial #, model, filter part #, vendor, WO #, and PO |

## Using it

**Option A: open the file directly.** Download or clone this repo and double-click `index.html`. Everything works, including offline use, because the app is fully local.

**Option B: host it (recommended so you can install it as an app on Chromebook / phone).**
1. On GitHub, open this repo and go to **Settings → Pages**.
2. Under Source, choose **Deploy from a branch**, pick the branch, select `/ (root)`, and click Save.
3. Open the URL GitHub gives you (e.g. `https://travizty78.github.io/AlfredCoffee/`).
4. In Chrome, click the **Install** icon in the address bar. On iPhone, use Share → **Add to Home Screen**.

After the first visit, the service worker caches the app so it opens with no signal.

## Your data — important

- Data is saved in the browser's local storage (IndexedDB) **on that one device only**. Nothing is sent to a server.
- **Back up regularly:** go to Settings → *Full backup (with files)*, which downloads a `.json` file. Save it to Google Drive. Use *Restore backup* to load it on another device.
- Clearing browser data / site data for this page erases it. Settings → *Ask browser to keep data permanently* helps prevent automatic eviction. Installing the app also helps.
- Don't store alarm codes or passwords. There is a "passcode hint" field only.

## Starter data

*Load Alfred café list* adds the 24 Los Angeles-area cafés from locations.alfred.la (address, phone, and online-order code as store #), plus **Alfred HQ (Van Nuys)** and **Warehouse** with addresses left blank. Running it again fills in blank fields without overwriting your edits. If the earlier guessed starter list was loaded, it renames those entries to the real cafés and removes placeholders that have no data attached.

The standard PM frequencies reflect common industry practice. Confirm them against manufacturer manuals, NFPA 25 / CA Title 19, your local fire and health departments, and each lease.

## Tech

Plain HTML, CSS and JavaScript, with no build step and no dependencies.
`index.html` · `css/app.css` · `js/schema.js` (categories, fields, dropdown options; edit this to add fields) · `js/db.js` (IndexedDB) · `js/app.js` (UI) · `sw.js` (offline cache; bump `VERSION` when you change files).
