"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const fs_1 = require("fs");
const path_1 = require("path");
const node_sqlite_1 = require("node:sqlite");
const uuid_1 = require("uuid");
// ── Database bootstrap ───────────────────────────────────────────────────
// Resolve the data directory from the *configured* path, not __dirname, so the
// same code works from `src/` (tsx), `dist/` (compiled) and the Docker image.
const DB_PATH = process.env.DB_PATH
    ? (0, path_1.join)(process.env.DB_PATH)
    : (0, path_1.join)(__dirname, '../../data/logistics.db');
(0, fs_1.mkdirSync)((0, path_1.dirname)(DB_PATH), { recursive: true });
const db = new node_sqlite_1.DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA busy_timeout = 5000');
// ── Schema ───────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS vehicles (
    id TEXT PRIMARY KEY,
    plate TEXT NOT NULL,
    make TEXT,
    model TEXT,
    colour TEXT,
    status TEXT DEFAULT 'idle',
    latitude REAL,
    longitude REAL,
    last_updated TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS drivers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT,
    license_number TEXT,
    vehicle_id TEXT,
    status TEXT DEFAULT 'offline',
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id)
  );

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    reference TEXT NOT NULL,
    customer_name TEXT,
    customer_phone TEXT,
    customer_email TEXT,
    customer_address TEXT,
    pickup_address TEXT,
    delivery_address TEXT,
    items TEXT,
    weight_kg REAL,
    declared_value REAL,
    service_tier TEXT DEFAULT 'standard',
    status TEXT DEFAULT 'new',
    current_stage TEXT,
    current_vehicle_id TEXT,
    current_driver_id TEXT,
    seal_number TEXT,
    tracking_link TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    delivered_at TEXT
  );

  CREATE TABLE IF NOT EXISTS shipments (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    vehicle_id TEXT,
    driver_id TEXT,
    from_address TEXT,
    to_address TEXT,
    status TEXT DEFAULT 'dispatched',
    live_lat REAL,
    live_lng REAL,
    started_at TEXT,
    completed_at TEXT,
    last_updated TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id),
    FOREIGN KEY (driver_id) REFERENCES drivers(id)
  );

  CREATE TABLE IF NOT EXISTS service_areas (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    color TEXT,
    lat_min REAL,
    lat_max REAL,
    lng_min REAL,
    lng_max REAL
  );

  CREATE TABLE IF NOT EXISTS delivery_zones (
    id TEXT PRIMARY KEY,
    area_id TEXT,
    name TEXT NOT NULL,
    description TEXT,
    lat_min REAL,
    lat_max REAL,
    lng_min REAL,
    lng_max REAL,
    FOREIGN KEY (area_id) REFERENCES service_areas(id)
  );

  CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
  CREATE INDEX IF NOT EXISTS idx_orders_reference ON orders(reference);
  CREATE INDEX IF NOT EXISTS idx_shipments_order ON shipments(order_id);
  CREATE INDEX IF NOT EXISTS idx_shipments_vehicle ON shipments(vehicle_id);
  CREATE INDEX IF NOT EXISTS idx_service_areas ON service_areas(name);
  CREATE INDEX IF NOT EXISTS idx_zones ON delivery_zones(area_id);
`);
// ── Lightweight migrations ───────────────────────────────────────────────
// CREATE TABLE IF NOT EXISTS is a no-op on pre-existing databases, so columns
// added after the first release have to be applied separately.
const addColumnIfMissing = (table, column, definition) => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all();
    if (!cols.some((c) => c.name === column)) {
        // SQLite rejects non-constant defaults (e.g. CURRENT_TIMESTAMP) in
        // ALTER TABLE ADD COLUMN, so a failed migration must not kill startup.
        try {
            db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
        }
        catch (err) {
            console.warn(`[migration] could not add ${table}.${column}:`, err.message);
        }
    }
};
addColumnIfMissing('shipments', 'last_updated', 'TEXT');
addColumnIfMissing('orders', 'seal_number', 'TEXT');
addColumnIfMissing('orders', 'price_quote', 'TEXT');
addColumnIfMissing('orders', 'recipient_name', 'TEXT');
addColumnIfMissing('orders', 'recipient_phone', 'TEXT');
addColumnIfMissing('orders', 'scheduled_for', 'TEXT');
addColumnIfMissing('orders', 'instructions', 'TEXT');
// ── Helpers ──────────────────────────────────────────────────────────────
const generateReference = () => {
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `LGS-${Date.now().toString(36).toUpperCase()}-${rand}`;
};
const now = () => new Date().toISOString();
const baseUrl = () => (process.env.PUBLIC_URL || '').replace(/\/+$/, '');
/**
 * The customer site is a single page with a `#track` section, so a tracking link
 * carries the reference in the query string and the site auto-fills the box.
 * Without PUBLIC_URL we still return a usable site-relative link.
 */
const trackingLinkFor = (id, reference) => `${baseUrl()}/?ref=${encodeURIComponent(reference)}#track`;
/** SQLite rejects booleans/undefined — normalise to something storable. */
const scalar = (value) => {
    if (value === undefined || value === null || value === '')
        return null;
    if (typeof value === 'boolean')
        return value ? 1 : 0;
    if (typeof value === 'number' || typeof value === 'string')
        return value;
    return null;
};
const parseJsonColumn = (raw) => {
    if (typeof raw !== 'string' || raw.length === 0)
        return null;
    try {
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
};
/** Orders go out to the API with `items` as JSON text; hydrate them. */
const withParsedItems = (row) => ({
    ...row,
    items: parseJsonColumn(row.items),
});
const findVehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?');
const findDriver = db.prepare('SELECT * FROM drivers WHERE id = ?');
/** Wrap a handler so thrown errors become 500 JSON instead of crashing the process. */
const handle = (fn) => (req, res) => {
    try {
        fn(req, res);
    }
    catch (err) {
        console.error(`[error] ${req.method} ${req.originalUrl}`, err);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Internal server error' });
        }
    }
};
// ── Tracking timeline ────────────────────────────────────────────────────
const CUSTODY_STAGES = [
    { key: 'sealed', title: 'Picked up & sealed', detail: 'Item photographed, weighed, and closed with a numbered seal.' },
    { key: 'handoff', title: 'Witnessed handoff', detail: 'Possession transferred and confirmed in the presence of a witness.' },
    { key: 'transit', title: 'In transit', detail: 'Direct route under GPS monitoring. No sorting hubs.' },
    { key: 'out_for_delivery', title: 'Out for delivery', detail: 'Courier is within the recipient zone. Arrival notice sent.' },
    { key: 'delivered', title: 'Delivered & signed', detail: 'Seal verified, signature captured, custody log archived.' },
];
/** Map a raw order status onto how far along the custody timeline it is. */
const custodyProgress = (status) => {
    switch (status) {
        case 'new':
        case 'assigned':
            return 0;
        case 'in_progress':
            return 1;
        case 'label_printed':
            return 2;
        case 'picking_up':
            return 3;
        case 'out_for_delivery':
            return 4;
        case 'delivered':
            return 5;
        case 'exception':
            return 2;
        default:
            return 0;
    }
};
const SERVICE_TIERS = [
    {
        key: 'standard',
        name: 'Standard',
        tagline: 'Next-day delivery across Nairobi',
        base_fee: 450,
        per_kg: 25,
        included_kg: 1,
        surcharge_pct: 0,
        eta: 'Next day',
        features: ['Sealed & witnessed handoff', 'Email custody log', 'KSh 200,000 cover'],
    },
    {
        key: 'priority',
        name: 'Priority',
        tagline: 'Same-day for anything filed before 2pm',
        base_fee: 850,
        per_kg: 40,
        included_kg: 1,
        surcharge_pct: 0,
        eta: 'Same day',
        features: ['Named courier', 'Live GPS tracking', 'Direct signature', 'KSh 2,000,000 cover'],
    },
    {
        key: 'express',
        name: 'Express',
        tagline: '2-hour window inside the inner zone',
        base_fee: 1500,
        per_kg: 65,
        included_kg: 1,
        surcharge_pct: 0,
        eta: '2 hours',
        features: ['Two-hour delivery window', 'Priority dispatch 24/7', 'Court-ready documentation', 'KSh 20,000,000 cover'],
    },
    {
        key: 'charter',
        name: 'Dedicated Charter',
        tagline: 'A vehicle and crew reserved for you',
        base_fee: 4500,
        per_kg: 100,
        included_kg: 5,
        surcharge_pct: 0,
        eta: 'Scheduled',
        features: ['Dedicated vehicle & crew', 'Armored carriage available', 'Two-person witnessed handoff', 'KSh 50,000,000 cover'],
    },
];
/** Zone surcharges are derived from the seeded coverage areas, with sane defaults. */
const ZONE_SURCHARGES = {
    'nairobi cbd': 0,
    westlands: 0,
    'upper hill': 100,
    parklands: 50,
    kilimani: 100,
    'karen blixen road': 250,
    muthurwa: 50,
};
const DEFAULT_ZONE_SURCHARGE = 150;
/** Declared value above this is insured separately rather than folded into the rate. */
const INSURED_VALUE_CAP = 50_000_000;
const INSURANCE_RATE = 0.008; // 0.8% of declared value
const roundKsh = (value) => Math.round(value);
/** Parse a positive number from untrusted input; returns null when unusable. */
const positiveNumber = (value) => {
    const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
    return Number.isFinite(n) && n > 0 ? n : null;
};
/** Normalise a tier key, defaulting to standard for unknown/missing values. */
const resolveTier = (key) => SERVICE_TIERS.find((t) => t.key === String(key ?? '').trim().toLowerCase()) ?? SERVICE_TIERS[0];
/**
 * Compute a price breakdown for a prospective run.
 * Unknown zones fall back to a default surcharge rather than failing, so the
 * form always gives the customer a number.
 */
const computeQuote = (req) => {
    const tier = resolveTier(req.service_tier);
    const weight = positiveNumber(req.weight_kg) ?? 1;
    const declaredValue = positiveNumber(req.declared_value) ?? 0;
    const zoneName = String(req.zone ?? '').trim();
    const zoneKey = zoneName.toLowerCase();
    const matchedZone = Object.keys(ZONE_SURCHARGES).find((k) => zoneKey.includes(k));
    const zoneSurcharge = zoneKey
        ? matchedZone
            ? ZONE_SURCHARGES[matchedZone]
            : DEFAULT_ZONE_SURCHARGE
        : 0;
    const billableKg = Math.max(weight - tier.included_kg, 0);
    const weightCharge = roundKsh(billableKg * tier.per_kg);
    const insuredValue = Math.min(declaredValue, INSURED_VALUE_CAP);
    const insurance = roundKsh(insuredValue * INSURANCE_RATE);
    const subtotal = tier.base_fee + weightCharge + roundKsh(zoneSurcharge) + insurance;
    const vat = roundKsh(subtotal * 0.16);
    const total = subtotal + vat;
    return {
        currency: 'KES',
        service_tier: tier.key,
        service_name: tier.name,
        eta: tier.eta,
        weight_kg: weight,
        declared_value: declaredValue,
        zone: zoneName || null,
        insured_value: insuredValue,
        lines: [
            { label: `${tier.name} base fee`, amount: tier.base_fee },
            ...(weightCharge > 0
                ? [{
                        label: `Weight — ${billableKg} kg over the ${tier.included_kg} kg included @ KSh ${tier.per_kg}/kg`,
                        amount: weightCharge,
                    }]
                : []),
            ...(zoneSurcharge > 0
                ? [{ label: `Zone surcharge — ${zoneName || 'out of zone'}`, amount: roundKsh(zoneSurcharge) }]
                : []),
            ...(insurance > 0
                ? [{ label: `Transit insurance (0.8% of KSh ${insuredValue.toLocaleString('en-KE')})`, amount: insurance }]
                : []),
            { label: 'VAT (16%)', amount: vat },
        ],
        subtotal,
        total,
        cover_note: declaredValue > INSURED_VALUE_CAP
            ? `Declared value above KSh ${INSURED_VALUE_CAP.toLocaleString('en-KE')} is quoted separately — dispatch will confirm.`
            : null,
    };
};
// ── App ──────────────────────────────────────────────────────────────────
const app = (0, express_1.default)();
app.set('trust proxy', 1);
app.use((0, cors_1.default)());
app.use(express_1.default.json({ limit: '64kb' }));
const limiter = (0, express_rate_limit_1.default)({
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
    max: Number(process.env.RATE_LIMIT_MAX || 600),
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api', limiter);
// Malformed JSON should be a 400, not an unhandled throw.
app.use((err, _req, res, next) => {
    if (err && typeof err === 'object' && 'type' in err && err.type === 'entity.parse.failed') {
        return res.status(400).json({ error: 'Invalid JSON body' });
    }
    return next(err);
});
// ── Health ───────────────────────────────────────────────────────────────
app.get('/api/health', handle((_req, res) => {
    const { count } = db.prepare('SELECT COUNT(*) AS count FROM orders').get();
    res.json({ status: 'ok', service: 'swift-logistics-api', orders: count, timestamp: now() });
}));
// ── Vehicles ─────────────────────────────────────────────────────────────
app.get('/api/vehicles', handle((_req, res) => {
    res.json(db.prepare('SELECT * FROM vehicles ORDER BY last_updated DESC').all());
}));
app.get('/api/vehicles/:id', handle((req, res) => {
    const row = findVehicle.get(req.params.id);
    if (!row)
        return res.status(404).json({ error: 'Vehicle not found' });
    res.json(row);
}));
app.post('/api/vehicles', handle((req, res) => {
    const { plate, make, model, colour, status, latitude, longitude } = req.body ?? {};
    if (!plate)
        return res.status(400).json({ error: 'plate is required' });
    const id = (0, uuid_1.v4)();
    db.prepare('INSERT INTO vehicles (id, plate, make, model, colour, status, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(id, String(plate), scalar(make), scalar(model), scalar(colour), scalar(status) ?? 'idle', scalar(latitude), scalar(longitude));
    res.status(201).json({ id, plate, message: 'Vehicle added' });
}));
app.put('/api/vehicles/:id', handle((req, res) => {
    const { plate, make, model, colour, status, latitude, longitude } = req.body ?? {};
    if (!findVehicle.get(req.params.id))
        return res.status(404).json({ error: 'Vehicle not found' });
    db.prepare(`UPDATE vehicles SET plate = COALESCE(?, plate),
                         make = COALESCE(?, make),
                         model = COALESCE(?, model),
                         colour = COALESCE(?, colour),
                         status = COALESCE(?, status),
                         latitude = COALESCE(?, latitude),
                         longitude = COALESCE(?, longitude),
                         last_updated = CURRENT_TIMESTAMP
      WHERE id = ?`).run(scalar(plate), scalar(make), scalar(model), scalar(colour), scalar(status), scalar(latitude), scalar(longitude), req.params.id);
    res.json({ id: req.params.id, message: 'Vehicle updated' });
}));
app.delete('/api/vehicles/:id', handle((req, res) => {
    const result = db.prepare('DELETE FROM vehicles WHERE id = ?').run(req.params.id);
    if (result.changes === 0)
        return res.status(404).json({ error: 'Vehicle not found' });
    res.json({ id: req.params.id, message: 'Vehicle deleted' });
}));
// ── Drivers ──────────────────────────────────────────────────────────────
app.get('/api/drivers', handle((_req, res) => {
    res.json(db.prepare('SELECT * FROM drivers ORDER BY name').all());
}));
app.get('/api/drivers/:id', handle((req, res) => {
    const row = findDriver.get(req.params.id);
    if (!row)
        return res.status(404).json({ error: 'Driver not found' });
    res.json(row);
}));
app.post('/api/drivers', handle((req, res) => {
    const { name, phone, license_number, vehicle_id, status } = req.body ?? {};
    if (!name)
        return res.status(400).json({ error: 'name is required' });
    if (vehicle_id && !findVehicle.get(vehicle_id)) {
        return res.status(400).json({ error: 'vehicle_id does not exist' });
    }
    const id = (0, uuid_1.v4)();
    db.prepare('INSERT INTO drivers (id, name, phone, license_number, vehicle_id, status) VALUES (?, ?, ?, ?, ?, ?)').run(id, String(name), scalar(phone), scalar(license_number), scalar(vehicle_id), scalar(status) ?? 'offline');
    res.status(201).json({ id, name, message: 'Driver added' });
}));
app.put('/api/drivers/:id', handle((req, res) => {
    const { name, phone, license_number, vehicle_id, status } = req.body ?? {};
    if (!findDriver.get(req.params.id))
        return res.status(404).json({ error: 'Driver not found' });
    db.prepare(`UPDATE drivers SET name = COALESCE(?, name),
                        phone = COALESCE(?, phone),
                        license_number = COALESCE(?, license_number),
                        vehicle_id = COALESCE(?, vehicle_id),
                        status = COALESCE(?, status)
     WHERE id = ?`).run(scalar(name), scalar(phone), scalar(license_number), scalar(vehicle_id), scalar(status), req.params.id);
    res.json({ id: req.params.id, message: 'Driver updated' });
}));
app.delete('/api/drivers/:id', handle((req, res) => {
    const result = db.prepare('DELETE FROM drivers WHERE id = ?').run(req.params.id);
    if (result.changes === 0)
        return res.status(404).json({ error: 'Driver not found' });
    res.json({ id: req.params.id, message: 'Driver deleted' });
}));
// ── Orders ───────────────────────────────────────────────────────────────
app.get('/api/orders', handle((req, res) => {
    const { status, search, limit = '50', offset = '0' } = req.query;
    const maxLimit = Math.min(Math.max(parseInt(String(limit), 10) || 50, 1), 500);
    const startOffset = Math.max(parseInt(String(offset), 10) || 0, 0);
    const where = [];
    const params = [];
    if (status && status !== 'all') {
        where.push('status = ?');
        params.push(String(status));
    }
    if (search) {
        where.push('(reference LIKE ? OR customer_name LIKE ? OR delivery_address LIKE ?)');
        const term = `%${String(search)}%`;
        params.push(term, term, term);
    }
    const sql = 'SELECT * FROM orders' +
        (where.length ? ` WHERE ${where.join(' AND ')}` : '') +
        ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    const rows = db.prepare(sql).all(...params, maxLimit, startOffset);
    res.json(rows.map(withParsedItems));
}));
// NOTE: this must stay above `/api/orders/:id` or Express will treat the
// literal string "reference" as an order id.
app.get('/api/orders/reference/:ref', handle((req, res) => {
    const row = db.prepare('SELECT * FROM orders WHERE reference = ?').get(req.params.ref);
    if (!row)
        return res.status(404).json({ error: 'Order not found' });
    res.json(withParsedItems(row));
}));
app.get('/api/orders/:id', handle((req, res) => {
    const row = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
    if (!row)
        return res.status(404).json({ error: 'Order not found' });
    res.json(withParsedItems(row));
}));
app.post('/api/orders', handle((req, res) => {
    const { customer_name, customer_phone, customer_email, customer_address, pickup_address, delivery_address, items, weight_kg, declared_value, service_tier, seal_number, recipient_name, recipient_phone, scheduled_for, instructions, quote, } = req.body ?? {};
    if (!delivery_address)
        return res.status(400).json({ error: 'delivery_address is required' });
    const id = (0, uuid_1.v4)();
    const reference = generateReference();
    // Recompute the quote server-side unless dispatch explicitly sent a locked
    // one, so the stored figure always matches the pricing table.
    const storedQuote = quote && typeof quote === 'object'
        ? quote
        : computeQuote({ weight_kg, declared_value, service_tier, zone: delivery_address });
    db.prepare(`INSERT INTO orders (id, reference, customer_name, customer_phone, customer_email, customer_address,
                         pickup_address, delivery_address, items, weight_kg, declared_value,
                         service_tier, status, current_stage, seal_number, tracking_link,
                         price_quote, recipient_name, recipient_phone, scheduled_for, instructions)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, reference, scalar(customer_name), scalar(customer_phone), scalar(customer_email), scalar(customer_address), scalar(pickup_address), String(delivery_address), items ? JSON.stringify(items) : null, scalar(weight_kg), scalar(declared_value), scalar(service_tier) ?? 'standard', 'new', 'new', scalar(seal_number), trackingLinkFor(id, reference), JSON.stringify(storedQuote), scalar(recipient_name), scalar(recipient_phone), scalar(scheduled_for), scalar(instructions));
    res.status(201).json({
        id,
        reference,
        status: 'new',
        tracking_link: trackingLinkFor(id, reference),
        quote: storedQuote,
    });
}));
app.put('/api/orders/:id', handle((req, res) => {
    const { customer_name, customer_phone, customer_email, customer_address, pickup_address, delivery_address, items, weight_kg, declared_value, service_tier, status, current_stage, current_vehicle_id, current_driver_id, seal_number, recipient_name, recipient_phone, scheduled_for, instructions, } = req.body ?? {};
    const existing = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
    if (!existing)
        return res.status(404).json({ error: 'Order not found' });
    const updates = [];
    const values = [];
    const assign = (column, value, transform) => {
        if (value === undefined)
            return;
        updates.push(`${column} = ?`);
        values.push(scalar(transform ? transform(value) : value));
    };
    assign('customer_name', customer_name);
    assign('customer_phone', customer_phone);
    assign('customer_email', customer_email);
    assign('customer_address', customer_address);
    assign('pickup_address', pickup_address);
    assign('delivery_address', delivery_address);
    assign('weight_kg', weight_kg);
    assign('declared_value', declared_value);
    assign('service_tier', service_tier);
    assign('status', status);
    assign('current_stage', current_stage);
    assign('current_vehicle_id', current_vehicle_id);
    assign('current_driver_id', current_driver_id);
    assign('seal_number', seal_number);
    assign('recipient_name', recipient_name);
    assign('recipient_phone', recipient_phone);
    assign('scheduled_for', scheduled_for);
    assign('instructions', instructions);
    if (items !== undefined) {
        updates.push('items = ?');
        values.push(items === null ? null : JSON.stringify(items));
    }
    if (status === 'delivered' || status === 'exception') {
        updates.push('delivered_at = CURRENT_TIMESTAMP');
    }
    if (updates.length === 0)
        return res.json({ id: req.params.id, message: 'No changes' });
    values.push(req.params.id);
    db.prepare(`UPDATE orders SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(...values);
    res.json({ id: req.params.id, message: 'Order updated' });
}));
// ── Shipments ────────────────────────────────────────────────────────────
const SHIPMENT_JOIN = `
  SELECT s.*, o.reference, o.status AS order_status, o.current_stage,
         v.plate, d.name AS driver_name
  FROM shipments s
  JOIN orders o ON o.id = s.order_id
  LEFT JOIN vehicles v ON v.id = s.vehicle_id
  LEFT JOIN drivers d ON d.id = s.driver_id
`;
app.get('/api/shipments', handle((_req, res) => {
    res.json(db.prepare(`${SHIPMENT_JOIN} ORDER BY s.started_at DESC`).all());
}));
app.get('/api/shipments/active', handle((_req, res) => {
    res.json(db
        .prepare(`${SHIPMENT_JOIN} WHERE s.status IN ('dispatched','in_transit','out_for_delivery') ORDER BY s.started_at DESC`)
        .all());
}));
app.get('/api/shipments/:id', handle((req, res) => {
    const row = db.prepare(`${SHIPMENT_JOIN} WHERE s.id = ?`).get(req.params.id);
    if (!row)
        return res.status(404).json({ error: 'Shipment not found' });
    res.json(row);
}));
// Dispatching an order creates its live shipment in one step.
app.post('/api/shipments', handle((req, res) => {
    const { order_id, vehicle_id, driver_id, from_address, to_address, status, live_lat, live_lng } = req.body ?? {};
    if (!order_id)
        return res.status(400).json({ error: 'order_id is required' });
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(order_id);
    if (!order)
        return res.status(404).json({ error: 'Order not found' });
    if (vehicle_id && !findVehicle.get(vehicle_id))
        return res.status(400).json({ error: 'vehicle_id does not exist' });
    if (driver_id && !findDriver.get(driver_id))
        return res.status(400).json({ error: 'driver_id does not exist' });
    const id = (0, uuid_1.v4)();
    db.prepare(`INSERT INTO shipments (id, order_id, vehicle_id, driver_id, from_address, to_address, status, live_lat, live_lng, started_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, order_id, scalar(vehicle_id), scalar(driver_id), scalar(from_address) ?? order.pickup_address ?? null, scalar(to_address) ?? order.delivery_address ?? null, scalar(status) ?? 'dispatched', scalar(live_lat), scalar(live_lng), now());
    // Keep the order's assignment + stage in step with the dispatch.
    db.prepare(`UPDATE orders SET current_vehicle_id = COALESCE(?, current_vehicle_id),
                       current_driver_id = COALESCE(?, current_driver_id),
                       current_stage = COALESCE(NULLIF(?, ''), 'label_printed'),
                       status = CASE WHEN status = 'new' THEN 'in_progress' ELSE status END,
                       updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`).run(scalar(vehicle_id), scalar(driver_id), scalar(order.current_stage), order_id);
    res.status(201).json({ id, order_id, status: status || 'dispatched', message: 'Shipment dispatched' });
}));
app.put('/api/shipments/:id/location', handle((req, res) => {
    const { lat, lng, status } = req.body ?? {};
    if (typeof lat !== 'number' || typeof lng !== 'number') {
        return res.status(400).json({ error: 'lat and lng must be numbers' });
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return res.status(400).json({ error: 'lat and lng must be finite numbers' });
    }
    const shipment = db.prepare('SELECT * FROM shipments WHERE id = ?').get(req.params.id);
    if (!shipment)
        return res.status(404).json({ error: 'Shipment not found' });
    if (status) {
        db.prepare(`UPDATE shipments SET live_lat = ?, live_lng = ?, status = ?, last_updated = CURRENT_TIMESTAMP WHERE id = ?`).run(lat, lng, String(status), req.params.id);
    }
    else {
        db.prepare(`UPDATE shipments SET live_lat = ?, live_lng = ?, last_updated = CURRENT_TIMESTAMP WHERE id = ?`).run(lat, lng, req.params.id);
    }
    res.json({ id: req.params.id, lat, lng, status: status || shipment.status });
}));
app.put('/api/shipments/:id', handle((req, res) => {
    const { status, vehicle_id, driver_id } = req.body ?? {};
    if (!db.prepare('SELECT id FROM shipments WHERE id = ?').get(req.params.id)) {
        return res.status(404).json({ error: 'Shipment not found' });
    }
    db.prepare(`UPDATE shipments SET status = COALESCE(?, status),
                         vehicle_id = COALESCE(?, vehicle_id),
                         driver_id = COALESCE(?, driver_id),
                         last_updated = CURRENT_TIMESTAMP
     WHERE id = ?`).run(scalar(status), scalar(vehicle_id), scalar(driver_id), req.params.id);
    res.json({ id: req.params.id, message: 'Shipment updated' });
}));
// ── Service areas ─────────────────────────────────────────────────────────
app.get('/api/service_areas', handle((_req, res) => {
    res.json(db.prepare('SELECT * FROM service_areas ORDER BY name').all());
}));
app.get('/api/service_areas/:id', handle((req, res) => {
    const row = db.prepare('SELECT * FROM service_areas WHERE id = ?').get(req.params.id);
    if (!row)
        return res.status(404).json({ error: 'Service area not found' });
    res.json(row);
}));
app.post('/api/service_areas', handle((req, res) => {
    const { name, description, color, lat_min, lat_max, lng_min, lng_max } = req.body ?? {};
    if (!name)
        return res.status(400).json({ error: 'name is required' });
    const id = (0, uuid_1.v4)();
    db.prepare('INSERT INTO service_areas (id, name, description, color, lat_min, lat_max, lng_min, lng_max) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(id, String(name), scalar(description), scalar(color) ?? '#1C4E80', scalar(lat_min), scalar(lat_max), scalar(lng_min), scalar(lng_max));
    res.status(201).json({ id, name, message: 'Service area added' });
}));
app.put('/api/service_areas/:id', handle((req, res) => {
    const { name, description, color, lat_min, lat_max, lng_min, lng_max } = req.body ?? {};
    if (!db.prepare('SELECT id FROM service_areas WHERE id = ?').get(req.params.id)) {
        return res.status(404).json({ error: 'Service area not found' });
    }
    db.prepare(`UPDATE service_areas SET name = COALESCE(?, name),
                              description = COALESCE(?, description),
                              color = COALESCE(?, color),
                              lat_min = COALESCE(?, lat_min),
                              lat_max = COALESCE(?, lat_max),
                              lng_min = COALESCE(?, lng_min),
                              lng_max = COALESCE(?, lng_max)
     WHERE id = ?`).run(scalar(name), scalar(description), scalar(color), scalar(lat_min), scalar(lat_max), scalar(lng_min), scalar(lng_max), req.params.id);
    res.json({ id: req.params.id, message: 'Service area updated' });
}));
app.delete('/api/service_areas/:id', handle((req, res) => {
    const result = db.prepare('DELETE FROM service_areas WHERE id = ?').run(req.params.id);
    if (result.changes === 0)
        return res.status(404).json({ error: 'Service area not found' });
    res.json({ id: req.params.id, message: 'Service area deleted' });
}));
// ── Delivery zones ────────────────────────────────────────────────────────
app.get('/api/delivery_zones', handle((_req, res) => {
    res.json(db.prepare('SELECT * FROM delivery_zones ORDER BY name').all());
}));
app.post('/api/delivery_zones', handle((req, res) => {
    const { area_id, name, description, lat_min, lat_max, lng_min, lng_max } = req.body ?? {};
    if (!name)
        return res.status(400).json({ error: 'name is required' });
    if (!area_id)
        return res.status(400).json({ error: 'area_id is required' });
    if (!db.prepare('SELECT id FROM service_areas WHERE id = ?').get(area_id)) {
        return res.status(400).json({ error: 'area_id does not exist' });
    }
    const id = (0, uuid_1.v4)();
    db.prepare('INSERT INTO delivery_zones (id, area_id, name, description, lat_min, lat_max, lng_min, lng_max) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(id, String(area_id), String(name), scalar(description), scalar(lat_min), scalar(lat_max), scalar(lng_min), scalar(lng_max));
    res.status(201).json({ id, name, message: 'Delivery zone added' });
}));
app.delete('/api/delivery_zones/:id', handle((req, res) => {
    const result = db.prepare('DELETE FROM delivery_zones WHERE id = ?').run(req.params.id);
    if (result.changes === 0)
        return res.status(404).json({ error: 'Delivery zone not found' });
    res.json({ id: req.params.id, message: 'Delivery zone deleted' });
}));
// ── Public tracking ──────────────────────────────────────────────────────
// Build the customer-facing tracking payload shared by both lookup routes.
const buildTrackingPayload = (order) => {
    const orderId = String(order.id);
    const shipment = db
        .prepare('SELECT * FROM shipments WHERE order_id = ? ORDER BY started_at DESC LIMIT 1')
        .get(orderId);
    const vehicle = shipment?.vehicle_id
        ? findVehicle.get(String(shipment.vehicle_id))
        : undefined;
    const driver = shipment?.driver_id
        ? findDriver.get(String(shipment.driver_id))
        : undefined;
    const status = String(order.status || 'new');
    const progress = custodyProgress(status);
    const quote = parseJsonColumn(order.price_quote);
    const items = parseJsonColumn(order.items);
    return {
        id: order.id,
        reference: order.reference,
        status,
        status_label: status === 'delivered' ? 'Delivered' : status === 'exception' ? 'Exception' : 'In custody',
        current_stage: order.current_stage,
        customer_name: order.customer_name,
        recipient_name: order.recipient_name,
        pickup_address: order.pickup_address,
        delivery_address: order.delivery_address,
        service_tier: order.service_tier,
        service_name: quote?.service_name ?? null,
        description: items?.description ?? null,
        seal_number: order.seal_number,
        courier: driver?.name ? String(driver.name) : null,
        courier_vehicle: vehicle?.plate ? String(vehicle.plate) : null,
        route: order.pickup_address && order.delivery_address
            ? `${order.pickup_address} → ${order.delivery_address}`
            : (order.delivery_address ?? null),
        eta: order.delivered_at ? `Delivered ${String(order.delivered_at).slice(0, 16).replace('T', ' ')} EAT` : null,
        quote_total: quote?.total ?? null,
        currency: quote ? 'KES' : null,
        created_at: order.created_at,
        updated_at: order.updated_at,
        active_location: shipment && shipment.live_lat != null
            ? {
                lat: Number(shipment.live_lat),
                lng: Number(shipment.live_lng),
                timestamp: shipment.last_updated ?? null,
            }
            : null,
        timeline: CUSTODY_STAGES.map((stage, index) => ({
            ...stage,
            state: index < progress ? 'done' : index === progress ? 'active' : 'todo',
        })),
    };
};
// By order id — used by shareable tracking links.
app.get('/api/track/:id', handle((req, res) => {
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
    if (!order)
        return res.status(404).json({ error: 'Order not found' });
    res.json(buildTrackingPayload(order));
}));
// By reference — this is what customers type into the public tracking box.
app.get('/api/track/reference/:ref', handle((req, res) => {
    const ref = req.params.ref.toUpperCase();
    const order = db.prepare('SELECT * FROM orders WHERE UPPER(reference) = ?').get(ref);
    if (!order)
        return res.status(404).json({ error: 'No shipment found for that reference' });
    res.json(buildTrackingPayload(order));
}));
// ── Public: rates, quotes, coverage ─────────────────────────────────────
// These back the marketing site so pricing and coverage are always the same
// numbers dispatch quotes from.
app.get('/api/rates', handle((_req, res) => {
    res.json({
        currency: 'KES',
        vat_rate: 0.16,
        insurance_rate: INSURANCE_RATE,
        insured_value_cap: INSURED_VALUE_CAP,
        tiers: SERVICE_TIERS,
        zones: Object.entries(ZONE_SURCHARGES).map(([name, surcharge]) => ({ name, surcharge })),
    });
}));
// Instant quote for the booking form. Never persists anything.
app.post('/api/quotes', handle((req, res) => {
    res.json(computeQuote(req.body ?? {}));
}));
// Public coverage map data (no internal ids or bounding-box plumbing exposed
// beyond what the site renders).
app.get('/api/coverage', handle((_req, res) => {
    const areas = db.prepare('SELECT * FROM service_areas ORDER BY name').all();
    const zones = db.prepare('SELECT * FROM delivery_zones ORDER BY name').all();
    res.json({
        areas: areas.map((a) => ({
            id: a.id,
            name: a.name,
            description: a.description,
            color: a.color,
            bounds: {
                lat_min: a.lat_min,
                lat_max: a.lat_max,
                lng_min: a.lng_min,
                lng_max: a.lng_max,
            },
        })),
        zones: zones.map((z) => ({
            id: z.id,
            name: z.name,
            description: z.description,
            area_id: z.area_id,
        })),
    });
}));
// A handful of real references so the tracking demo chips always resolve.
app.get('/api/demo', handle((_req, res) => {
    const rows = db
        .prepare('SELECT reference FROM orders ORDER BY created_at DESC LIMIT 3')
        .all();
    res.json({ references: rows.map((r) => r.reference) });
}));
// ── Meta ─────────────────────────────────────────────────────────────────
app.get('/', (_req, res) => {
    res.json({
        name: 'Swift Logistics API',
        version: '1.0.0',
        endpoints: [
            '/api/health',
            '/api/vehicles',
            '/api/drivers',
            '/api/orders',
            '/api/shipments',
            '/api/service_areas',
            '/api/delivery_zones',
            '/api/track/:id',
            '/api/track/reference/:ref',
            '/api/rates',
            '/api/quotes',
            '/api/coverage',
            '/api/demo',
        ],
    });
});
app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});
// ── Server ───────────────────────────────────────────────────────────────
const PORT = Number(process.env.PORT || 4000);
const server = app.listen(PORT, () => {
    console.log(`Swift Logistics API listening on port ${PORT}`);
    console.log(`Database: ${DB_PATH}`);
});
const shutdown = (signal) => {
    console.log(`\n${signal} received, shutting down.`);
    server.close(() => {
        try {
            db.close();
        }
        catch {
            /* already closed */
        }
        process.exit(0);
    });
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
