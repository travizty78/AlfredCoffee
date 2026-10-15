# Alfred Facilities

An offline-first facility management app for Alfred Coffee's California cafés, HQ (Van Nuys), and warehouse. It is built around the Facilities Manager role: maintenance and repairs across 27+ cafés, the internal facilities team and beverage equipment tech, vendor accountability, preventive maintenance, signage and new-café projects, cleaning standards, and budgets and repair-vs-replace calls with Operations and Finance. It runs in any modern browser (Chromebook, laptop, phone, tablet). You can install it as an app, and it keeps working with no internet connection.

## What it tracks

| Area | What you get |
|---|---|
| **Locations** | Address, store #, manager & district manager, hours, sq ft, landlord / PM, lease expiration and maintenance responsibilities, health permit, **water / gas / electrical shutoff locations**, and after-hours access notes |
| **Facility systems** (22 categories, including Signage & graphics and Cleaning & janitorial; each with its own fields and dropdowns) | Coffee equipment · Ice & water / filters · Refrigeration · HVAC · Lighting · Plumbing · Restrooms · Fire sprinklers & life safety · Electrical panels (with circuit directory) · Doors & locks · Alarm & security · Flooring · Painting & finishes · Ceilings · Windows & glass · Seating, counters & tables · Kitchen & small equipment · Roof & exterior · Utilities & accounts · Pest control |
| **Every asset** | Type, area, make (brand suggestions), model, serial, asset tag, condition, status, service vendor, install / warranty / last / next service dates, notes, photos and files, and its full work order history with total spend |
| **Work orders** | Auto-numbered (WO-0001). Types include repair, PM, project, signage install, new café opening, renovation, cleaning, and replacement. You can assign the internal team, the bev tech, or a vendor, and record operational impact. Priority P1–P4 sets the due date automatically. Covers status workflow, vendor assignment, PO / invoice / ticket #, estimate vs. actual cost, warranty claims, photos, and an activity log. You can change status inline and export to CSV |
| **QR equipment labels** | Print a QR sticker for any item, a whole system, or a whole café. Staff scan it with their phone camera (no app or login needed) to open a simple form: *What's wrong?* → *Can it still be used?* → *Who should handle it?* (on-site team / Alfred maintenance tech / vendor / not sure). Choosing on-site team shows safe self-fix steps for that equipment type. Then one tap texts or emails facilities, with a "call vendor" button when they picked vendor. The message includes a link that opens a **pre-filled work order** here: café, asset, priority from impact, and the bev tech, facilities team or the asset's vendor already assigned. Tapping the link twice won't create a duplicate |
| **ResQ bridge** | If Alfred runs work orders in ResQ, ResQ stays the system of record for requests, dispatch, quotes and invoices. Each work order has a ResQ # and link, and there's an "Open ResQ" shortcut. **Import ResQ CSV exports**: columns and café names are matched automatically (e.g. "Alfred Coffee - BH" → Beverly Hills), vendors are created as needed, and re-importing updates existing ResQ #s instead of duplicating them. Imported history feeds Reports and asset histories |
| **Preventive maintenance** | A one-click standard café PM program with 28 tasks (fire extinguishers, sprinklers, hood, backflow, grease trap, HVAC filters, ice machine sanitizing, water filters, espresso PM, coils, pest, roof…). ✓ Done rolls the next due date forward |
| **Site visits** | A 30-point walkthrough checklist (exterior, front of house, bar, back of house, restrooms, life safety, cleanliness) with a ✓ / ! / ✗ tap per item, a score, and a cleanliness rating. Every ✗ or ! automatically becomes a work order (P2 or P3). A visit-coverage list shows which cafés have gone longest without a visit |
| **Reports** | Spend by location vs. annual budget, spend by system and by work type, team and vendor performance (response time, days to complete, on-time %, spend), recurring issues (assets or location × system with 3+ WOs), and **repair-vs-replace** candidates |
| **Team & vendors** | Trade, contacts, tap-to-call, after-hours line, account #, CSLB license, **COI expiration alerts**, W-9, contract / NTE, response SLA, rating, preferred flag, and locations served |
| **Photos everywhere** | Photos and screenshots for each café, each emergency shutoff (water / gas / electric), the floor plan and life safety plan, each facility system, and each piece of equipment. Phone photos are shrunk automatically before saving |
| **Plans & documents** | Floor plans, life safety / evacuation plans, as-builts, permits, manuals, warranties, invoices, and photos. Once opened, they're kept on the device for offline use |
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

## Setting up QR labels

1. Host the app (Option B above). Phones can only open a scanned label from a web address, not from a file.
2. Go to Settings → **QR codes & facilities contact** and enter the name, mobile # and email that reports should go to, plus the hosted URL.
3. Add equipment, then click **🏷️** on an item, **QR labels** on a system, or **Print all labels** on a café's overview. Print on weatherproof label stock.

Contact info and equipment details are printed into each code, so reprint labels if they change.

If ResQ QR stickers are already on Alfred's equipment, don't add a second sticker to the same device. Use these labels for anything ResQ doesn't cover.

## Sign-in & sync (Supabase)

Everyone on the team signs in, and everyone sees the same information on every phone and computer. The app keeps a copy on each device, so it's instant and works with no signal. Changes sync automatically when you're online.

One-time setup:
1. In Supabase, open **SQL Editor → New query**, paste all of [`supabase-setup.sql`](supabase-setup.sql), and click **Run**.
2. Go to **Project Settings → API** and copy the **Project URL** and the **anon / publishable key** into [`js/config.js`](js/config.js). Never use the `service_role` / secret key.
3. Go to **Authentication → URL Configuration** and set the **Site URL** to the Netlify address. This makes "Forgot password" emails link back to the app.
4. **Coworker sign-up:** run [`supabase-signup.sql`](supabase-signup.sql) in the SQL Editor. Then, in **Authentication → Sign In / Providers**, turn **on** "Allow new users to sign up" and turn **off** "Confirm email". Coworkers tap **Create an account** on the sign-in screen and use their **@alfred.la** email. Other addresses are rejected by the database. Admin emails outside @alfred.la go in the `allowed_emails` table.

Supabase's built-in email only delivers to your own Supabase account, so password-reset emails won't reach coworkers. To enable them, add your own email sender under **Authentication → Emails → SMTP Settings** (for example, Gmail with an app password).

On first sign-in, the app loads Alfred's café list automatically. Photos and documents are stored in a private Supabase bucket that only signed-in users can open.

Until `js/config.js` is filled in, the app runs on the device only, with no login.

## Starter data

*Load Alfred café list* adds the 24 Los Angeles-area cafés from locations.alfred.la (address, phone, and online-order code as store #), plus **Calabasas (new build)** (status *Under construction*), **Alfred HQ** at 708 N Croft Ave, Los Angeles 90069, and the **Warehouse** at 6711 Odessa Ave, Van Nuys 91406. Running it again fills in blank fields without overwriting your edits. If the earlier guessed starter list was loaded, it renames those entries to the real cafés and removes placeholders that have no data attached.

The standard PM frequencies reflect common industry practice. Confirm them against manufacturer manuals, NFPA 25 / CA Title 19, your local fire and health departments, and each lease.

## Third-party code

`js/vendor/supabase.js` ([supabase-js](https://github.com/supabase/supabase-js) 2.117.2, MIT) and `js/vendor/qrcode.js` ([qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) 1.4.4, MIT).

## Tech

Plain HTML, CSS and JavaScript, with no build step and no dependencies.
`index.html` · `css/app.css` · `js/schema.js` (categories, fields, dropdown options; edit this to add fields) · `js/db.js` (IndexedDB) · `js/app.js` (UI) · `sw.js` (offline cache; bump `VERSION` when you change files).
