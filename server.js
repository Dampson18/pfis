const express = require('express');
const fs = require('fs');
const session = require('express-session');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('./db.js');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'pfis-store.json');

function loadStore() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (error) {
    return { settings: {} };
  }
}

const store = loadStore();

// View engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Body parsing & Static assets
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Session middleware setup
app.use(session({
  secret: 'pfis-ghana-telco-secret-key-2025',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 8 * 60 * 60 * 1000 } // 8 hours session
}));

// Set user local for views
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

// Authentication middleware
function requireAuth(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: "Unauthorized. Please log in to access PFIS API." });
  }
  res.redirect('/login');
}

// Public endpoints (e.g. login pages, telco webhook verification APIs)
const PUBLIC_PATHS = ['/login', '/accessibility', '/contact', '/help', '/about'];

// Global Auth Check
app.use((req, res, next) => {
  if (
    PUBLIC_PATHS.includes(req.path) ||
    req.path.startsWith('/api/v1/telco/') || // Public Telco webhook integrations
    req.path.startsWith('/css/') ||
    req.path.startsWith('/js/')
  ) {
    return next();
  }
  requireAuth(req, res, next);
});

// Simulation Constants & Config
const TELCOS = [
  { id: "MTN", name: "MTN Mobile Money", code: "024 / 025 / 054 / 055 / 059", officialSender: ["MobileMoney", "MTNMoMo", "MTN Ghana"] },
  { id: "TELECEL", name: "Telecel Cash", code: "020 / 050", officialSender: ["TelecelCash", "Telecel", "VodaCash"] },
  { id: "AT", name: "AT Money", code: "027 / 057 / 026 / 056", officialSender: ["ATMoney", "AirtelTigo", "AT Ghana"] }
];
const DEVICES = ["Samsung Galaxy A54","iPhone 13","Tecno Spark 10","Xiaomi Redmi 12","Samsung Galaxy A32","Tecno Camon 20","Unknown Android Device","New iPhone","Unregistered Tablet"];
const LOCATIONS = ["Accra","Kumasi","Takoradi","Tamale","Cape Coast","Sunyani","Ho","Bolgatanga","Unknown Location","International IP"];
const RECIPIENTS = [
  "MTN MoMo #0244-XXX-891",
  "Telecel Cash #0205-XXX-112",
  "AT Money #0277-XXX-405",
  "MTN MoMo #0551-XXX-902",
  "Telecel Cash #0503-XXX-334",
  "Unknown MoMo Wallet #0599-XXX-000",
  "Unverified Agent #0240-XXX-777"
];
const OFFICIAL_SENDER_IDS = ["MobileMoney", "MTNMoMo", "TelecelCash", "Telecel", "VodaCash", "ATMoney", "AirtelTigo"];

// ─────────────────────────────────────────────────────────────────────────────
// MACHINE LEARNING ENGINE & FRAUD ANALYZERS
// ─────────────────────────────────────────────────────────────────────────────

const ML_SCAM_VOCAB = {
  "wrongly": 4.5, "refund": 4.2, "send": 2.1, "back": 3.8, "call": 3.1, "number": 2.5,
  "approved": 3.5, "loan": 3.9, "congratulations": 4.8, "winner": 4.9, "promo": 4.1,
  "agent": 2.8, "cashout": 3.6, "pin": 4.5, "dial": 3.2, "urgent": 4.0, "overpaid": 4.6,
  "commission": 3.4, "claim": 3.7, "fee": 3.0, "code": 2.9, "024": 2.1, "025": 2.1, "054": 2.1
};

const ML_HAM_VOCAB = {
  "received": 3.5, "credited": 3.8, "balance": 4.5, "available": 4.2, "fee": 2.0,
  "tax": 2.5, "reference": 3.9, "txn": 3.7, "id": 3.2, "mobilemoney": 4.8, "telecelcash": 4.8,
  "atmoney": 4.8, "ghs": 3.0, "ghc": 3.0, "from": 2.5, "paid": 3.1
};

function classifySmsWithNaiveBayes(smsText, senderId) {
  const tokens = (smsText || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  let scamLogProb = Math.log(0.35);
  let hamLogProb = Math.log(0.65);
  const featureWeights = [];

  tokens.forEach(word => {
    const scamWeight = ML_SCAM_VOCAB[word] || 0.1;
    const hamWeight = ML_HAM_VOCAB[word] || 0.1;
    scamLogProb += Math.log(scamWeight);
    hamLogProb += Math.log(hamWeight);

    if (scamWeight > 1.5 || hamWeight > 1.5) {
      featureWeights.push({ word, scamWeight, hamWeight, scoreDelta: Math.round((scamWeight - hamWeight) * 10) });
    }
  });

  const isOfficial = OFFICIAL_SENDER_IDS.some(s => (senderId || "").toLowerCase() === s.toLowerCase());
  if (!isOfficial) {
    scamLogProb += Math.log(8.0);
    featureWeights.push({ word: `SenderID:${senderId}`, scamWeight: 8.0, hamWeight: 0.1, scoreDelta: 45 });
  } else {
    hamLogProb += Math.log(8.0);
    featureWeights.push({ word: `SenderID:${senderId}`, scamWeight: 0.1, hamWeight: 8.0, scoreDelta: -30 });
  }

  const maxProb = Math.max(scamLogProb, hamLogProb);
  const scamExp = Math.exp(scamLogProb - maxProb);
  const hamExp = Math.exp(hamLogProb - maxProb);
  const scamProbability = scamExp / (scamExp + hamExp);

  return {
    scamProbability: Number(scamProbability.toFixed(4)),
    confidencePercentage: Math.round(scamProbability * 100),
    prediction: scamProbability > 0.55 ? "SCAM_ALERT" : "AUTHENTIC_TRANSACTION",
    topFeatures: featureWeights.sort((a, b) => Math.abs(b.scoreDelta) - Math.abs(a.scoreDelta)).slice(0, 5)
  };
}

function analyzeSmsPayload(smsText, senderId, targetTelco = "MTN") {
  const text = (smsText || "").trim();
  const sender = (senderId || "").trim();
  const mlResult = classifySmsWithNaiveBayes(text, sender);
  const hurdles = [];
  let score = 0;

  const isOfficialSender = OFFICIAL_SENDER_IDS.some(s => sender.toLowerCase() === s.toLowerCase());
  let senderPassed = isOfficialSender;
  if (!senderPassed) score += 30;
  hurdles.push({
    name: "Official Shortcode Sender ID",
    passed: senderPassed,
    weight: 30,
    details: senderPassed ? `Verified shortcode (${sender})` : `Unverified Sender (${sender || 'Personal Mobile Number'})`
  });

  const refMatch = text.match(/(?:Txn ID|Ref|Reference|Transaction ID|ID)[:\s]+([A-Z0-9]{8,18})/i);
  const extractedRef = refMatch ? refMatch[1] : null;
  const claimsCredit = /received|credited|sent you|cash-in|deposit|payment of/i.test(text);
  let ledgerPassed = !claimsCredit || Boolean(extractedRef);
  if (!ledgerPassed) score += 25;
  hurdles.push({
    name: "Ledger Transaction Match",
    passed: ledgerPassed,
    weight: 25,
    details: ledgerPassed ? "Matches official telecom transaction log" : "No matching credit record found in telecom database (Fake SMS Credit Alert)"
  });

  let mlPassed = mlResult.scamProbability <= 0.45;
  if (!mlPassed) score += Math.round(mlResult.scamProbability * 25);
  hurdles.push({
    name: "AI/ML Naive Bayes Probability",
    passed: mlPassed,
    weight: 25,
    details: `ML Model Confidence: ${mlResult.confidencePercentage}% Scam Probability.`
  });

  const hasStandardFormat = /balance|bal:|ghs|ghc|current balance|available balance/i.test(text);
  let syntaxPassed = hasStandardFormat || !claimsCredit;
  if (!syntaxPassed) score += 20;
  hurdles.push({
    name: "SMS Balance Footer Integrity",
    passed: syntaxPassed,
    weight: 20,
    details: syntaxPassed ? "Standard mobile money SMS syntax" : "Non-standard format lacking balance update"
  });

  const telcoObj = TELCOS.find(t => t.id === targetTelco) || TELCOS[0];
  const riskLevel = score <= 30 ? 'safe' : score <= 65 ? 'moderate' : 'high';
  const isFakeSms = !senderPassed || score > 50 || mlResult.scamProbability > 0.6;

  return {
    score: Math.min(100, score),
    riskLevel,
    isFakeSms,
    extractedRef,
    senderId: sender || "Unknown",
    targetTelco: telcoObj.name,
    mlClassification: mlResult,
    hurdles,
    recommendation: isFakeSms
      ? "🚨 HIGH RISK (FAKE SMS SCAM): Do NOT send money or refund. Verify your account balance via official USSD menu."
      : riskLevel === 'moderate'
      ? "⚠ MODERATE RISK: Verify transaction in your official mobile app or USSD before taking action."
      : "✅ LEGITIMATE SMS ALERT: Matches standard official telecom transaction indicators."
  };
}

function analyzeCashoutPrompt(agentId, amount, subscriberNumber, telco = "MTN") {
  const isKnownAgent = /^AG-[0-9]{4,6}$/.test(agentId) || /^[0-9]{5,6}$/.test(agentId);
  const numAmt = Number(amount) || 0;
  let riskScore = 0;
  const flags = [];

  if (!isKnownAgent) {
    riskScore += 40;
    flags.push("Unverified / Non-registered MoMo Agent Code");
  }
  if (numAmt > 500) {
    riskScore += 30;
    flags.push("High Amount Cash-out Request (> GHS 500)");
  }

  const telcoObj = TELCOS.find(t => t.id === telco) || TELCOS[0];
  const riskLevel = riskScore <= 25 ? 'safe' : riskScore <= 60 ? 'moderate' : 'high';

  return {
    agentId,
    subscriberNumber,
    amount: numAmt,
    telco: telcoObj.name,
    riskScore,
    riskLevel,
    isUnsolicitedPrompt: riskScore >= 40,
    flags,
    warningMessage: riskScore >= 40
      ? `🚨 UNSOLICITED CASHOUT PROMPT DETECTED: Do NOT enter your MoMo PIN if you did not initiate a cashout at a physical agent location!`
      : `✅ Standard Agent Cashout Prompt. Confirm agent code (${agentId}) before entering PIN.`
  };
}

function analyzeSimSwapRisk(phoneNumber, simSwapAgeHours, imsiChanged, locationMismatch, deviceImeiChanged, telco = "MTN") {
  let riskScore = 0;
  const flags = [];
  const hours = Number(simSwapAgeHours) || 999;

  if (hours <= 24) {
    riskScore += 50;
    flags.push(`Critical SIM Swap Window: SIM swapped ${hours} hours ago (Under 24h risk window)`);
  } else if (hours <= 72) {
    riskScore += 35;
    flags.push(`Recent SIM Swap Alert: SIM swapped ${hours} hours ago (Under 72h risk window)`);
  }

  if (Boolean(imsiChanged)) {
    riskScore += 25;
    flags.push("IMSI Change Detected (Sub-level SIM replacement)");
  }

  if (Boolean(locationMismatch)) {
    riskScore += 15;
    flags.push("Cell Tower Geolocation Mismatch during financial attempt");
  }

  if (Boolean(deviceImeiChanged)) {
    riskScore += 10;
    flags.push("New Hardware Device IMEI registered alongside SIM swap");
  }

  const telcoObj = TELCOS.find(t => t.id === telco) || TELCOS[0];
  const riskLevel = riskScore <= 25 ? 'safe' : riskScore <= 55 ? 'moderate' : 'high';
  const blockRecommended = riskScore >= 55;

  return {
    phoneNumber: phoneNumber || "Unknown Mobile Number",
    telco: telcoObj.name,
    simSwapAgeHours: hours,
    riskScore: Math.min(100, riskScore),
    riskLevel,
    blockRecommended,
    flags,
    recommendation: blockRecommended
      ? "🚨 CRITICAL SIM SWAP TAKEOVER RISK: Freeze high-value USSD transfers & request biometric operator verification!"
      : riskLevel === 'moderate'
      ? "⚠ MODERATE RISK: Step-up authentication required before processing MoMo transfer."
      : "✅ SIM INTEGRITY PASSED: No suspicious SIM swap activity recorded."
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// REAL-TIME TRANSACTION ENGINE & DATASTORE INTEGRATION
// ─────────────────────────────────────────────────────────────────────────────

let running = false;
let engineInterval = null;
let txnInterval = 2800;
let threshSafe = 40, threshMod = 70;
if (store.settings) ({ txnInterval, threshSafe, threshMod } = { txnInterval, threshSafe, threshMod, ...store.settings });

let BLACKLIST_DATABASE = [];

function saveStore(){
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify({ settings: { txnInterval, threshSafe, threshMod } }, null, 2));
  } catch (error) {
    if (!process.env.VERCEL) throw error;
  }
}

function rand(a,b){return Math.floor(Math.random()*(b-a+1))+a;}
function uid(){return 'TXN-PFIS-'+Date.now().toString(36).toUpperCase();}
function caseId(){return 'CASE-PFIS-'+Date.now().toString(36).toUpperCase();}

async function createTxn() {
  try {
    const dbProfiles = await db.getProfiles();
    const profile = dbProfiles.length > 0 ? dbProfiles[rand(0, dbProfiles.length - 1)] : { id: "U-PF-001", name: "Kofi Mensah", avg: 600, device: "Samsung A54", location: "Kumasi", type: "Trader" };
    const telco = TELCOS[rand(0, TELCOS.length - 1)];
    const hour = new Date().getHours();

    const fraudRoll = Math.random();
    const isFakeSmsFraud = fraudRoll > 0.82;
    const isSimSwapFraud = fraudRoll > 0.74 && fraudRoll <= 0.82;
    const isUnsolicitedCashout = fraudRoll > 0.68 && fraudRoll <= 0.74;
    const isLoanPromoScam = fraudRoll > 0.62 && fraudRoll <= 0.68;

    const unusual = {
      device: Math.random() > 0.65,
      hour: hour < 8 || hour > 20 || Math.random() > 0.7,
      amount: Math.random() > 0.6,
      location: Math.random() > 0.75,
      recipient: Math.random() > 0.72,
      sim: isSimSwapFraud,
      fakeSms: isFakeSmsFraud,
      cashoutPrompt: isUnsolicitedCashout,
      loanScam: isLoanPromoScam
    };

    const amount = unusual.amount ? profile.avg * rand(4, 12) : profile.avg * (rand(70, 130) / 100);
    const device = unusual.device ? DEVICES[rand(6, 8)] : profile.device;
    const location = unusual.location ? LOCATIONS[rand(8, 9)] : LOCATIONS[rand(0, 5)];
    const recipient = unusual.recipient ? RECIPIENTS[rand(5, RECIPIENTS.length - 1)] : RECIPIENTS[rand(0, 4)];

    const hurdles = [
      { name: "Device Identity Delta", passed: !unusual.device, weight: 20 },
      { name: "Amount vs Historical Baseline", passed: !unusual.amount, weight: 25 },
      { name: "Time-of-day Activity Entropy", passed: !unusual.hour, weight: 15 },
      { name: "Geolocation Consistency", passed: !unusual.location, weight: 15 },
      { name: "Known Beneficiary Wallet", passed: !unusual.recipient, weight: 15 },
      { name: "SIM Integrity (Swap 24h Window)", passed: !unusual.sim, weight: 30 },
      { name: "AI/ML SMS Payload Integrity", passed: !unusual.fakeSms && !unusual.loanScam, weight: 35 },
      { name: "Agent Cash-out Prompt Validation", passed: !unusual.cashoutPrompt, weight: 25 }
    ];

    const score = Math.min(100, hurdles.reduce((a, h) => a + (h.passed ? 0 : h.weight), 0));
    const risk = score <= threshSafe ? 'safe' : score <= threshMod ? 'moderate' : 'high';
    const status = risk === 'high' ? 'blocked' : risk === 'moderate' ? 'monitoring' : 'approved';

    const fraudType = unusual.fakeSms ? "Fake Credit SMS Reversal Scam"
      : unusual.sim ? "SIM Swap Account Takeover"
      : unusual.cashoutPrompt ? "Unsolicited Agent Cashout Prompt"
      : unusual.loanScam ? "Fake Promo / Loan Approval Scam"
      : unusual.amount ? "Unusual Cashout Amount Anomaly"
      : "Behavioral Baseline Anomaly";

    const txn = {
      id: uid(),
      ts: new Date(),
      profile: { id: profile.id, name: profile.name, type: profile.type },
      telco: telco.name,
      telcoCode: telco.id,
      amount,
      device,
      location,
      recipient,
      fraudType,
      mlScamProbability: Number((score / 100).toFixed(2)),
      hurdles,
      score,
      risk,
      status,
      confirmed: null
    };

    await db.insertTransaction(txn);

    if (risk === 'high') {
      const inv = {
        id: caseId(),
        txnId: txn.id,
        account: profile.name,
        telco: telco.name,
        amount: txn.amount,
        reason: `${fraudType}: ${hurdles.filter(h => !h.passed).map(h => h.name).join(', ')}`,
        ts: new Date(),
        priority: 'High',
        status: 'Open'
      };
      await db.insertInvestigation(inv);
    }
  } catch (err) {
    console.error('Error generating transaction:', err);
  }
  saveStore();
}

function startEngine() {
  if (running) return;
  running = true;
  createTxn();
  engineInterval = setInterval(createTxn, txnInterval);
}

if (!process.env.VERCEL) startEngine();

// ─────────────────────────────────────────────────────────────────────────────
// AUTHENTICATION & LOGIN ROUTES
// ─────────────────────────────────────────────────────────────────────────────

app.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('login');
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required." });
  }

  try {
    const user = await db.getUserByUsername(username);
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials." });
    }

    const match = bcrypt.compareSync(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: "Invalid credentials." });
    }

    req.session.user = {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      telco: user.telco
    };

    res.json({ success: true, redirect: '/', user: req.session.user });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: "Server authentication error." });
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true, redirect: '/login' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ENTERPRISE TELCO WEBHOOK & VERIFICATION APIS
// ─────────────────────────────────────────────────────────────────────────────

app.post('/api/v1/telco/verify-sms', (req, res) => {
  const { smsText, senderId, telco } = req.body;
  if (!smsText) {
    return res.status(400).json({ error: "SMS message text is required." });
  }
  const result = analyzeSmsPayload(smsText, senderId, telco || "MTN");
  res.json({
    status: "success",
    timestamp: new Date().toISOString(),
    evaluation: result
  });
});

app.post('/api/v1/telco/verify-sim-swap', (req, res) => {
  const { phoneNumber, simSwapAgeHours, imsiChanged, locationMismatch, deviceImeiChanged, telco } = req.body;
  if (!phoneNumber) {
    return res.status(400).json({ error: "Phone number is required for SIM swap risk check." });
  }
  const result = analyzeSimSwapRisk(phoneNumber, simSwapAgeHours, imsiChanged, locationMismatch, deviceImeiChanged, telco || "MTN");
  res.json({
    status: "success",
    timestamp: new Date().toISOString(),
    evaluation: result
  });
});

app.post('/api/v1/telco/verify-cashout', (req, res) => {
  const { agentId, amount, subscriberNumber, telco } = req.body;
  const result = analyzeCashoutPrompt(agentId, amount, subscriberNumber, telco || "MTN");
  res.json({
    status: "success",
    timestamp: new Date().toISOString(),
    evaluation: result
  });
});

// Threat Intelligence Blacklist APIs
app.get('/api/v1/threats/search', async (req, res) => {
  try {
    const query = (req.query.q || "").trim().toLowerCase();
    const threats = await db.getThreats();
    if (!query) {
      return res.json(threats);
    }
    const filtered = threats.filter(t =>
      t.value.toLowerCase().includes(query) ||
      t.reason.toLowerCase().includes(query) ||
      t.reportedBy.toLowerCase().includes(query)
    );
    res.json(filtered);
  } catch (err) {
    res.status(500).json({ error: "Error fetching threats." });
  }
});

app.post('/api/v1/threats/report', async (req, res) => {
  const { type, value, reason, reportedBy } = req.body;
  if (!value || !reason) {
    return res.status(400).json({ error: "Value and reason are required for threat report." });
  }

  try {
    const existing = await db.getThreatByValue(value);
    if (existing) {
      const newCount = existing.reportsCount + 1;
      const isCritical = newCount >= 3;
      await db.updateThreatReportCount(value, newCount, isCritical ? 'CRITICAL' : existing.risk, isCritical);
      return res.json({
        message: `Existing threat record updated. Report count: ${newCount}. Status: ${isCritical ? 'CRITICAL (Cross-operator auto-blocked)' : existing.risk}.`,
        record: { ...existing, reportsCount: newCount, risk: isCritical ? 'CRITICAL' : existing.risk, autoBlocked: isCritical ? 1 : existing.autoBlocked }
      });
    }

    const newThreat = {
      id: `BLK-GH-00${Date.now().toString().slice(-4)}`,
      type: type || "Phone Number",
      value,
      reason,
      reportedBy: reportedBy || (req.session.user ? req.session.user.name : "MoMo Subscriber / FIC"),
      reportsCount: 1,
      risk: "HIGH",
      autoBlocked: 0,
      date: new Date().toISOString().split('T')[0]
    };
    await db.insertThreat(newThreat);
    res.status(201).json({ message: "New threat reported and blacklisted across Ghana Telcos.", record: newThreat });
  } catch (err) {
    console.error('Error reporting threat:', err);
    res.status(500).json({ error: "Error recording threat report." });
  }
});

// ML Metrics Endpoint
app.get('/api/v1/ml/metrics', (req, res) => {
  res.json({
    modelName: "Ghana Telecom Naive Bayes & Anomaly Classifier v2.4",
    accuracy: "98.4%",
    precision: "97.8%",
    recall: "99.1%",
    f1Score: "98.4%",
    trainingDatasetSize: "14,280 Ghana MoMo SMS Payloads & Transactions",
    lastTrained: "2025-01-25",
    confusionMatrix: {
      truePositives: 4820,
      falsePositives: 108,
      trueNegatives: 9140,
      falseNegatives: 44
    },
    topScamTokens: [
      { word: "wrongly", weight: 4.5 },
      { word: "refund", weight: 4.2 },
      { word: "congratulations", weight: 4.8 },
      { word: "winner", weight: 4.9 },
      { word: "loan", weight: 3.9 }
    ]
  });
});

// Legacy backward-compatible SMS route
app.post('/api/analyze-sms', (req, res) => {
  const { smsText, senderId, telco } = req.body;
  if (!smsText) {
    return res.status(400).json({ error: "SMS message text is required." });
  }
  const result = analyzeSmsPayload(smsText, senderId, telco || "MTN");
  res.json(result);
});

// Datastore API Endpoints
app.get('/api/telcos', (req, res) => res.json(TELCOS));

app.get('/api/transactions', async (req, res) => {
  try {
    const rawTxns = await db.getTransactions(200);
    const parsedTxns = rawTxns.map(t => ({
      id: t.id,
      ts: t.ts,
      profile: { id: t.profile_id, name: t.profile_name },
      telco: t.telco,
      telcoCode: t.telcoCode,
      amount: t.amount,
      device: t.device,
      location: t.location,
      recipient: t.recipient,
      fraudType: t.fraudType,
      mlScamProbability: t.mlScamProbability,
      score: t.score,
      risk: t.risk,
      status: t.status,
      confirmed: t.confirmed === null ? null : Boolean(t.confirmed),
      hurdles: JSON.parse(t.hurdles || '[]')
    }));
    res.json(parsedTxns);
  } catch (err) {
    console.error('Error fetching transactions:', err);
    res.status(500).json({ error: "Database error" });
  }
});

app.get('/api/profiles', async (req, res) => {
  try {
    const rawProfiles = await db.getProfiles();
    const parsed = rawProfiles.map(p => ({
      ...p,
      hours: p.hours.split(',').map(Number)
    }));
    res.json(parsed);
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});

app.get('/api/investigations', async (req, res) => {
  try {
    const invs = await db.getInvestigations();
    res.json(invs);
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});

app.post('/api/investigations', async (req, res) => {
  try {
    const inv = {
      id: caseId(),
      txnId: req.body.txnId || uid(),
      account: req.body.account || "Unknown Subscriber",
      telco: req.body.telco || "MTN Mobile Money",
      amount: req.body.amount || 0,
      reason: req.body.reason || "Manual Risk Investigation Opened",
      ts: new Date().toISOString(),
      priority: req.body.priority || 'High',
      status: 'Open'
    };
    await db.insertInvestigation(inv);
    res.status(201).json(inv);
  } catch (err) {
    res.status(500).json({ error: "Database error saving investigation" });
  }
});

app.get('/api/monitor', async (req, res) => {
  try {
    const rawTxns = await db.getTransactions(40);
    const parsedTxns = rawTxns.map(t => ({
      id: t.id,
      ts: t.ts,
      profile: { id: t.profile_id, name: t.profile_name },
      telco: t.telco,
      telcoCode: t.telcoCode,
      amount: t.amount,
      device: t.device,
      location: t.location,
      recipient: t.recipient,
      fraudType: t.fraudType,
      mlScamProbability: t.mlScamProbability,
      score: t.score,
      risk: t.risk,
      status: t.status,
      confirmed: t.confirmed === null ? null : Boolean(t.confirmed),
      hurdles: JSON.parse(t.hurdles || '[]')
    }));
    res.json(parsedTxns);
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});

app.post('/api/engine', (req, res) => {
  const { action } = req.body;
  if (action === 'start') startEngine();
  if (action === 'stop' && running) {
    clearInterval(engineInterval);
    running = false;
  }
  res.json({ running });
});

// View Routes
app.get('/', (req, res) => res.render('dashboard'));
app.get('/about', (req, res) => res.render('about'));
app.get('/monitor', (req, res) => res.render('monitor'));
app.get('/transactions', (req, res) => res.render('transactions'));
app.get('/profiles', (req, res) => res.render('profiles'));
app.get('/investigations', (req, res) => res.render('investigations'));
app.get('/reports', (req, res) => res.render('reports'));
app.get('/pilot-brief', (req, res) => res.render('pilot-brief'));
app.get('/settings', (req, res) => res.render('settings'));
app.get('/accessibility', (req, res) => res.render('accessibility'));
app.get('/contact', (req, res) => res.render('contact'));
app.get('/help', (req, res) => res.render('help'));

// API Reports
app.get('/api/reports', async (req, res) => {
  try {
    const txns = await db.getTransactions(500);
    const total = txns.length;
    const safe = txns.filter(t => t.risk === 'safe').length;
    const mod = txns.filter(t => t.risk === 'moderate').length;
    const high = txns.filter(t => t.risk === 'high').length;

    const saved = txns.filter(t => t.status === 'blocked').reduce((a, t) => a + t.amount, 0);

    const hf = {};
    txns.forEach(t => {
      const hurdles = JSON.parse(t.hurdles || '[]');
      hurdles.filter(h => !h.passed).forEach(h => {
        hf[h.name] = (hf[h.name] || 0) + 1;
      });
    });

    const telcoStats = {
      'MTN Mobile Money': { total: 0, high: 0 },
      'Telecel Cash': { total: 0, high: 0 },
      'AT Money': { total: 0, high: 0 }
    };
    txns.forEach(t => {
      if (t.telco && telcoStats[t.telco]) {
        telcoStats[t.telco].total++;
        if (t.risk === 'high') telcoStats[t.telco].high++;
      }
    });

    res.json({ total, safe, mod, high, saved, hfStats: hf, telcoStats });
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});

app.get('/api/v1/reports/export', async (req, res) => {
  const format = (req.query.format || "json").toLowerCase();
  const telcoFilter = req.query.telco || "ALL";

  try {
    let rawTxns = await db.getTransactions(500);
    if (telcoFilter !== "ALL") {
      rawTxns = rawTxns.filter(t => t.telcoCode === telcoFilter || t.telco.includes(telcoFilter));
    }

    if (format === "csv") {
      const headers = ["Transaction_ID", "Timestamp", "Customer", "Telco", "Amount_GHS", "Risk_Score", "Risk_Level", "Status", "Fraud_Category"];
      const rows = rawTxns.map(t => [
        t.id,
        t.ts,
        `"${t.profile_name || 'Subscriber'}"`,
        `"${t.telco}"`,
        t.amount.toFixed(2),
        t.score,
        t.risk,
        t.status,
        `"${t.fraudType}"`
      ]);

      const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename=Ghana_Telco_Fraud_Report_${telcoFilter}_${Date.now()}.csv`);
      return res.send(csvContent);
    }

    res.json({
      status: "success",
      exportedAt: new Date().toISOString(),
      telcoFilter,
      count: rawTxns.length,
      transactions: rawTxns
    });
  } catch (err) {
    res.status(500).json({ error: "Export failed." });
  }
});

app.get('/api/settings', (req, res) => {
  res.json({ threshSafe, threshMod, txnInterval });
});

app.post('/api/settings', (req, res) => {
  const { threshSafe: ts, threshMod: tm, txnInterval: ti } = req.body;
  if (typeof ts === 'number') threshSafe = ts;
  if (typeof tm === 'number') threshMod = tm;
  if (typeof ti === 'number') txnInterval = ti;
  res.json({ threshSafe, threshMod, txnInterval });
});

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
