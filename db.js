const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const IS_VERCEL = Boolean(process.env.VERCEL);
let DB_PATH = path.join(__dirname, 'pfis.db');

if (IS_VERCEL) {
  const tmpDbPath = path.join('/tmp', 'pfis.db');
  if (!fs.existsSync(tmpDbPath) && fs.existsSync(DB_PATH)) {
    try {
      fs.copyFileSync(DB_PATH, tmpDbPath);
    } catch (err) {
      console.error('Failed to copy db to /tmp:', err);
    }
  }
  DB_PATH = tmpDbPath;
}

const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
  // Users table
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'Analyst',
      telco TEXT DEFAULT 'ALL'
    )
  `);

  // Profiles table
  db.run(`
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      sub TEXT NOT NULL,
      avg REAL NOT NULL,
      hours TEXT NOT NULL,
      device TEXT NOT NULL,
      location TEXT NOT NULL,
      initials TEXT NOT NULL
    )
  `);

  // Transactions table
  db.run(`
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      ts TEXT NOT NULL,
      profile_id TEXT,
      profile_name TEXT,
      telco TEXT NOT NULL,
      telcoCode TEXT NOT NULL,
      amount REAL NOT NULL,
      device TEXT NOT NULL,
      location TEXT NOT NULL,
      recipient TEXT NOT NULL,
      fraudType TEXT NOT NULL,
      mlScamProbability REAL NOT NULL,
      score INTEGER NOT NULL,
      risk TEXT NOT NULL,
      status TEXT NOT NULL,
      confirmed INTEGER,
      hurdles TEXT NOT NULL
    )
  `);

  // Investigations table
  db.run(`
    CREATE TABLE IF NOT EXISTS investigations (
      id TEXT PRIMARY KEY,
      txnId TEXT NOT NULL,
      account TEXT NOT NULL,
      telco TEXT NOT NULL,
      amount REAL NOT NULL,
      reason TEXT NOT NULL,
      ts TEXT NOT NULL,
      priority TEXT NOT NULL,
      status TEXT NOT NULL
    )
  `);

  // Threat Blacklist table
  db.run(`
    CREATE TABLE IF NOT EXISTS threat_blacklist (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      value TEXT UNIQUE NOT NULL,
      reason TEXT NOT NULL,
      reportedBy TEXT NOT NULL,
      reportsCount INTEGER NOT NULL DEFAULT 1,
      risk TEXT NOT NULL DEFAULT 'HIGH',
      autoBlocked INTEGER NOT NULL DEFAULT 0,
      date TEXT NOT NULL
    )
  `);

  // Seed default admin and analyst users
  db.get('SELECT COUNT(*) as count FROM users', [], (err, row) => {
    if (err) return console.error('Error checking users table:', err);
    if (!row || row.count === 0) {
      const salt = bcrypt.genSaltSync(10);
      const adminHash = bcrypt.hashSync('admin123', salt);
      const analystHash = bcrypt.hashSync('analyst123', salt);

      const stmt = db.prepare('INSERT INTO users (username, password_hash, name, role, telco) VALUES (?, ?, ?, ?, ?)');
      stmt.run('admin', adminHash, 'System Administrator', 'Admin', 'ALL');
      stmt.run('officer_mtn', analystHash, 'MTN Surveillance Officer', 'Analyst', 'MTN');
      stmt.run('officer_telecel', analystHash, 'Telecel Risk Officer', 'Analyst', 'TELECEL');
      stmt.run('officer_at', analystHash, 'AT Money Risk Specialist', 'Analyst', 'AT');
      stmt.finalize();
    }
  });

  // Seed default profiles
  db.get('SELECT COUNT(*) as count FROM profiles', [], (err, row) => {
    if (err) return console.error('Error checking profiles table:', err);
    if (!row || row.count === 0) {
      const profiles = [
        {id:"U-PF-001",name:"Kofi Mensah",type:"Trader",sub:"Frequent Sender",avg:600,hours:"8,18",device:"Samsung Galaxy A54",location:"Kumasi",initials:"KM"},
        {id:"U-PF-002",name:"Ama Boateng",type:"Student",sub:"Saver",avg:120,hours:"9,20",device:"iPhone 13",location:"Accra",initials:"AB"},
        {id:"U-PF-003",name:"Kwame Asante",type:"Worker",sub:"Bill Payer",avg:350,hours:"7,21",device:"Tecno Spark 10",location:"Takoradi",initials:"KA"},
        {id:"U-PF-004",name:"Akosua Frimpong",type:"Merchant",sub:"Bulk Receiver",avg:1200,hours:"6,20",device:"Xiaomi Redmi 12",location:"Accra",initials:"AF"},
        {id:"U-PF-005",name:"Yaw Darko",type:"Worker",sub:"Remittance Sender",avg:450,hours:"8,19",device:"Samsung Galaxy A32",location:"Kumasi",initials:"YD"},
        {id:"U-PF-006",name:"Efua Ansah",type:"Student",sub:"Freelancer",avg:200,hours:"10,22",device:"Tecno Camon 20",location:"Cape Coast",initials:"EA"}
      ];

      const stmt = db.prepare('INSERT INTO profiles (id, name, type, sub, avg, hours, device, location, initials) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
      profiles.forEach(p => {
        stmt.run(p.id, p.name, p.type, p.sub, p.avg, p.hours, p.device, p.location, p.initials);
      });
      stmt.finalize();
    }
  });

  // Seed default threat blacklist
  db.get('SELECT COUNT(*) as count FROM threat_blacklist', [], (err, row) => {
    if (err) return console.error('Error checking threat_blacklist table:', err);
    if (!row || row.count === 0) {
      const blacklist = [
        { id: "BLK-GH-001", type: "Phone Number", value: "0244012999", reason: "Fake MoMo Reversal SMS Scam", reportedBy: "MTN Ghana", reportsCount: 18, risk: "HIGH", autoBlocked: 1, date: "2025-01-10" },
        { id: "BLK-GH-002", type: "Agent ID", value: "AG-998811", reason: "Unsolicited Agent Cashout Prompt Exploit", reportedBy: "Telecel Cash", reportsCount: 12, risk: "HIGH", autoBlocked: 1, date: "2025-01-14" },
        { id: "BLK-GH-003", type: "Phone Number", value: "0503991200", reason: "Fake Loan Approval Phishing", reportedBy: "AT Money", reportsCount: 9, risk: "HIGH", autoBlocked: 1, date: "2025-01-18" },
        { id: "BLK-GH-004", type: "Phone Number", value: "0277880011", reason: "Social Engineering Fraudster", reportedBy: "MTN Ghana", reportsCount: 24, risk: "CRITICAL", autoBlocked: 1, date: "2025-01-20" }
      ];

      const stmt = db.prepare('INSERT INTO threat_blacklist (id, type, value, reason, reportedBy, reportsCount, risk, autoBlocked, date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
      blacklist.forEach(b => {
        stmt.run(b.id, b.type, b.value, b.reason, b.reportedBy, b.reportsCount, b.risk, b.autoBlocked, b.date);
      });
      stmt.finalize();
    }
  });
});

// Async helper functions
function queryAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function queryGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function runSql(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

module.exports = {
  db,
  queryAll,
  queryGet,
  runSql,
  getUserByUsername: (username) => queryGet('SELECT * FROM users WHERE username = ?', [username]),
  getProfiles: () => queryAll('SELECT * FROM profiles'),
  getTransactions: (limit = 100) => queryAll('SELECT * FROM transactions ORDER BY ts DESC LIMIT ?', [limit]),
  insertTransaction: (t) => runSql(
    `INSERT INTO transactions (id, ts, profile_id, profile_name, telco, telcoCode, amount, device, location, recipient, fraudType, mlScamProbability, score, risk, status, confirmed, hurdles)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      t.id,
      t.ts instanceof Date ? t.ts.toISOString() : t.ts,
      t.profile ? t.profile.id : null,
      t.profile ? t.profile.name : 'Unknown',
      t.telco,
      t.telcoCode,
      t.amount,
      t.device,
      t.location,
      t.recipient,
      t.fraudType,
      t.mlScamProbability,
      t.score,
      t.risk,
      t.status,
      t.confirmed === null ? null : t.confirmed ? 1 : 0,
      JSON.stringify(t.hurdles || [])
    ]
  ),
  getInvestigations: () => queryAll('SELECT * FROM investigations ORDER BY ts DESC'),
  insertInvestigation: (inv) => runSql(
    `INSERT INTO investigations (id, txnId, account, telco, amount, reason, ts, priority, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [inv.id, inv.txnId, inv.account, inv.telco, inv.amount, inv.reason, inv.ts instanceof Date ? inv.ts.toISOString() : inv.ts, inv.priority, inv.status]
  ),
  getThreats: () => queryAll('SELECT * FROM threat_blacklist ORDER BY reportsCount DESC'),
  getThreatByValue: (val) => queryGet('SELECT * FROM threat_blacklist WHERE value = ?', [val]),
  insertThreat: (t) => runSql(
    `INSERT INTO threat_blacklist (id, type, value, reason, reportedBy, reportsCount, risk, autoBlocked, date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [t.id, t.type, t.value, t.reason, t.reportedBy, t.reportsCount || 1, t.risk || 'HIGH', t.autoBlocked ? 1 : 0, t.date || new Date().toISOString().split('T')[0]]
  ),
  updateThreatReportCount: (val, count, risk, autoBlocked) => runSql(
    `UPDATE threat_blacklist SET reportsCount = ?, risk = ?, autoBlocked = ? WHERE value = ?`,
    [count, risk, autoBlocked ? 1 : 0, val]
  )
};
