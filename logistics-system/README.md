# Swift Logistics OS

A full-stack logistics platform with two front ends over one API:

| Front end | Where | Audience |
|-----------|-------|----------|
| **Customer site** | `*.html` + `assets/` at the repo root | Public — browse services, get an instant quote, book a run, track it |
| **Ops console** | `logistics-system/frontend/public/index.html` | Internal — fleet map, drivers, Kanban, coverage, order lookup |

Everything a customer does on the site writes straight to the same `orders`
table the ops console reads, so a booking made at 2am is on the dispatch
Kanban immediately.

---

## Architecture

```
index.html                   # PUBLIC customer site — home
services.html                #   six services in detail (hover-to-book)
book.html                    #   quote + booking form
track.html                   #   tracking + printable custody report
coverage.html                #   coverage zones + Nairobi map
pricing.html                 #   rate card
custody.html                 #   chain of custody
faq.html                     #   FAQ + policies
assets/                      #   shared site.css / site.js / tailwind-config.js
logistics-system/
├── backend/                 # Express API + SQLite (node:sqlite)
│   ├── src/
│   │   └── index.ts         # API routes, pricing engine, controllers
│   ├── scripts/
│   │   └── init.js          # Seed script (demo data)
│   ├── package.json
│   └── railway.json         # Railway deploy config (persistent /data volume)
├── frontend/                # Internal ops console (static files)
│   ├── public/
│   │   └── index.html       # Ops SPA (vanilla JS)
│   └── package.json
├── serve-dev.js             # Local preview: site + /ops + /api proxy
└── README.md
```

### Tech stack

| Layer        | Technology                             |
|--------------|----------------------------------------|
| Backend      | Node.js + Express + SQLite (`node:sqlite` built-in) |
| Frontend     | Multi-page HTML + Tailwind CSS + vanilla JS (no bundler) |
| Map          | Leaflet.js over OpenStreetMap / HOT / Esri imagery (free, no API key) |
| Database     | SQLite (file-based, zero-config)       |
| Deployment   | Vercel (site) + Railway (API)          |

---

## Deployment

Each part deploys to the host that suits it:

| Part | Host | What ships |
|------|------|------------|
| Customer site | **Vercel** | The repo root as static files (`vercel.json`) — no build step |
| API (Book/Track) | **Railway** | The Express API in `logistics-system/backend`, with a persistent volume for SQLite |
| Ops console | any static host | `logistics-system/frontend/public` — serve it wherever staff reach it |

### Railway — the API

1. Create a project on [railway.com](https://railway.com) → **Deploy from GitHub repo** (this one).
2. In the service's **Settings**, set **Root Directory** to `logistics-system/backend`.
3. Deploy. `railway.json` tells Railway how: Nixpacks builds the TypeScript
   (`npm run build`), `node dist/index.js` starts it, and a persistent volume is
   mounted at `/data`.
4. Add variables:
   - `DB_PATH=/data/logistics.db` — puts the SQLite file on the volume so it
     survives deploys. Without it the DB is ephemeral and vanishes on restart.
   - `PUBLIC_URL=https://<your-vercel-domain>` — origin used to build the
     shareable tracking links dispatch hands to customers.
   - `RATE_LIMIT_*` (optional) — rate-limit window and max (defaults: 600 / 15 min).
   `PORT` is injected by Railway; the server already listens on it.
5. **Networking → Generate Domain** to expose it, e.g.
   `https://<service>-production.up.railway.app`.

The API creates its own tables on boot (`CREATE TABLE IF NOT EXISTS`), so a
fresh volume needs no seeding. For demo data, link the project once
(`railway link`) and run from `logistics-system/backend`:

```bash
railway run node scripts/init.js --force
```

Health check: `GET /api/health` on the Railway domain.

### Vercel — the customer site

1. Import the GitHub repo into Vercel and deploy — it's framework-free, so
   "Other" works; the root pages and `assets/` ship as-is.
2. Point the site at your Railway API by editing **one line** in
   `assets/api-config.js` and pushing:

```js
window.SWIFT_API = 'https://<service>-production.up.railway.app/api';
```

The API has open CORS, so calls from the Vercel domain work cross-origin.
Until this line is set the site degrades gracefully — quotes and rates fall
back to the baked-in cards, and Book/Track say the service is offline.

---

## Customer site

The repo root is the public storefront. It needs no build step and no account —
a customer can get a price and book in one pass.

| Page | File | What it does |
|------|------|--------------|
| Home | `index.html` | Hero, hover-to-book service grid, custody summary, process, coverage, rate cards, FAQ |
| Services | `services.html` | Full detail per service, typical consignments, typical tier |
| Book | `book.html` | Instant server-priced quote and booking form |
| Track | `track.html` | Custody log by reference, plus printable / PDF report |
| Coverage | `coverage.html` | Live service areas on a Nairobi map, zone windows |
| Rates | `pricing.html` | Rate card, how a quote is built, insurance limits |
| Custody | `custody.html` | The five-stage custody process and admissibility |
| FAQ | `faq.html` | Full questions plus privacy / terms / claims |

Shared behaviour lives in `assets/site.js` and `assets/site.css`; every feature
is guarded, so a page that lacks an element (no booking form, say) simply skips
it. The service catalog in `site.js` is the single source for the service grid,
the per-service detail, and the hover-to-book panel.

### Hover to book

Hovering (or tapping) any service card reveals its price for the tier that
usually fits, drawn live from `GET /api/rates`, plus a **Book this service**
button that deep-links to `book.html?tier=<key>&service=<slug>`. The booking
page pre-selects that tier, suggests what to list in the items field, and says
why the tier was chosen — so there is still only one booking form and one
pricing path.

### Tracking links

`PUBLIC_URL` sets the origin used to build shareable tracking links. A link
looks like `https://<PUBLIC_URL>/track.html?ref=LGS-XXXX-XXXX`, and opening it
auto-fills the tracking box and loads the custody log. Ops builds the same link
from the order drawer.

### How it talks to the backend

By default it calls same-origin `/api`. To point it at the hosted Railway API,
edit **one file** — `assets/api-config.js`, which every page loads before
`site.js`:

```js
window.SWIFT_API = 'https://<service>-production.up.railway.app/api';
```

Leave it as an empty string for same-origin (local preview via `serve-dev.js`).

| Feature | Endpoint |
|---------|----------|
| Rate cards on the pricing sections | `GET /api/rates` |
| Hover-to-book prices on the services grid | `GET /api/rates` |
| Instant quote as the form is filled | `POST /api/quotes` |
| Submit a booking | `POST /api/orders` |
| Track by reference | `GET /api/track/reference/:ref` |
| Live coverage areas and the map | `GET /api/coverage` |
| Sample references for the demo chips | `GET /api/demo` |

Every rendered price comes from the server's pricing table — the site cannot
advertise a number that dispatch won't invoice. If the API is unreachable the
pricing section falls back to baked-in cards and the booking form shows
"Quote unavailable offline" rather than guessing.

### Maps

The coverage page loads Leaflet on demand and offers three free basemaps — no
API key, no account: OpenStreetMap standard, OSM Humanitarian, and Esri World
Imagery for satellite context. Service areas are drawn from `GET /api/coverage`
as rectangles. If the CDN is unreachable the page falls back to the zone windows
in text rather than showing an empty box.

### Guest flow, by design

Customers do not sign in. A booking is made with name, phone, and addresses;
tracking uses the reference number issued at booking. The data model already
has room for accounts later without a migration.

---

---

## Local development

### Backend

```bash
cd logistics-system/backend
npm install
npm run build            # compile src/ → dist/ (dist/ is committed, rebuild after edits)
npm run db:init          # create & seed SQLite DB
PORT=4001 npm start      # starts on http://localhost:4001
```

### Frontend

Both front ends are static files with no build step, so `serve-dev.js` is enough
for local work. It serves the customer site from the repo root, the ops console
at `/ops`, and proxies `/api` to the backend.

```bash
cd logistics-system
npm --prefix backend run db:init    # create & seed SQLite DB
PORT=4001 npm --prefix backend start # backend on :4001
node serve-dev.js                   # site + console on :3000 (proxies /api to :4001)
```

---

## API endpoints

| Method | Path                        | Description                     |
|--------|-----------------------------|---------------------------------|
| GET    | `/api/health`               | Health check                    |
| GET    | `/api/vehicles`             | List all vehicles               |
| POST   | `/api/vehicles`             | Create a vehicle                |
| PUT    | `/api/vehicles/:id`         | Update a vehicle (incl. live lat/lng) |
| DELETE | `/api/vehicles/:id`         | Delete a vehicle                |
| GET    | `/api/drivers`              | List all drivers                |
| POST   | `/api/drivers`              | Create a driver                 |
| PUT    | `/api/drivers/:id`          | Update a driver (status, vehicle) |
| DELETE | `/api/drivers/:id`          | Delete a driver                 |
| GET    | `/api/orders`               | List all orders (filterable)    |
| POST   | `/api/orders`               | Create an order                 |
| PUT    | `/api/orders/:id`           | Update an order (status flow)   |
| GET    | `/api/orders/reference/:ref`| Look up by customer reference   |
| GET    | `/api/shipments/active`     | Currently dispatched / in transit |
| PUT    | `/api/shipments/:id/location` | Update live GPS position      |
| GET    | `/api/service_areas`        | List service areas              |
| POST   | `/api/service_areas`        | Create service area             |
| PUT    | `/api/service_areas/:id`    | Update service area             |
| GET    | `/api/delivery_zones`       | List delivery zones             |
| POST   | `/api/delivery_zones`       | Create delivery zone            |
| GET    | `/api/track/:id`            | Tracking payload for customer (order id) |
| GET    | `/api/track/reference/:ref` | Tracking payload by customer reference |
| GET    | `/api/rates`                | Service tiers and zone surcharges (public) |
| POST   | `/api/quotes`               | Instant price quote, nothing persisted |
| GET    | `/api/coverage`             | Public service areas and zones |
| GET    | `/api/demo`                 | A few live references for the tracking demo |

---

## Kanban workflow (order stages)

```
New  →  Assigned  →  In progress  →  Out for delivery  →  Delivered
   (label_printed)  (picking_up)    (out_for_delivery)     ✓
```

Drivers and vehicles are assigned to orders via `current_vehicle_id` and `current_driver_id` on the `orders` table. Shipments carry live GPS coordinates (`live_lat`, `live_lng`) that update in real time on the dashboard map.

The Kanban board is drag-and-drop: dragging a card to another column issues
`PUT /api/orders/:id` with that column's target status. Because a column groups
several real statuses, the drop resolves to one canonical stage per column
(`new`, `assigned`, `in_progress`, `delivered`) rather than guessing.

---

## Features implemented

- ✅ Public customer site, eight pages sharing `assets/site.js` + `assets/site.css`
- ✅ Server-side pricing engine — one rate card drives the site and the invoice
- ✅ Hover-to-book on every service card, deep-linking a pre-selected tier
- ✅ Instant quote, booking, and live tracking, plus a printable custody report
- ✅ Coverage map of Nairobi with OSM / Humanitarian / Esri basemaps (no API key)
- ✅ Live fleet map in ops with real vehicle and shipment positions
- ✅ Kanban board for order stages (new → delivered), fed by website bookings
- ✅ Drag-and-drop between Kanban columns, written to the status API
- ✅ Order detail drawer: custody timeline, quote breakdown, customer link
- ✅ Click-to-draw geofences with draggable corners for areas and zones
- ✅ Customer tracking link per order (`/track.html?ref=…`, auto-filling)
- ✅ Mobile sticky book bar and a WhatsApp contact float
- ✅ Vehicle fleet management, with map placement for new vehicles
- ✅ Driver management
- ✅ Real-time GPS update endpoint, adjustable poll interval, pause when hidden
- ✅ Vercel (site) + Railway (API, persistent SQLite volume) deploys
- ✅ Demo seed data (3 vehicles, 3 drivers, 4 service areas, 3 zones, 4 orders)
- ✅ Output escaping in both front ends (customer text reaches both)

---

## Notes

- SQLite is used for zero-dependency local dev. For production, swap to PostgreSQL via a migration layer.
- The customer site is multi-page HTML and the console is a single page, both with vanilla JS — no bundler required.
- Maps are free and keyless (OpenStreetMap, HOT, Esri). Production use of the Esri and HOT tiles still warrants checking their usage policies.
- Booking is guest-only by design: no accounts, no payment capture. Dispatch confirms the window and invoices out of band.
- `PUBLIC_URL` must be set on the backend for tracking links to resolve to an absolute customer-facing URL.
- `logistics-system/serve-dev.js` is for local preview only; in production Vercel serves the site and Railway serves the API.
