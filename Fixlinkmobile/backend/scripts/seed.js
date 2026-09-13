/**
 * FixLink Capstone - Mock Data Seeder (Supabase / PostgreSQL)
 * Cebu Roosevelt Memorial Colleges - College of Computer Studies
 *
 * Usage:
 *   node scripts/seed.js
 *   node scripts/seed.js --clean (cleans old mock requests and re-seeds)
 *
 * Requires in backend/.env:
 *   SUPABASE_URL, SUPABASE_SECRET_KEY
 */

require('dotenv').config();

const { supabase } = require('../src/config/supabase');

const DEFAULT_PASSWORD = 'Password123!';

// Coordinates centered around Bogo City, Cebu (near Cebu Roosevelt Memorial Colleges)
const BOGO_CITY = {
  center: { lat: 11.0500, lon: 124.0050 },
  sanVicente: { lat: 11.0512, lon: 124.0065, address: 'San Vicente St., Bogo City, Cebu' },
  pRodriguez: { lat: 11.0485, lon: 124.0038, address: 'P. Rodriguez St., Bogo City, Cebu' },
  taytayan: { lat: 11.0430, lon: 124.0080, address: 'Barangay Taytayan, Bogo City, Cebu' },
  gairan: { lat: 11.0590, lon: 124.0120, address: 'Barangay Gairan, Bogo City, Cebu' },
};

const MOCK_USERS = [
  {
    email: 'customer@fixlink.com',
    password: DEFAULT_PASSWORD,
    displayName: 'Maria Santos',
    phone: '+639171234567',
    role: 'customer',
    status: 'active',
  },
  {
    email: 'tech.appliance@fixlink.com',
    password: DEFAULT_PASSWORD,
    displayName: 'Jonard Masong',
    phone: '+639189876543',
    role: 'technician',
    status: 'active',
    verificationStatus: 'verified',
    skills: ['Refrigerator', 'Washing Machine', 'General Repair'],
    latitude: 11.0505,
    longitude: 124.0045,
    rating: 4.9,
    totalReviews: 24,
    isAvailable: true,
    portfolio: [
      {
        title: 'Samsung Inverter Refrigerator PCB Repair',
        description: 'Diagnosed damaged inverter controller board, replaced capacitors, restored cooling cycle.',
        imageUrl: 'https://images.unsplash.com/photo-1571175443880-49e1d25b2bc5?w=500',
        completedAt: '2026-08-15T10:30:00.000Z'
      },
      {
        title: 'Panasonic Top-Load Washer Motor Replacement',
        description: 'Replaced worn drive belt and repaired faulty spin motor.',
        imageUrl: 'https://images.unsplash.com/photo-1626806787461-102c1bfaaea1?w=500',
        completedAt: '2026-08-28T14:15:00.000Z'
      }
    ]
  },
  {
    email: 'tech.computer@fixlink.com',
    password: DEFAULT_PASSWORD,
    displayName: 'James Rojas',
    phone: '+639198765432',
    role: 'technician',
    status: 'active',
    verificationStatus: 'verified',
    skills: ['Desktop Computer', 'Laptop', 'Computer Monitor', 'Electronics', 'General Repair'],
    latitude: 11.0475,
    longitude: 124.0020,
    rating: 5.0,
    totalReviews: 19,
    isAvailable: true,
    portfolio: [
      {
        title: 'Asus ROG Gaming Laptop Overheating Fix',
        description: 'Deep cleaned thermal heatsink and applied high-performance liquid metal thermal paste.',
        imageUrl: 'https://images.unsplash.com/photo-1588872657578-7efd1f1555ed?w=500',
        completedAt: '2026-08-20T16:45:00.000Z'
      }
    ]
  },
  {
    email: 'tech.pending@fixlink.com',
    password: DEFAULT_PASSWORD,
    displayName: 'Carlo Mendoza (Pending Tech)',
    phone: '+639201122334',
    role: 'technician',
    status: 'pending_verification',
    verificationStatus: 'pending',
    skills: ['Electronics', 'General Repair'],
    latitude: 11.0520,
    longitude: 124.0060,
    rating: 0,
    totalReviews: 0,
    isAvailable: false
  }
];

async function getOrCreateAuthUsers(userDefs) {
  const seen = {};

  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  (data.users || []).forEach((u) => { seen[u.email] = u; });

  const results = {};
  for (const userDef of userDefs) {
    let authUser = seen[userDef.email];
    if (!authUser) {
      const { data: created, error: createError } = await supabase.auth.admin.createUser({
        email: userDef.email,
        password: userDef.password,
        email_confirm: true,
        user_metadata: { displayName: userDef.displayName },
      });
      if (createError) throw createError;
      authUser = created.user;
    }
    results[userDef.email] = { authUser, userDef };
  }
  return results;
}

async function seedUsers() {
  console.log('\n--- 1. SEEDING USERS & AUTH ---');
  const seeded = {};

  const accounts = await getOrCreateAuthUsers(MOCK_USERS);

  for (const [email, { authUser, userDef }] of Object.entries(accounts)) {
    const userDoc = {
      id: authUser.id,
      name: userDef.displayName,
      email: userDef.email,
      phone: userDef.phone || null,
      role: userDef.role,
      status: userDef.status || 'active',
      ...(userDef.verificationStatus && { verification_status: userDef.verificationStatus }),
      ...(userDef.skills && { skills: userDef.skills }),
      ...(userDef.latitude && { latitude: userDef.latitude }),
      ...(userDef.longitude && { longitude: userDef.longitude }),
      ...(userDef.rating !== undefined && { rating: userDef.rating }),
      ...(userDef.totalReviews !== undefined && { total_reviews: userDef.totalReviews }),
      ...(userDef.isAvailable !== undefined && { is_available: userDef.isAvailable }),
      ...(userDef.portfolio && { portfolio: userDef.portfolio }),
      created_at: new Date().toISOString(),
    };

    const { error } = await supabase.from('users').upsert(userDoc, { onConflict: 'id' });
    if (error) throw error;

    seeded[email] = { uid: authUser.id, ...userDoc };
    console.log(`[USER READY] ${userDef.role.padEnd(10)} | ${userDef.displayName.padEnd(25)} | Email: ${userDef.email}`);
  }

  return seeded;
}

async function seedAnnouncements() {
  console.log('\n--- 2. SEEDING ANNOUNCEMENTS ---');
  const announcements = [
    {
      id: '11111111-1111-1111-1111-111111111111',
      title: 'Welcome to FixLink Bogo City',
      message: 'On-demand home appliance and computer repair technicians are now operating across Bogo City. Submit your request for instant dispatch!',
      active: true,
      createdAt: new Date().toISOString()
    },
    {
      id: '11111111-1111-1111-1111-111111111112',
      title: 'Safety & Verification Reminder',
      message: 'Always check that your technician has the verified badge and never give your 4-digit completion code until the repair is finished.',
      active: true,
      createdAt: new Date().toISOString()
    }
  ];

  for (const item of announcements) {
    const { error } = await supabase.from('announcements').upsert({
      id: item.id,
      title: item.title,
      message: item.message,
      active: item.active,
      created_at: item.createdAt,
    }, { onConflict: 'id' });
    if (error) throw error;
    console.log(`[ANNOUNCEMENT] ${item.title}`);
  }
}

const CATEGORY_DEVICES = {
  'Home Appliances': [
    'Rice Cooker', 'Washing Machine', 'Clothes Dryer', 'Dishwasher', 'Refrigerator', 'Freezer',
    'Electric Fan', 'Air Cooler', 'Vacuum Cleaner', 'Steam Iron', 'Electric Iron', 'Microwave Oven',
    'Electric Oven', 'Toaster', 'Electric Kettle', 'Coffee Maker', 'Food Processor', 'Blender',
    'Juicer', 'Stand Mixer', 'Air Fryer', 'Water Dispenser', 'Water Heater', 'Electric Stove',
    'Induction Cooker', 'Exhaust Fan', 'Range Hood'
  ],
  'Computer & Laptop': [
    'Desktop Computer', 'System Unit', 'Laptop', 'Computer Monitor', 'Keyboard', 'Mouse', 'Printer',
    'Scanner', 'Projector', 'External Hard Drive', 'Computer Power Supply', 'UPS', 'Webcam', 'Computer Speakers'
  ],
  'Mobile Devices': [
    'Smartphone', 'Tablet', 'iPad', 'Smartwatch', 'Power Bank', 'Mobile Charger', 'Wireless Charger'
  ],
  'Television & Entertainment': [
    'LED TV', 'LCD TV', 'Smart TV', 'Android TV', 'TV Box', 'DVD Player', 'Blu-ray Player',
    'Game Console', 'Speaker', 'Bluetooth Speaker', 'Soundbar', 'Home Theater System', 'Amplifier',
    'Subwoofer', 'Karaoke Machine', 'Microphone', 'Headphones', 'Earphones'
  ],
  'Air Conditioning & Cooling': [
    'Split-Type Air Conditioner', 'Window-Type Air Conditioner', 'Portable Air Conditioner',
    'Central Air Conditioner', 'Electric Fan', 'Stand Fan', 'Ceiling Fan', 'Wall Fan', 'Tower Fan',
    'Air Cooler', 'Dehumidifier', 'Air Purifier', 'Exhaust Fan'
  ],
  'Networking & Internet Devices': [
    'Wi-Fi Router', 'Modem', 'Fiber Modem', 'Network Switch', 'Wi-Fi Extender', 'Wi-Fi Access Point',
    'Mesh Wi-Fi System', 'Network Adapter', 'Ethernet Device', 'Network Cable'
  ],
  'CCTV & Security Devices': [
    'CCTV Camera', 'IP Camera', 'DVR', 'NVR', 'CCTV Monitor', 'Security Alarm', 'Doorbell Camera',
    'Video Doorbell', 'Access Control System', 'Biometric Device', 'Electronic Door Lock'
  ],
  'Electrical Devices': [
    'AVR', 'UPS', 'Extension Cord', 'Power Strip', 'Surge Protector', 'Voltage Regulator',
    'Power Supply', 'Battery Charger', 'Circuit Breaker', 'Electrical Switch', 'Electrical Outlet',
    'Timer Switch', 'Emergency Light', 'Rechargeable Lamp'
  ],
  'Personal & Beauty Electronics': [
    'Hair Dryer', 'Hair Straightener', 'Hair Curler', 'Electric Shaver', 'Electric Razor',
    'Electric Toothbrush', 'Facial Cleanser', 'Massage Device', 'Electric Massager', 'Hair Clipper',
    'Hair Trimmer'
  ],
  'Office & Business Equipment': [
    'Printer', 'Scanner', 'Photocopier', 'Projector', 'Laminating Machine', 'Paper Shredder',
    'Binding Machine', 'Cash Register', 'POS Machine', 'Barcode Scanner', 'Label Printer', 'Telephone',
    'Intercom'
  ],
  'Other Electronic Devices': [
    'Digital Clock', 'Alarm Clock', 'Smart Home Hub', 'Smart Plug', 'Smart Light', 'LED Light',
    'Rechargeable Flashlight', 'Electronic Weighing Scale', 'Digital Thermometer', 'Electronic Doorbell',
    'Other Electronic Devices'
  ]
};

async function seedCategories() {
  console.log('\n--- 2.5 SEEDING SKILL CATEGORIES WITH DEVICES ---');
  const { data: existing } = await supabase.from('categories').select('name');
  const byName = new Set((existing || []).map((cat) => String(cat.name || '').trim().toLowerCase()));

  for (const [name, devices] of Object.entries(CATEGORY_DEVICES)) {
    if (byName.has(name.toLowerCase())) {
      const { error } = await supabase.from('categories').update({ devices, updated_at: new Date().toISOString() }).eq('name', name);
      if (error) throw error;
      console.log(`[CATEGORY UPDATED] ${name} (${devices.length} devices)`);
    } else {
      const { error } = await supabase.from('categories').insert({ name, devices, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
      if (error) throw error;
      console.log(`[CATEGORY ADDED] ${name} (${devices.length} devices)`);
    }
  }
}

async function seedPendingRequests(customerUid, customerName) {
  console.log('\n--- 3. SEEDING PENDING REPAIR REQUESTS ---');
  const baseId = 31111111;
  const sampleRequests = [
    {
      id: `${baseId}-1111-1111-1111-111111111111`,
      customerName,
      applianceType: 'Refrigerator',
      description: 'Samsung Two-Door Inverter refrigerator is not cooling. Freezer is slightly cold but lower compartment is completely warm.',
      location: BOGO_CITY.sanVicente.address,
      latitude: BOGO_CITY.sanVicente.lat,
      longitude: BOGO_CITY.sanVicente.lon,
      preferredDate: '2026-09-08',
      preferredTime: 'Morning (8AM-12PM)',
      photoUrl: 'https://images.unsplash.com/photo-1584568694244-14fbdf83bd30?w=500',
      status: 'Pending',
      isOther: false,
    },
    {
      id: `${baseId}-1111-1111-1111-111111111112`,
      customerName,
      applianceType: 'Laptop',
      description: 'Acer Swift 3 screen goes black randomly while working. Fan makes loud grinding sound.',
      location: BOGO_CITY.pRodriguez.address,
      latitude: BOGO_CITY.pRodriguez.lat,
      longitude: BOGO_CITY.pRodriguez.lon,
      preferredDate: '2026-09-08',
      preferredTime: 'Afternoon (1PM-5PM)',
      photoUrl: 'https://images.unsplash.com/photo-1588872657578-7efd1f1555ed?w=500',
      status: 'Pending',
      isOther: false,
    },
    {
      id: `${baseId}-1111-1111-1111-111111111113`,
      customerName,
      applianceType: 'Washing Machine',
      description: 'Whirlpool automatic washing machine drum vibrates violently and does not spin during drain cycle.',
      location: BOGO_CITY.taytayan.address,
      latitude: BOGO_CITY.taytayan.lat,
      longitude: BOGO_CITY.taytayan.lon,
      preferredDate: '2026-09-09',
      preferredTime: 'Morning (8AM-12PM)',
      photoUrl: 'https://images.unsplash.com/photo-1626806787461-102c1bfaaea1?w=500',
      status: 'Pending',
      isOther: false,
    }
  ];

  for (const req of sampleRequests) {
    const { error } = await supabase.from('jobs').upsert({
      id: req.id,
      original_request_id: req.id,
      customer_uid: customerUid,
      customer_name: req.customerName,
      appliance_type: req.applianceType,
      description: req.description,
      location: req.location,
      latitude: req.latitude,
      longitude: req.longitude,
      preferred_date: req.preferredDate,
      preferred_time: req.preferredTime,
      photo_url: req.photoUrl,
      status: req.status,
      is_other: req.isOther,
      created_at: new Date().toISOString(),
    }, { onConflict: 'id' });
    if (error) throw error;
    console.log(`[REQUEST ADDED] ${req.applianceType.padEnd(16)} | Loc: ${req.location}`);
  }
}

async function cleanDemoData() {
  if (process.argv.includes('--clean')) {
    console.log('\n[CLEANUP] Purging seeded requests (jobs) for Maria Santos...');
    const { error } = await supabase.from('jobs').delete().eq('customer_name', 'Maria Santos');
    if (error) throw error;
    console.log('[CLEANUP] Test records cleaned successfully.');
  }
}

async function main() {
  console.log('================================================================');
  console.log('  FIXLINK CAPSTONE: MOCK DATA SEEDER (BOGO CITY, CEBU)');
  console.log('  Cebu Roosevelt Memorial Colleges — College of Computer Studies');
  console.log('  Database: Supabase / PostgreSQL');
  console.log('================================================================');

  await cleanDemoData();
  const users = await seedUsers();
  await seedAnnouncements();
  await seedCategories();

  const customer = users['customer@fixlink.com'];
  if (customer) {
    await seedPendingRequests(customer.uid, customer.name);
  }

  console.log('\n================================================================');
  console.log('             MOCK DATA SEEDING COMPLETE!');
  console.log('================================================================');
  console.log('\nReady for 2-Device Capstone Live Demo:');
  console.log('----------------------------------------------------------------');
  console.log('DEVICE 1 (CUSTOMER DEMO):');
  console.log('   Email:    customer@fixlink.com');
  console.log('   Password: Password123!');
  console.log('   Role:     Customer (Maria Santos)');
  console.log('----------------------------------------------------------------');
  console.log('DEVICE 2 (TECHNICIAN DEMO - APPLIANCES):');
  console.log('   Email:    tech.appliance@fixlink.com');
  console.log('   Password: Password123!');
  console.log('   Role:     Technician (Jonard Masong - Verified)');
  console.log('   Skills:   Refrigerator, Washing Machine, General Repair');
  console.log('----------------------------------------------------------------');
  console.log('BACKUP / COMPUTER TECHNICIAN:');
  console.log('   Email:    tech.computer@fixlink.com');
  console.log('   Password: Password123!');
  console.log('   Role:     Technician (James Rojas - Verified)');
  console.log('   Skills:   Desktop Computer, Laptop, Monitor');
  console.log('================================================================\n');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\nSeeding failed with error:', err);
    process.exit(1);
  });