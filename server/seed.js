// ─── Chatru Halwai demo data seeder ──────────────────────────────────────────
// Generates ~45 days of ledger-consistent business history:
// products, customers, 1000+ sales, udhaar, purchases, expenses, wastage, shifts.
import {
  db, get, all, run, now, today, r2, setSetting,
  moveProductStock, moveRawStock, creditEntry
} from './db.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const ri = (a, b) => Math.floor(rnd(a, b + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const chance = (p) => Math.random() < p;
const pad = (n) => String(n).padStart(2, '0');

function dayStr(offsetBack) {
  const base = new Date(`${today()}T12:00:00`);
  return new Date(base.getTime() - offsetBack * 86400000).toISOString().slice(0, 10);
}
const ts = (day, h, m = ri(0, 59), s = ri(0, 59)) => `${day} ${pad(h)}:${pad(m)}:${pad(s)}`;

export function seedIfEmpty() {
  if (get('SELECT COUNT(*) AS c FROM users').c > 0) return false;
  console.log('Seeding Chatru Halwai demo data… (first run, takes a few seconds)');
  const t0 = Date.now();
  db.exec('BEGIN');
  try { seed(); db.exec('COMMIT'); }
  catch (e) { db.exec('ROLLBACK'); throw e; }
  console.log(`Seed complete in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  return true;
}

function seed() {
  const DAYS = 45;
  const START = dayStr(DAYS);

  // ── business + settings ──
  run(`INSERT INTO business(id,name,tagline,logo,address,phone,gstin,fssai,email)
       VALUES(1,?,?,?,?,?,?,?,?)`,
    'Chatru Halwai', 'Shuddh · Swadisht · Satvik', '/logo.png',
    'Sadar Bazaar, Agra, Uttar Pradesh - 282001', '+91 98765 43210',
    '09ABCDE1234F1Z5', '10923456789012', 'chatruhalwai@gmail.com');
  const settings = {
    invoice_prefix: 'CH', gst_enabled: true, round_off: true,
    receipt_size: '80', receipt_footer: 'Thank You! Visit Again',
    default_gst: 5, discount_limit_pct: 10,
    weight_presets_g: [100, 200, 250, 500, 750, 1000, 1500, 2000],
    payment_methods: ['cash', 'upi', 'card', 'udhaar'],
    theme: 'golden'
  };
  for (const [k, v] of Object.entries(settings)) setSetting(k, v);

  // ── staff ──
  const t = now();
  const uid = {};
  for (const [name, username, password, role, phone] of [
    ['Chatru Prasad (Owner)', 'owner', 'owner123', 'owner', '9876543210'],
    ['Mukesh Sharma', 'manager', 'manager123', 'manager', '9876500011'],
    ['Ramesh Kumar', 'ramesh', '1234', 'cashier', '9876500022'],
    ['Suresh Verma', 'suresh', '1234', 'cashier', '9876500033']
  ]) {
    uid[username] = run('INSERT INTO users(name,username,password,role,phone,active,created_at) VALUES(?,?,?,?,?,1,?)',
      name, username, password, role, phone, t).lastInsertRowid;
  }
  const cashiers = [uid.ramesh, uid.suresh];

  // ── categories ──
  const CATS = [
    ['Mithai', 'मिठाई', '🍮'], ['Bengali Sweets', 'बंगाली मिठाई', '🍥'],
    ['Dry Fruit Mithai', 'ड्राई फ्रूट मिठाई', '💎'], ['Namkeen', 'नमकीन', '🥨'],
    ['Snacks', 'स्नैक्स', '🍟'], ['Samosa & Kachori', 'समोसा कचौड़ी', '🥟'],
    ['Beverages', 'पेय', '☕'], ['Fast Food', 'फास्ट फूड', '🍔'],
    ['Combos', 'कॉम्बो', '🍱'], ['Gift Boxes', 'गिफ्ट बॉक्स', '🎁']
  ];
  const catId = {};
  CATS.forEach(([name, hi, icon], i) => {
    catId[name] = run('INSERT INTO categories(name,name_hi,icon,sort_order,active) VALUES(?,?,?,?,1)', name, hi, icon, i + 1).lastInsertRowid;
  });

  // ── products: [name, hindi, category, unit, price, cost, gst, emoji, popularity] ──
  const PRODUCTS = [
    ['Motichoor Ladoo', 'मोतीचूर लड्डू', 'Mithai', 'kg', 320, 220, 5, '🟠', 9],
    ['Besan Ladoo', 'बेसन लड्डू', 'Mithai', 'kg', 360, 240, 5, '🟡', 7],
    ['Boondi Ladoo', 'बूंदी लड्डू', 'Mithai', 'kg', 300, 200, 5, '🟠', 6],
    ['Milk Cake', 'मिल्क केक', 'Mithai', 'kg', 480, 340, 5, '🍰', 8],
    ['Plain Barfi', 'सादी बर्फी', 'Mithai', 'kg', 400, 280, 5, '⬜', 6],
    ['Kesar Barfi', 'केसर बर्फी', 'Mithai', 'kg', 520, 380, 5, '🟨', 5],
    ['Doda Barfi', 'डोडा बर्फी', 'Mithai', 'kg', 560, 400, 5, '🟫', 5],
    ['Jalebi', 'जलेबी', 'Mithai', 'kg', 240, 140, 5, '🥨', 10],
    ['Imarti', 'इमरती', 'Mithai', 'kg', 280, 170, 5, '🌀', 5],
    ['Gulab Jamun', 'गुलाब जामुन', 'Mithai', 'kg', 320, 200, 5, '🟤', 9],
    ['Balushahi', 'बालूशाही', 'Mithai', 'kg', 300, 190, 5, '🍩', 4],
    ['Agra Petha', 'आगरा पेठा', 'Mithai', 'kg', 200, 120, 5, '🍈', 8],
    ['Soan Papdi', 'सोन पापड़ी', 'Mithai', 'kg', 320, 200, 5, '🧈', 5],
    ['Mysore Pak', 'मैसूर पाक', 'Mithai', 'kg', 450, 320, 5, '🟧', 3],
    ['Rasgulla', 'रसगुल्ला', 'Bengali Sweets', 'kg', 280, 180, 5, '⚪', 8],
    ['Rasmalai', 'रसमलाई', 'Bengali Sweets', 'kg', 420, 300, 5, '🥛', 7],
    ['Cham Cham', 'चमचम', 'Bengali Sweets', 'kg', 320, 220, 5, '🩷', 4],
    ['Sandesh', 'संदेश', 'Bengali Sweets', 'kg', 400, 280, 5, '🤍', 3],
    ['Raj Bhog', 'राजभोग', 'Bengali Sweets', 'kg', 360, 250, 5, '🟡', 4],
    ['Kalakand', 'कलाकंद', 'Bengali Sweets', 'kg', 440, 310, 5, '⬜', 5],
    ['Kaju Katli', 'काजू कतली', 'Dry Fruit Mithai', 'kg', 900, 650, 5, '💠', 9],
    ['Kaju Roll', 'काजू रोल', 'Dry Fruit Mithai', 'kg', 950, 700, 5, '🧻', 4],
    ['Badam Barfi', 'बादाम बर्फी', 'Dry Fruit Mithai', 'kg', 850, 620, 5, '🟤', 4],
    ['Pista Barfi', 'पिस्ता बर्फी', 'Dry Fruit Mithai', 'kg', 1000, 740, 5, '🟩', 3],
    ['Dry Fruit Ladoo', 'ड्राई फ्रूट लड्डू', 'Dry Fruit Mithai', 'kg', 800, 580, 5, '🟤', 4],
    ['Anjeer Barfi', 'अंजीर बर्फी', 'Dry Fruit Mithai', 'kg', 900, 660, 5, '🟣', 3],
    ['Aloo Bhujia', 'आलू भुजिया', 'Namkeen', 'kg', 240, 150, 12, '🍜', 8],
    ['Sev Bhujia', 'सेव भुजिया', 'Namkeen', 'kg', 220, 140, 12, '🍝', 6],
    ['Navratan Mixture', 'नवरतन मिक्चर', 'Namkeen', 'kg', 260, 160, 12, '🥗', 7],
    ['Khatta Meetha', 'खट्टा मीठा', 'Namkeen', 'kg', 240, 150, 12, '🍯', 6],
    ['Moong Dal Namkeen', 'मूंग दाल', 'Namkeen', 'kg', 280, 180, 12, '🫘', 5],
    ['Masala Peanuts', 'मसाला मूंगफली', 'Namkeen', 'kg', 260, 160, 12, '🥜', 5],
    ['Mathri', 'मठरी', 'Namkeen', 'kg', 220, 130, 12, '🫓', 4],
    ['Namak Para', 'नमक पारा', 'Namkeen', 'kg', 200, 120, 12, '🔶', 4],
    ['Aloo Tikki', 'आलू टिक्की', 'Snacks', 'plate', 40, 18, 5, '🥔', 7],
    ['Paneer Pakoda', 'पनीर पकौड़ा', 'Snacks', 'plate', 80, 45, 5, '🧀', 6],
    ['Bread Pakoda', 'ब्रेड पकौड़ा', 'Snacks', 'piece', 20, 9, 5, '🍞', 6],
    ['Dhokla', 'ढोकला', 'Snacks', 'plate', 60, 30, 5, '🟨', 5],
    ['Chole Bhature', 'छोले भटूरे', 'Snacks', 'plate', 80, 40, 5, '🍛', 6],
    ['Samosa', 'समोसा', 'Samosa & Kachori', 'piece', 15, 7, 5, '🥟', 10],
    ['Kachori', 'कचौड़ी', 'Samosa & Kachori', 'piece', 15, 7, 5, '🥠', 9],
    ['Pyaz Kachori', 'प्याज़ कचौड़ी', 'Samosa & Kachori', 'piece', 20, 10, 5, '🧅', 7],
    ['Raj Kachori', 'राज कचौड़ी', 'Samosa & Kachori', 'plate', 60, 30, 5, '👑', 5],
    ['Kadak Chai', 'कड़क चाय', 'Beverages', 'cup', 15, 6, 5, '☕', 10],
    ['Coffee', 'कॉफ़ी', 'Beverages', 'cup', 30, 12, 5, '☕', 5],
    ['Sweet Lassi', 'मीठी लस्सी', 'Beverages', 'cup', 60, 28, 5, '🥛', 7],
    ['Cold Drink', 'कोल्ड ड्रिंक', 'Beverages', 'piece', 40, 32, 18, '🥤', 6],
    ['Mineral Water', 'पानी बोतल', 'Beverages', 'piece', 20, 15, 18, '💧', 6],
    ['Badam Milk', 'बादाम दूध', 'Beverages', 'cup', 50, 25, 5, '🥛', 4],
    ['Pav Bhaji', 'पाव भाजी', 'Fast Food', 'plate', 90, 45, 5, '🍛', 6],
    ['Veg Burger', 'वेज बर्गर', 'Fast Food', 'piece', 60, 30, 5, '🍔', 4],
    ['Veg Sandwich', 'वेज सैंडविच', 'Fast Food', 'piece', 50, 22, 5, '🥪', 4],
    ['Spring Roll', 'स्प्रिंग रोल', 'Fast Food', 'plate', 70, 35, 5, '🌯', 3],
    ['Chowmein', 'चाउमीन', 'Fast Food', 'plate', 80, 40, 5, '🍜', 5],
    ['Veg Momos', 'वेज मोमोज', 'Fast Food', 'plate', 70, 35, 5, '🥟', 5],
    ['Samosa + Chai Combo', 'समोसा चाय कॉम्बो', 'Combos', 'packet', 25, 12, 5, '🫖', 7],
    ['Breakfast Combo', 'नाश्ता कॉम्बो', 'Combos', 'plate', 99, 55, 5, '🍽️', 4],
    ['Special Thali', 'स्पेशल थाली', 'Combos', 'plate', 150, 85, 5, '🍱', 3],
    ['Assorted Mithai Box 500g', 'मिठाई बॉक्स 500g', 'Gift Boxes', 'box', 350, 250, 5, '🎁', 5],
    ['Assorted Mithai Box 1kg', 'मिठाई बॉक्स 1kg', 'Gift Boxes', 'box', 650, 480, 5, '🎁', 4],
    ['Dry Fruit Gift Box', 'ड्राई फ्रूट गिफ्ट बॉक्स', 'Gift Boxes', 'box', 1200, 900, 5, '🎀', 2],
    ['Premium Gift Hamper', 'प्रीमियम हैम्पर', 'Gift Boxes', 'box', 2500, 1900, 5, '🧺', 1]
  ];
  const products = PRODUCTS.map(([name, hi, cat, unit, price, cost, gst, emoji, pop], i) => {
    const minStock = unit === 'kg' ? ri(2, 5) : unit === 'box' ? ri(3, 6) : ri(10, 30);
    const id = run(`INSERT INTO products(sku,name,name_hi,category_id,unit,price,cost_price,gst_rate,stock,min_stock,emoji,track_stock,active,created_at)
      VALUES(?,?,?,?,?,?,?,?,0,?,?,1,1,?)`,
      `P${String(i + 1).padStart(3, '0')}`, name, hi, catId[cat], unit, price, cost, gst, minStock, emoji, ts(START, 9)).lastInsertRowid;
    return { id, name, cat, unit, price, cost, gst, pop, minStock };
  });

  // ── customers ──
  const FIRST = ['Rajesh', 'Suresh', 'Ramesh', 'Mahesh', 'Dinesh', 'Mukesh', 'Rakesh', 'Amit', 'Sumit', 'Rohit', 'Mohit', 'Ankit', 'Vikas', 'Vinod', 'Manoj', 'Sanjay', 'Ajay', 'Vijay', 'Arun', 'Varun', 'Deepak', 'Pawan', 'Naveen', 'Praveen', 'Gaurav', 'Saurabh', 'Anil', 'Sunil', 'Kapil', 'Nitin', 'Sachin', 'Rahul', 'Pooja', 'Neha', 'Priya', 'Kavita', 'Sunita', 'Anita', 'Rekha', 'Seema', 'Meena', 'Geeta', 'Sita', 'Radha', 'Shweta', 'Swati', 'Nisha', 'Ritu', 'Anju', 'Manju'];
  const LAST = ['Kumar', 'Sharma', 'Verma', 'Gupta', 'Agarwal', 'Singh', 'Yadav', 'Jain', 'Mittal', 'Goyal', 'Bansal', 'Garg', 'Chaturvedi', 'Dixit', 'Tiwari', 'Pandey', 'Mishra', 'Srivastava', 'Saxena', 'Rastogi'];
  const AREAS = ['Sadar Bazaar', 'Kamla Nagar', 'Dayalbagh', 'Sikandra', 'Tajganj', 'Shahganj', 'Balkeshwar', 'Khandari', 'Lohamandi', 'Belanganj'];
  const customers = [];
  const usedNames = new Set();
  for (let i = 0; i < 100; i++) {
    let name;
    do { name = `${pick(FIRST)} ${pick(LAST)}`; } while (usedNames.has(name));
    usedNames.add(name);
    const id = run('INSERT INTO customers(name,phone,address,opening_balance,balance,created_at) VALUES(?,?,?,0,0,?)',
      name, `9${ri(100000000, 999999999)}`, `${ri(1, 120)}, ${pick(AREAS)}, Agra`, ts(START, 10)).lastInsertRowid;
    customers.push({ id, name, balance: 0 });
  }

  // ── suppliers ──
  const SUPPLIERS = [
    ['Agra Dairy Farm', 'milk'], ['Shree Balaji Besan Mills', 'flour'],
    ['Sharma Dry Fruits Co.', 'dryfruit'], ['Agra Sugar Traders', 'sugar'],
    ['Jain Packaging House', 'packaging'], ['Fresh Vegetable Mandi', 'veg'],
    ['Gupta Kirana Store', 'general'], ['Agarwal Oil & Ghee Depot', 'ghee']
  ];
  const suppliers = SUPPLIERS.map(([name], i) => ({
    id: run('INSERT INTO suppliers(name,phone,address,gstin,created_at) VALUES(?,?,?,?,?)',
      name, `98765${ri(10000, 99999)}`, `${pick(AREAS)}, Agra`, i % 2 === 0 ? `09SUPPL${1000 + i}Z${i}` : null, ts(START, 9)).lastInsertRowid,
    name
  }));

  // ── raw materials ──
  const RAWS = [
    ['Milk', 'दूध', 'litre', 56, 60, 300], ['Sugar', 'चीनी', 'kg', 42, 50, 400],
    ['Desi Ghee', 'देसी घी', 'kg', 560, 20, 80], ['Maida', 'मैदा', 'kg', 38, 40, 250],
    ['Besan', 'बेसन', 'kg', 90, 30, 200], ['Paneer', 'पनीर', 'kg', 320, 10, 40],
    ['Refined Oil', 'रिफाइंड तेल', 'litre', 130, 20, 100], ['Khoya / Mawa', 'खोया', 'kg', 340, 15, 60],
    ['Cashew', 'काजू', 'kg', 750, 10, 50], ['Almond', 'बादाम', 'kg', 720, 8, 40],
    ['Pistachio', 'पिस्ता', 'kg', 1300, 4, 15], ['Potato', 'आलू', 'kg', 25, 40, 150],
    ['Spices Mix', 'मसाले', 'kg', 400, 5, 25], ['Saffron', 'केसर', 'g', 450, 5, 20],
    ['Packaging Boxes', 'पैकिंग डिब्बे', 'piece', 12, 200, 1500], ['Paper Bags', 'पेपर बैग', 'piece', 2, 500, 3000]
  ];
  const raws = RAWS.map(([name, hi, unit, rate, minStock, opening]) => {
    const id = run('INSERT INTO raw_materials(name,name_hi,unit,stock,min_stock,avg_rate,active,created_at) VALUES(?,?,?,0,?,?,1,?)',
      name, hi, unit, minStock, rate, ts(START, 9)).lastInsertRowid;
    moveRawStock(id, 'opening', opening, { rate, notes: 'Opening stock', userId: uid.owner, at: ts(START, 9) });
    return { id, name, unit, rate };
  });

  // ── expense categories ──
  const EXP_CATS = ['Milk Purchase', 'Vegetables', 'Gas', 'Electricity', 'Salary', 'Transport', 'Packaging', 'Cleaning', 'Maintenance', 'Rent', 'Miscellaneous'];
  const expCatIds = {};
  for (const c of EXP_CATS) expCatIds[c] = run('INSERT INTO expense_categories(name) VALUES(?)', c).lastInsertRowid;

  // ── opening stock for products ──
  const targetStock = (p) => p.unit === 'kg' ? p.minStock * 2.5 : p.unit === 'box' ? p.minStock * 2 : p.minStock * 2.5;
  for (const p of products) {
    const qty = r2(targetStock(p) * rnd(0.8, 1.2));
    moveProductStock(p.id, 'opening', qty, { notes: 'Opening stock', userId: uid.owner, at: ts(START, 8, 30) });
  }

  // ── helpers for sale generation ──
  const popTotal = products.reduce((a, p) => a + p.pop, 0);
  function weightedProduct() {
    let x = Math.random() * popTotal;
    for (const p of products) { x -= p.pop; if (x <= 0) return p; }
    return products[products.length - 1];
  }
  const KG_STEPS = [0.1, 0.2, 0.25, 0.25, 0.5, 0.5, 0.5, 0.75, 1, 1, 1.5, 2];
  function qtyFor(p) {
    if (p.unit === 'kg') return pick(KG_STEPS);
    if (p.unit === 'piece') return ri(1, 10);
    if (p.unit === 'cup') return ri(1, 6);
    if (p.unit === 'plate') return ri(1, 4);
    if (p.unit === 'box') return ri(1, 2);
    return ri(1, 3);
  }
  const HOURS = [8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 14, 15, 16, 17, 17, 18, 18, 18, 19, 19, 19, 20, 20, 21];

  let seq = 0;
  const billNo = () => `CH-${String(++seq).padStart(5, '0')}`;

  function createSale(day, hour, { forceUdhaar = false } = {}) {
    const at = ts(day, hour);
    const cashier = pick(cashiers);
    const nItems = chance(0.45) ? 1 : chance(0.6) ? 2 : ri(3, 5);
    const chosen = new Map();
    for (let i = 0; i < nItems; i++) { const p = weightedProduct(); if (!chosen.has(p.id)) chosen.set(p.id, p); }
    const items = [...chosen.values()].map(p => {
      const qty = qtyFor(p);
      const gross = r2(qty * p.price);
      const discount = chance(0.06) ? r2(gross * pick([0.05, 0.1])) : 0;
      return { p, qty, rate: p.price, gross, discount, amount: r2(gross - discount), cost: r2(qty * p.cost) };
    });
    const subtotal = r2(items.reduce((a, it) => a + it.gross, 0));
    const itemDisc = r2(items.reduce((a, it) => a + it.discount, 0));
    const billDisc = chance(0.05) ? pick([10, 20, 50]) : 0;
    const netBase = Math.max(subtotal - itemDisc, 0.01);
    let tax = 0;
    for (const it of items) {
      const share = it.amount - billDisc * (it.amount / netBase);
      it.tax = r2(share * it.p.gst / 100);
      tax = r2(tax + it.tax);
    }
    const raw = r2(subtotal - itemDisc - billDisc + tax);
    const total = Math.round(raw);
    const roundOff = r2(total - raw);

    // payment mode
    let mode = forceUdhaar ? 'udhaar' : pick(['cash', 'cash', 'cash', 'cash', 'cash', 'upi', 'upi', 'upi', 'upi', 'card', 'udhaar', 'split']);
    let customer = null;
    if (mode === 'udhaar') customer = pick(customers);
    else if (chance(0.3)) customer = pick(customers);

    const payments = [];
    let paid = total, udhaar = 0;
    if (mode === 'cash') {
      const received = Math.ceil(total / 10) * 10 + (chance(0.3) ? pick([0, 10, 40, 90]) : 0);
      payments.push({ method: 'cash', amount: total, received, change: r2(received - total) });
    } else if (mode === 'upi' || mode === 'card') {
      payments.push({ method: mode, amount: total, reference: mode === 'upi' ? `UPI${ri(10000000, 99999999)}` : `CARD${ri(1000, 9999)}` });
    } else if (mode === 'split') {
      const cashPart = Math.round(total * pick([0.4, 0.5, 0.6]));
      payments.push({ method: 'cash', amount: cashPart, received: cashPart, change: 0 });
      payments.push({ method: 'upi', amount: r2(total - cashPart), reference: `UPI${ri(10000000, 99999999)}` });
    } else { // udhaar (possibly partial cash)
      const payNow = chance(0.4) ? Math.round(total * pick([0.2, 0.3, 0.5])) : 0;
      if (payNow > 0) payments.push({ method: 'cash', amount: payNow, received: payNow, change: 0 });
      paid = payNow; udhaar = r2(total - payNow);
    }

    const bn = billNo();
    const saleId = run(`INSERT INTO sales(bill_no,status,customer_id,user_id,subtotal,discount,tax,round_off,total,paid,udhaar_amount,created_at,completed_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      bn, 'completed', customer ? customer.id : null, cashier, subtotal, r2(itemDisc + billDisc), tax, roundOff, total, paid, udhaar, at, at).lastInsertRowid;
    for (const it of items) {
      run(`INSERT INTO sale_items(sale_id,product_id,name,unit,qty,rate,discount,gst_rate,cost,amount) VALUES(?,?,?,?,?,?,?,?,?,?)`,
        saleId, it.p.id, it.p.name, it.p.unit, it.qty, it.rate, it.discount, it.p.gst, it.cost, it.amount);
      moveProductStock(it.p.id, 'sale', -it.qty, { refType: 'sale', refId: saleId, notes: bn, userId: cashier, at });
    }
    for (const pm of payments) {
      run(`INSERT INTO payments(kind,sale_id,customer_id,method,amount,received,change,reference,user_id,created_at)
           VALUES('sale',?,?,?,?,?,?,?,?,?)`,
        saleId, customer ? customer.id : null, pm.method, pm.amount, pm.received ?? null, pm.change ?? null, pm.reference ?? null, cashier, at);
    }
    if (udhaar > 0 && customer) {
      creditEntry(customer.id, 'sale', udhaar, { saleId, notes: `Bill ${bn}`, userId: cashier, at });
      customer.balance = r2(customer.balance + udhaar);
    }
    return { saleId, bn, total, items, customer, cashier, at, day };
  }

  // ── main chronology ──
  const allSales = [];
  const nowHour = Number(now().slice(11, 13));
  for (let back = DAYS; back >= 0; back--) {
    const day = dayStr(back);
    const dow = new Date(`${day}T12:00:00`).getDay();
    const isToday = back === 0;

    // morning production: top products back up to their target level (self-regulating)
    for (const p of products) {
      const cur = get('SELECT stock FROM products WHERE id = ?', p.id).stock;
      const target = targetStock(p) * rnd(1.0, 1.3);
      if (cur >= target) continue;
      let qty = r2(target - cur);
      if (p.unit !== 'kg') qty = Math.ceil(qty);
      if (qty <= 0) continue;
      moveProductStock(p.id, 'production', qty, { notes: 'Morning production', userId: uid.manager, at: ts(day, 7, ri(0, 50)) });
    }
    // raw material consumption for production
    for (const m of raws) {
      if (!chance(0.7)) continue;
      const q = m.unit === 'piece' ? ri(20, 80) : m.unit === 'g' ? rnd(0.5, 2) : rnd(2, 15);
      moveRawStock(m.id, 'consumption', -r2(q), { refType: 'production', notes: 'Daily production', userId: uid.manager, at: ts(day, 7, ri(0, 55)) });
    }

    // purchases every ~3 days
    if (back % 3 === 0) {
      const sup = pick(suppliers);
      const nIt = ri(1, 3);
      const items = [];
      for (let i = 0; i < nIt; i++) {
        const m = pick(raws);
        const q = m.unit === 'piece' ? ri(100, 300) : m.unit === 'g' ? ri(5, 15) : m.rate > 400 ? ri(2, 8) : ri(10, 50);
        items.push({ m, q, rate: r2(m.rate * rnd(0.95, 1.08)) });
      }
      const subtotal = r2(items.reduce((a, x) => a + x.q * x.rate, 0));
      const total = Math.round(subtotal);
      const paidNow = chance(0.7) ? total : Math.round(total * pick([0, 0.3, 0.5, 0.7]));
      const at = ts(day, ri(9, 12));
      const pid = run(`INSERT INTO purchases(invoice_no,supplier_id,date,subtotal,tax,total,paid,payment_method,user_id,created_at)
        VALUES(?,?,?,?,0,?,?,?,?,?)`,
        `INV-${day.replaceAll('-', '')}-${ri(10, 99)}`, sup.id, day, subtotal, total, paidNow, paidNow > 0 ? pick(['cash', 'upi', 'bank']) : null, uid.manager, at).lastInsertRowid;
      for (const x of items) {
        run('INSERT INTO purchase_items(purchase_id,item_type,item_id,name,unit,qty,rate,amount) VALUES(?,?,?,?,?,?,?,?)',
          pid, 'raw_material', x.m.id, x.m.name, x.m.unit, x.q, x.rate, r2(x.q * x.rate));
        moveRawStock(x.m.id, 'purchase', x.q, { rate: x.rate, refType: 'purchase', refId: pid, userId: uid.manager, at });
      }
    }

    // sales for the day
    const baseCount = (dow === 0 || dow === 6) ? ri(32, 42) : ri(24, 32);
    const hoursToday = isToday ? HOURS.filter(h => h <= nowHour) : HOURS;
    const count = isToday ? Math.max(Math.round(baseCount * hoursToday.length / HOURS.length), 6) : baseCount;
    for (let i = 0; i < count; i++) {
      const s = createSale(day, pick(hoursToday.length ? hoursToday : [9]));
      allSales.push(s);
    }

    // udhaar collections
    for (const c of customers) {
      if (c.balance > 400 && chance(0.12)) {
        const amt = Math.min(c.balance, Math.max(100, Math.round(c.balance * pick([0.3, 0.5, 1]) / 50) * 50));
        const at = ts(day, ri(10, 20));
        const method = pick(['cash', 'cash', 'upi']);
        const payId = run(`INSERT INTO payments(kind,customer_id,method,amount,user_id,created_at) VALUES('udhaar_receipt',?,?,?,?,?)`,
          c.id, method, amt, pick(cashiers), at).lastInsertRowid;
        creditEntry(c.id, 'payment', -amt, { paymentId: payId, method, userId: uid.manager, at });
        c.balance = r2(c.balance - amt);
      }
    }

    // expenses
    const expPlan = [
      ['Milk Purchase', rnd(400, 1100), 0.9], ['Vegetables', rnd(200, 600), 0.7],
      ['Gas', 1150, back % 6 === 0 ? 1 : 0], ['Electricity', rnd(2200, 3600), back % 15 === 0 ? 1 : 0],
      ['Salary', 30000, day.endsWith('-01') ? 1 : 0], ['Rent', 18000, day.endsWith('-05') ? 1 : 0],
      ['Transport', rnd(150, 400), 0.3], ['Packaging', rnd(200, 600), 0.2],
      ['Cleaning', rnd(100, 250), 0.3], ['Miscellaneous', rnd(100, 500), 0.2]
    ];
    for (const [cat, amt, prob] of expPlan) {
      if (chance(prob)) {
        run('INSERT INTO expenses(date,category_id,description,amount,payment_method,user_id,created_at) VALUES(?,?,?,?,?,?,?)',
          day, expCatIds[cat], cat, Math.round(amt), pick(['cash', 'cash', 'upi']), pick([uid.manager, uid.owner]), ts(day, ri(9, 20)));
      }
    }

    // wastage (evening, unsold / preparation loss)
    if (chance(0.7)) {
      const nW = ri(1, 3);
      for (let i = 0; i < nW; i++) {
        if (chance(0.7)) {
          const p = pick(products.filter(x => x.unit === 'kg' || x.unit === 'piece'));
          const q = p.unit === 'kg' ? r2(rnd(0.2, 1.5)) : ri(2, 8);
          const cur = get('SELECT stock FROM products WHERE id = ?', p.id).stock;
          if (cur < q) continue;
          moveProductStock(p.id, 'wastage', -q, { refType: 'wastage', notes: 'Unsold', userId: uid.manager, at: ts(day, 21) });
          run(`INSERT INTO wastage(date,item_type,item_id,name,qty,unit,cost,reason,staff,user_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
            day, 'product', p.id, p.name, q, p.unit, r2(q * p.cost), pick(['Unsold', 'Expired', 'Quality Issue', 'Damaged']), pick(['Ramesh', 'Suresh', 'Kitchen Staff']), uid.manager, ts(day, 21, 15));
        } else {
          const m = pick(raws);
          const q = m.unit === 'piece' ? ri(2, 10) : r2(rnd(0.5, 3));
          moveRawStock(m.id, 'wastage', -q, { refType: 'wastage', notes: 'Preparation loss', userId: uid.manager, at: ts(day, 20) });
          run(`INSERT INTO wastage(date,item_type,item_id,name,qty,unit,cost,reason,staff,user_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
            day, 'raw_material', m.id, m.name, q, m.unit, r2(q * m.rate), 'Preparation Loss', 'Kitchen Staff', uid.manager, ts(day, 20, 30));
        }
      }
    }

    // shifts (closed for past days)
    if (!isToday && chance(0.9)) {
      const cshr = pick(cashiers);
      const opening = pick([1000, 1500, 2000]);
      run(`INSERT INTO shifts(user_id,status,opened_at,closed_at,opening_cash,expected_cash,actual_cash,difference)
           VALUES(?,?,?,?,?,?,?,?)`,
        cshr, 'closed', ts(day, 8, 0, 0), ts(day, 21, 30, 0), opening, null, null, 0);
    }
  }

  // ── supplier part-payments against pending purchases ──
  const pendingPur = all('SELECT * FROM purchases WHERE total - paid > 1');
  for (const pu of pendingPur) {
    if (chance(0.5)) {
      const amt = Math.round((pu.total - pu.paid) * pick([0.5, 1]));
      run(`INSERT INTO supplier_payments(supplier_id,purchase_id,amount,method,date,user_id,created_at) VALUES(?,?,?,?,?,?,?)`,
        pu.supplier_id, pu.id, amt, pick(['cash', 'bank', 'upi']), dayStr(ri(0, 5)), uid.owner, now());
    }
  }

  // ── a few cancelled bills ──
  const toCancel = allSales.filter(() => chance(0.006)).slice(0, 8);
  for (const s of toCancel) {
    for (const it of s.items) moveProductStock(it.p.id, 'return', it.qty, { refType: 'cancel', refId: s.saleId, notes: `Cancel ${s.bn}`, userId: uid.manager, at: s.at });
    const pays = all("SELECT * FROM payments WHERE sale_id = ? AND kind = 'sale'", s.saleId);
    for (const p of pays) {
      run(`INSERT INTO payments(kind,sale_id,customer_id,method,amount,notes,user_id,created_at) VALUES('refund',?,?,?,?,?,?,?)`,
        s.saleId, p.customer_id, p.method, p.amount, `Cancel ${s.bn}`, uid.manager, s.at);
    }
    const sal = get('SELECT * FROM sales WHERE id = ?', s.saleId);
    if (sal.udhaar_amount > 0 && sal.customer_id) {
      creditEntry(sal.customer_id, 'adjustment', -sal.udhaar_amount, { saleId: s.saleId, notes: `Bill ${s.bn} cancelled`, userId: uid.manager, at: s.at });
      const c = customers.find(x => x.id === sal.customer_id); if (c) c.balance = r2(c.balance - sal.udhaar_amount);
    }
    run("UPDATE sales SET status='cancelled', cancel_reason='Customer cancelled order' WHERE id = ?", s.saleId);
    run(`INSERT INTO audit_logs(user_id,user_name,action,entity,entity_id,old_value,new_value,created_at)
         VALUES(?,?,?,?,?,?,?,?)`, uid.manager, 'Mukesh Sharma', 'bill_cancelled', 'sale', s.saleId,
      JSON.stringify({ status: 'completed' }), JSON.stringify({ status: 'cancelled' }), s.at);
  }

  // ── a few refunds ──
  const toRefund = allSales.filter(s => !toCancel.includes(s) && chance(0.008)).slice(0, 10);
  for (const s of toRefund) {
    const si = get('SELECT * FROM sale_items WHERE sale_id = ? LIMIT 1', s.saleId);
    if (!si) continue;
    const qty = si.qty;
    const amount = r2(si.amount);
    const retId = run(`INSERT INTO returns(sale_id,bill_no,date,total_refund,method,reason,restock,user_id,created_at)
      VALUES(?,?,?,?,?,?,1,?,?)`, s.saleId, s.bn, s.day, amount, 'cash', pick(['Quality Issue', 'Wrong item', 'Customer changed mind']), uid.manager, s.at).lastInsertRowid;
    run('INSERT INTO return_items(return_id,sale_item_id,product_id,name,qty,rate,amount) VALUES(?,?,?,?,?,?,?)',
      retId, si.id, si.product_id, si.name, qty, si.rate, amount);
    if (si.product_id) moveProductStock(si.product_id, 'return', qty, { refType: 'return', refId: retId, notes: `Return ${s.bn}`, userId: uid.manager, at: s.at });
    run(`INSERT INTO payments(kind,sale_id,method,amount,notes,user_id,created_at) VALUES('refund',?,?,?,?,?,?)`,
      s.saleId, 'cash', amount, `Return against ${s.bn}`, uid.manager, s.at);
    const sal = get('SELECT total FROM sales WHERE id = ?', s.saleId);
    run('UPDATE sales SET status = ? WHERE id = ?', amount >= sal.total - 0.01 ? 'refunded' : 'partial_refund', s.saleId);
    run(`INSERT INTO audit_logs(user_id,user_name,action,entity,entity_id,new_value,created_at) VALUES(?,?,?,?,?,?,?)`,
      uid.manager, 'Mukesh Sharma', 'refund', 'sale', s.saleId, JSON.stringify({ refund: amount }), s.at);
  }

  // ── two held bills (today, still editable) ──
  for (const heldSpec of [
    { items: [['Kaju Katli', 1], ['Motichoor Ladoo', 0.5]], customer: customers[2] },
    { items: [['Samosa', 6], ['Kadak Chai', 4]], customer: null }
  ]) {
    const at = ts(today(), Math.max(nowHour - 1, 8));
    let subtotal = 0, tax = 0;
    const its = heldSpec.items.map(([nm, q]) => {
      const p = products.find(x => x.name === nm);
      const gross = r2(q * p.price);
      subtotal = r2(subtotal + gross);
      const itTax = r2(gross * p.gst / 100); tax = r2(tax + itTax);
      return { p, q, gross };
    });
    const rawT = r2(subtotal + tax); const total = Math.round(rawT);
    const sid = run(`INSERT INTO sales(bill_no,status,customer_id,user_id,subtotal,discount,tax,round_off,total,paid,udhaar_amount,created_at)
      VALUES(?,?,?,?,?,0,?,?,?,0,0,?)`,
      billNo(), 'held', heldSpec.customer?.id ?? null, uid.ramesh, subtotal, tax, r2(total - rawT), total, at).lastInsertRowid;
    for (const it of its) {
      run(`INSERT INTO sale_items(sale_id,product_id,name,unit,qty,rate,discount,gst_rate,cost,amount) VALUES(?,?,?,?,?,?,0,?,?,?)`,
        sid, it.p.id, it.p.name, it.p.unit, it.q, it.p.price, it.p.gst, r2(it.q * it.p.cost), it.gross);
    }
  }

  // open shift for cashier today
  run('INSERT INTO shifts(user_id,status,opened_at,opening_cash) VALUES(?,?,?,?)', uid.ramesh, 'open', ts(today(), 8, 0, 0), 2000);

  // make a handful of products visibly low-stock
  const lowOnes = [...products].sort(() => Math.random() - 0.5).slice(0, 7);
  for (const p of lowOnes) {
    const cur = get('SELECT stock FROM products WHERE id = ?', p.id).stock;
    if (cur > p.minStock) {
      run('UPDATE products SET min_stock = ? WHERE id = ?', r2(Math.max(cur * rnd(1.05, 1.4), p.minStock)), p.id);
    }
  }

  setSetting('bill_seq', seq);
  console.log(`Seeded: ${products.length} products, ${customers.length} customers, ${allSales.length} sales (${seq} bills)`);
}

// CLI: `npm run seed`
if (typeof process !== 'undefined' && process.argv?.[1] && process.argv[1].endsWith('seed.js')) {
  const did = seedIfEmpty();
  if (!did) console.log('Database already has data. Delete data/pos.db to reseed.');
}
