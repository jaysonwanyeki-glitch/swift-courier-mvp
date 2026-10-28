/**
 * Seeds the SQLite database with demo fleet, drivers, coverage areas and orders.
 *
 * Usage:
 *   node scripts/init.js            # seed only if the database is empty
 *   node scripts/init.js --force    # wipe and re-seed
 *
 * Honours DB_PATH so it works identically locally and inside the container.
 */
const { DatabaseSync } = require('node:sqlite');
const { mkdirSync } = require('fs');
const { dirname, join, resolve } = require('path');

const DB_PATH = process.env.DB_PATH
  ? resolve(process.env.DB_PATH)
  : resolve(join(__dirname, '../../data/logistics.db'));

const force = process.argv.includes('--force');

mkdirSync(dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys = ON');

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

const { count } = db.prepare('SELECT COUNT(*) AS count FROM orders').get();

if (count > 0 && !force) {
  console.log(`Database already has ${count} order(s) at ${DB_PATH} — skipping seed.`);
  console.log('Run with --force to wipe and re-seed.');
  db.close();
  process.exit(0);
}

if (force) {
  db.exec(`
    DELETE FROM shipments;
    DELETE FROM orders;
    DELETE FROM delivery_zones;
    DELETE FROM service_areas;
    DELETE FROM drivers;
    DELETE FROM vehicles;
  `);
  console.log('Cleared existing data.');
}

const id = (prefix) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
const reference = () =>
  `LGS-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

// ── Vehicles ─────────────────────────────────────────────────────────────
const seedVehicles = [
  { plate: 'KDA-101A', make: 'Toyota', model: 'HiAce', colour: 'White', status: 'idle', latitude: -1.2921, longitude: 36.8219 },
  { plate: 'KDA-102B', make: 'Nissan', model: 'NV350', colour: 'Silver', status: 'idle', latitude: -1.2686, longitude: 36.8106 },
  { plate: 'KDA-103C', make: 'Isuzu', model: 'NPR', colour: 'Blue', status: 'idle', latitude: -1.3035, longitude: 36.8155 },
];

const vehicleIds = [];
for (const v of seedVehicles) {
  const vid = id('veh');
  vehicleIds.push(vid);
  db.prepare(
    'INSERT INTO vehicles (id, plate, make, model, colour, status, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(vid, v.plate, v.make, v.model, v.colour, v.status, v.latitude, v.longitude);
}

// ── Drivers ──────────────────────────────────────────────────────────────
const seedDrivers = [
  { name: 'James Mwangi', phone: '+254 712 345 678', license_number: 'D12345', status: 'on_road' },
  { name: 'Mary Wanjiru', phone: '+254 723 456 789', license_number: 'D67890', status: 'on_road' },
  { name: 'Peter Kamau', phone: '+254 734 567 890', license_number: 'D24680', status: 'idle' },
];

const driverIds = [];
seedDrivers.forEach((d, index) => {
  const did = id('drv');
  driverIds.push(did);
  db.prepare(
    'INSERT INTO drivers (id, name, phone, license_number, vehicle_id, status) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(did, d.name, d.phone, d.license_number, vehicleIds[index] ?? null, d.status);
});

// ── Service areas ────────────────────────────────────────────────────────
const seedAreas = [
  { name: 'Nairobi CBD', description: 'Central business district', color: '#1C4E80', lat_min: -1.33, lat_max: -1.26, lng_min: 36.75, lng_max: 36.85 },
  { name: 'Westlands', description: 'Retail and office district', color: '#2B6CA8', lat_min: -1.30, lat_max: -1.28, lng_min: 36.80, lng_max: 36.86 },
  { name: 'Upper Hill', description: 'Government and legal precinct', color: '#4A90C4', lat_min: -1.29, lat_max: -1.25, lng_min: 36.78, lng_max: 36.83 },
  { name: 'Parklands', description: 'Residential and medical', color: '#7FB0D8', lat_min: -1.30, lat_max: -1.27, lng_min: 36.78, lng_max: 36.84 },
];

const areaIds = [];
for (const a of seedAreas) {
  const aid = id('area');
  areaIds.push(aid);
  db.prepare(
    'INSERT INTO service_areas (id, name, description, color, lat_min, lat_max, lng_min, lng_max) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(aid, a.name, a.description, a.color, a.lat_min, a.lat_max, a.lng_min, a.lng_max);
}

// ── Delivery zones ───────────────────────────────────────────────────────
const seedZones = [
  { area_id: areaIds[0], name: 'CBD & Westlands Inner', description: 'Dense inner-city drop zone', lat_min: -1.33, lat_max: -1.28, lng_min: 36.75, lng_max: 36.81 },
  { area_id: areaIds[2], name: 'Upper Hill & Kilimani', description: 'Courts and ministries', lat_min: -1.29, lat_max: -1.24, lng_min: 36.78, lng_max: 36.83 },
  { area_id: areaIds[3], name: 'Parklands & Westlands West', description: 'Residential and clinics', lat_min: -1.30, lat_max: -1.27, lng_min: 36.78, lng_max: 36.84 },
];

for (const z of seedZones) {
  db.prepare(
    'INSERT INTO delivery_zones (id, area_id, name, description, lat_min, lat_max, lng_min, lng_max) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id('zone'), z.area_id, z.name, z.description, z.lat_min, z.lat_max, z.lng_min, z.lng_max);
}

// ── Orders ───────────────────────────────────────────────────────────────
const HQ = 'Swift Courier HQ, Riverside Drive';
const baseUrl = (process.env.PUBLIC_URL || '').replace(/\/+$/, '');

const seedOrders = [
  {
    customer_name: "Amina's Boutique",
    phone: '+254 700 111 222',
    address: 'Westlands, Nairobi',
    pickup: HQ,
    delivery: 'Muthurwa Market, Westlands',
    items: '10 cotton blouses, 5 skirts',
    weight_kg: 12.5,
    declared_value: 45000,
    service_tier: 'priority',
    status: 'out_for_delivery',
    stage: 'out_for_delivery',
  },
  {
    customer_name: 'Nairobi Legal Associates',
    phone: '+254 711 333 444',
    address: 'Upper Hill, Nairobi',
    pickup: HQ,
    delivery: 'Milimani Law Courts Registry, Upper Hill',
    items: 'Court bundle: 12 documents',
    weight_kg: 2.1,
    declared_value: 15000,
    service_tier: 'priority',
    status: 'in_progress',
    stage: 'picking_up',
  },
  {
    customer_name: 'Riverside Medical Centre',
    phone: '+254 722 555 666',
    address: 'Parklands, Nairobi',
    pickup: HQ,
    delivery: 'Riverside Medical, Parklands',
    items: 'Vaccine transport kit with temperature log',
    weight_kg: 8.0,
    declared_value: 85000,
    service_tier: 'express',
    status: 'delivered',
    stage: 'delivered',
  },
  {
    customer_name: 'Kilimani Art House',
    phone: '+254 733 888 999',
    address: 'Kilimani, Nairobi',
    pickup: HQ,
    delivery: 'Karen Blixen Road, Kilimani',
    items: 'Framed canvas, fragile — glass protection',
    weight_kg: 6.4,
    declared_value: 120000,
    service_tier: 'express',
    status: 'new',
    stage: 'new',
  },
];

const insertOrder = db.prepare(
  `INSERT INTO orders (id, reference, customer_name, customer_phone, customer_address, pickup_address,
                       delivery_address, items, weight_kg, declared_value, service_tier, status,
                       current_stage, seal_number, tracking_link, delivered_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
const insertShipment = db.prepare(
  `INSERT INTO shipments (id, order_id, vehicle_id, driver_id, from_address, to_address, status, live_lat, live_lng, started_at, completed_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);

const shipmentStatusFor = (status) =>
  status === 'delivered' ? 'completed' : status === 'new' ? 'pending' : 'in_transit';

const createdRefs = [];

seedOrders.forEach((o, index) => {
  const orderId = id('ord');
  const ref = reference();
  createdRefs.push(ref);

  const seal = `SEAL-${String(10000 + Math.floor(Math.random() * 89999))}`;
  const trackingLink = `${baseUrl}/track?id=${orderId}`;
  const deliveredAt = o.status === 'delivered' ? new Date(Date.now() - 3600_000).toISOString() : null;

  const vehicleId = vehicleIds[index % vehicleIds.length];
  const driverId = driverIds[index % driverIds.length];

  insertOrder.run(
    orderId, ref, o.customer_name, o.phone, o.address, o.pickup, o.delivery,
    JSON.stringify({ description: o.items }),
    o.weight_kg, o.declared_value, o.service_tier, o.status, o.stage,
    o.status === 'new' ? null : seal, trackingLink, deliveredAt
  );

  // Only active orders get a shipment, so `/api/shipments/active` stays meaningful.
  if (o.status !== 'new') {
    const vehicle = seedVehicles[index % seedVehicles.length];
    insertShipment.run(
      id('shp'), orderId, vehicleId, driverId, o.pickup, o.delivery,
      shipmentStatusFor(o.status),
      o.status === 'delivered' ? vehicle.latitude : vehicle.latitude,
      o.status === 'delivered' ? vehicle.longitude : vehicle.longitude,
      new Date(Date.now() - 7200_000).toISOString(),
      deliveredAt
    );
  }

  db.prepare(
    `UPDATE orders SET current_vehicle_id = ?, current_driver_id = ? WHERE id = ?`
  ).run(o.status === 'new' ? null : vehicleId, o.status === 'new' ? null : driverId, orderId);
});

db.close();

console.log('Database seeded successfully.');
console.log(`  Location:  ${DB_PATH}`);
console.log(`  Vehicles:   ${seedVehicles.length}`);
console.log(`  Drivers:    ${seedDrivers.length}`);
console.log(`  Areas:      ${seedAreas.length}`);
console.log(`  Zones:      ${seedZones.length}`);
console.log(`  Orders:     ${seedOrders.length}`);
console.log('\nTracking references you can use on the site:');
for (const ref of createdRefs) {
  console.log(`  ${ref}`);
}