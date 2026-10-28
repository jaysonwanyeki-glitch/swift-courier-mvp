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
│   │   ├── index.ts         # API routes, pricing engine, controllers
│   │   └── scripts/
│   │       └── init.js      # Seed script (demo data)
│   ├── package.json
│   ├── Dockerfile
│   └── docker-compose.yml   # Override for backend port
├── frontend/                # Internal ops console (nginx-served static)
│   ├── public/
│   │   └── index.html       # Ops SPA (vanilla JS)
│   ├── nginx.conf           # /api proxy, / → site, /ops → console
│   └── Dockerfile           # Build context is the repo root
├── serve-dev.js             # Local static preview (no Docker)
├── docker-compose.yml       # Orchestrates backend + frontend
└── README.md
```

### Tech stack

| Layer        | Technology                             |
|--------------|----------------------------------------|
| Backend      | Node.js + Express + SQLite (`node:sqlite` built-in) |
| Frontend     | Multi-page HTML + Tailwind CSS + vanilla JS (no bundler) |
| Map          | Leaflet.js over OpenStreetMap / HOT / Esri imagery (free, no API key) |
| Database     | SQLite (file-based, zero-config)       |
| Deployment   | Docker Compose                         |

---

## Quick start (Docker)

### 1. Start everything

```bash
cd logistics-system
docker compose up -d --build
```

### 2. Open the application

| Resource        | URL                     |
|-----------------|-------------------------|
| **Customer site**   | [http://localhost:3000/](http://localhost:3000/) |
| **Services**        | [http://localhost:3000/services](http://localhost:3000/services) |
| **Book a run**      | [http://localhost:3000/book](http://localhost:3000/book) |
| **Track**           | [http://localhost:3000/track](http://localhost:3000/track) |
| **Coverage map**    | [http://localhost:3000/coverage](http://localhost:3000/coverage) |
| **Rates**           | [http://localhost:3000/pricing](http://localhost:3000/pricing) |
| **Ops console**     | [http://localhost:3000/ops](http://localhost:3000/ops) |
| **Backend API**     | [http://localhost:4001/api](http://localhost:4001/api) |
| **Health check**    | [http://localhost:4001/api/health](http://localhost:4001/api/health) |

> nginx serves the customer site at `/` and the ops console at `/ops`, proxying
> `/api` to the backend. Both front ends only ever need `/api` to reach it.

### 3. Seed demo data

The API creates the schema on first boot but ships no rows, so a fresh
container starts with zero orders. Seed the demo data with:

```bash
docker compose exec backend node scripts/init.js --force
```

Skip this in production if you want an empty dispatch board.

### 4. Stop

```bash
docker compose down
```

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

By default it calls same-origin `/api`. To point it at a backend on another
host, edit **one file** — `assets/api-config.js`, which every page loads before
`site.js`:

```js
window.SWIFT_API = 'https://api.example.com/api';
```

Leave it as an empty string for same-origin (local preview, docker compose,
the nginx proxy).

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

## Manual development (without Docker)

### Backend

```bash
cd backend
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

## Deploying (split: site on Vercel, API in a container)

The customer site is static HTML/CSS/JS and the API is a Node process with a
file-based SQLite database, so they deploy separately.

### 1. Site → Vercel

The repo root is the Vercel project. `vercel.json` enables clean URLs and
baseline security headers; `.vercelignore` excludes `logistics-system/` so only
the eight pages and `assets/` ship.

Before the first deploy, set the API origin in `assets/api-config.js`:

```js
window.SWIFT_API = 'https://<your-api-host>/api';
```

Without it the site calls `/api` on the Vercel domain, which has no backend,
and the pricing section falls back to the baked-in rate card while booking and
tracking fail.

### 2. API → any container host (Railway, Render, Fly, a VPS …)

```bash
cd logistics-system
docker compose up -d --build backend     # image: Node 22, builds TS, runs dist/
```

| Env var       | Required | Purpose |
|---------------|----------|---------|
| `PORT`        | yes (4001) | Port the API listens on |
| `DB_PATH`     | yes      | SQLite file path, e.g. `/data/logistics.db` — put it on a persistent volume |
| `PUBLIC_URL`  | yes      | Origin of the deployed site, used to build tracking links |
| `RATE_LIMIT_*` | no      | Rate limit window and max (defaults: 600 / 15 min) |

The API sends permissive CORS headers, so the Vercel site can call it cross-origin.
Verify with `GET /api/health` before pointing the site at it.

`backend/dist/` is committed, so a host that just runs `npm ci && npm start`
also works; after editing `src/`, run `npm run build` (or let the Dockerfile
build it) to keep `dist/` in sync.

### 3. Ops console

`/ops` is served by the nginx frontend image (`docker compose up frontend`) and
is **not** part of the Vercel deploy — it is the internal console. Run the full
compose stack on a host if dispatch needs it publicly, and put it behind auth.

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
- ✅ Docker Compose for local dev
- ✅ Demo seed data (3 vehicles, 3 drivers, 4 service areas, 3 zones, 4 orders)
- ✅ Output escaping in both front ends (customer text reaches both)

---

## Notes

- SQLite is used for zero-dependency local dev. For production, swap to PostgreSQL via a migration layer.
- The customer site is multi-page HTML and the console is a single page, both with vanilla JS — no bundler required.
- Maps are free and keyless (OpenStreetMap, HOT, Esri). Production use of the Esri and HOT tiles still warrants checking their usage policies.
- Booking is guest-only by design: no accounts, no payment capture. Dispatch confirms the window and invoices out of band.
- `PUBLIC_URL` must be set on the backend for tracking links to resolve to an absolute customer-facing URL.
- `logistics-system/serve-dev.js` is for local preview only; nginx serves the same layout under Docker.
