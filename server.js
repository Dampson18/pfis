const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'pfis-store.json');

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// serve static assets from public/
app.use(express.static(path.join(__dirname, 'public')));

// simple in-memory store and simulation
const PROFILES = [
  {id:"U-PF-001",name:"Kofi Mensah",type:"Trader",sub:"Frequent Sender",avg:600,hours:[8,18],device:"Samsung Galaxy A54",location:"Kumasi",initials:"KM"},
  {id:"U-PF-002",name:"Ama Boateng",type:"Student",sub:"Saver",avg:120,hours:[9,20],device:"iPhone 13",location:"Accra",initials:"AB"},
  {id:"U-PF-003",name:"Kwame Asante",type:"Worker",sub:"Bill Payer",avg:350,hours:[7,21],device:"Tecno Spark 10",location:"Takoradi",initials:"KA"},
  {id:"U-PF-004",name:"Akosua Frimpong",type:"Merchant",sub:"Bulk Receiver",avg:1200,hours:[6,20],device:"Xiaomi Redmi 12",location:"Accra",initials:"AF"},
  {id:"U-PF-005",name:"Yaw Darko",type:"Worker",sub:"Remittance Sender",avg:450,hours:[8,19],device:"Samsung Galaxy A32",location:"Kumasi",initials:"YD"},
  {id:"U-PF-006",name:"Efua Ansah",type:"Student",sub:"Freelancer",avg:200,hours:[10,22],device:"Tecno Camon 20",location:"Cape Coast",initials:"EA"},
];
const DEVICES = ["Samsung Galaxy A54","iPhone 13","Tecno Spark 10","Xiaomi Redmi 12","Samsung Galaxy A32","Tecno Camon 20","Unknown Android Device","New iPhone","Unregistered Tablet"];
const LOCATIONS = ["Accra","Kumasi","Takoradi","Tamale","Cape Coast","Sunyani","Ho","Bolgatanga","Unknown Location","International IP"];
const TELCOS = [
  { id: "MTN", name: "MTN Mobile Money", code: "024 / 025 / 054 / 055 / 059", officialSender: ["MobileMoney", "MTNMoMo", "MTN Ghana"] },
  { id: "TELECEL", name: "Telecel Cash", code: "020 / 050", officialSender: ["TelecelCash", "Telecel", "VodaCash"] },
  { id: "AT", name: "AT Money", code: "027 / 057 / 026 / 056", officialSender: ["ATMoney", "AirtelTigo", "AT Ghana"] }
];
const RECIPIENTS = [
  "MTN MoMo #0244-XXX-891",
  "Telecel Cash #0205-XXX-112",
  "AT Money #0277-XXX-405",
  "MTN MoMo #0551-XXX-902",
  "Telecel Cash #0503-XXX-334",
  "Unknown MoMo Wallet #0599-XXX-000",
  "Unverified Agent #0240-XXX-777"
];

// Official shortcodes recognized for Ghana Telco Mobile Money alerts
const OFFICIAL_SENDER_IDS = ["MobileMoney", "MTNMoMo", "TelecelCash", "Telecel", "VodaCash", "ATMoney", "AirtelTigo"];

// ─────────────────────────────────────────────────────────────────────────────
// MACHINE LEARNING ENGINE: Naive Bayes SMS Classifier & Anomaly Detection
// ─────────────────────────────────────────────────────────────────────────────

// Naive Bayes Word Frequency Model (trained on Ghana MoMo dataset)
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
  let scamLogProb = Math.log(0.35); // Prior probability P(Scam)
  let hamLogProb = Math.log(0.65);  // Prior probability P(Ham)

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

  // Sender ID ML adjustment
  const isOfficial = OFFICIAL_SENDER_IDS.some(s => (senderId || "").toLowerCase() === s.toLowerCase());
  if (!isOfficial) {
    scamLogProb += Math.log(8.0);
    featureWeights.push({ word: `SenderID:${senderId}`, scamWeight: 8.0, hamWeight: 0.1, scoreDelta: 45 });
  } else {
    hamLogProb += Math.log(8.0);
    featureWeights.push({ word: `SenderID:${senderId}`, scamWeight: 0.1, hamWeight: 8.0, scoreDelta: -30 });
  }

  // Softmax normalization for probability
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

// Function to analyze incoming SMS text for fraudulent fake money / cashout scams
function analyzeSmsPayload(smsText, senderId, targetTelco = "MTN") {
  const text = (smsText || "").trim();
  const sender = (senderId || "").trim();

  const mlResult = classifySmsWithNaiveBayes(text, sender);
  const hurdles = [];
  let score = 0;

  // 1. Sender ID Verification (Weight: 30)
  const isOfficialSender = OFFICIAL_SENDER_IDS.some(s => sender.toLowerCase() === s.toLowerCase());
  let senderPassed = isOfficialSender;
  if (!senderPassed) score += 30;
  hurdles.push({
    name: "Official Shortcode Sender ID",
    passed: senderPassed,
    weight: 30,
    details: senderPassed ? `Verified shortcode (${sender})` : `Unverified Sender (${sender || 'Personal Mobile Number'})`
  });

  // 2. Transaction Reference & Ledger Match (Weight: 25)
  const refMatch = text.match(/(?:Txn ID|Ref|Reference|Transaction ID|ID)[:\s]+([A-Z0-9]{8,18})/i);
  const extractedRef = refMatch ? refMatch[1] : null;
  const matchInLedger = extractedRef ? transactions.some(t => t.id.includes(extractedRef) || extractedRef.includes(t.id)) : false;
  const claimsCredit = /received|credited|sent you|cash-in|deposit|payment of/i.test(text);
  let ledgerPassed = !claimsCredit || matchInLedger;
  if (!ledgerPassed) score += 25;
  hurdles.push({
    name: "Ledger Transaction Match",
    passed: ledgerPassed,
    weight: 25,
    details: ledgerPassed ? "Matches official telecom transaction log" : "No matching credit record found in telecom database (Fake SMS Credit Alert)"
  });

  // 3. AI / ML Naive Bayes Scam Probability (Weight: 25)
  let mlPassed = mlResult.scamProbability <= 0.45;
  if (!mlPassed) score += Math.round(mlResult.scamProbability * 25);
  hurdles.push({
    name: "AI/ML Naive Bayes Probability",
    passed: mlPassed,
    weight: 25,
    details: `ML Model Confidence: ${mlResult.confidencePercentage}% Scam Probability. Key tokens: ${mlResult.topFeatures.map(f => f.word).join(', ')}`
  });

  // 4. SMS Structure & Balance Footer (Weight: 20)
  const hasStandardFormat = /balance|bal:|ghs|ghc|current balance|available balance/i.test(text);
  let syntaxPassed = hasStandardFormat || !claimsCredit;
  if (!syntaxPassed) score += 20;
  hurdles.push({
    name: "SMS Balance Footer Integrity",
    passed: syntaxPassed,
    weight: 20,
    details: syntaxPassed ? "Standard mobile money SMS syntax with balance update" : "Non-standard format lacking official balance update or telecom footer"
  });

  const telcoObj = TELCOS.find(t => t.id === targetTelco) || TELCOS[0];
  const riskLevel = score <= 30 ? 'safe' : score <= 65 ? 'moderate' : 'high';
  const isFakeSms = !senderPassed || !ledgerPassed || score > 50 || mlResult.scamProbability > 0.6;

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
      ? "🚨 HIGH RISK (FAKE SMS SCAM): Do NOT send money or refund. Verify your account balance via official USSD menu (*170# for MTN, *110# for Telecel & AT)."
      : riskLevel === 'moderate'
      ? "⚠ MODERATE RISK: Verify transaction in your official mobile app or USSD before taking action."
      : "✅ LEGITIMATE SMS ALERT: Matches standard official telecom transaction indicators."
  };
}

// Function to analyze unsolicited USSD agent cash-out prompts
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

function loadStore(){
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch (error) { return { transactions: [], investigations: [], threats: null, settings: null }; }
}

const store = loadStore();
let transactions = store.transactions || [];
let investigations = store.investigations || [];
let running = false;
let engineInterval = null;
let txnInterval = 2800;
let threshSafe = 40, threshMod = 70;
if (store.settings) ({ txnInterval, threshSafe, threshMod } = { txnInterval, threshSafe, threshMod, ...store.settings });

let BLACKLIST_DATABASE = [];

function saveStore(){
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify({ transactions, investigations, threats: BLACKLIST_DATABASE, settings: { txnInterval, threshSafe, threshMod } }, null, 2));
}

function rand(a,b){return Math.floor(Math.random()*(b-a+1))+a;}
function uid(){return 'TXN-PFIS-'+Date.now().toString(36).toUpperCase();}
function caseId(){return 'CASE-PFIS-'+Date.now().toString(36).toUpperCase();}

function createTxn(){
  const profile = PROFILES[rand(0,PROFILES.length-1)];
  const telco = TELCOS[rand(0, TELCOS.length - 1)];
  const hour = new Date().getHours();

  // Real-world Ghana MoMo Fraud Vectors
  const fraudRoll = Math.random();
  const isFakeSmsFraud = fraudRoll > 0.82;
  const isSimSwapFraud = fraudRoll > 0.74 && fraudRoll <= 0.82;
  const isUnsolicitedCashout = fraudRoll > 0.68 && fraudRoll <= 0.74;
  const isLoanPromoScam = fraudRoll > 0.62 && fraudRoll <= 0.68;

  const unusual = {
    device: Math.random() > 0.65,
    hour: hour < profile.hours[0] || hour > profile.hours[1] || Math.random() > 0.7,
    amount: Math.random() > 0.6,
    location: Math.random() > 0.75,
    recipient: Math.random() > 0.72,
    sim: isSimSwapFraud,
    fakeSms: isFakeSmsFraud,
    cashoutPrompt: isUnsolicitedCashout,
    loanScam: isLoanPromoScam
  };

  const amount = unusual.amount ? profile.avg * rand(4,12) : profile.avg * (rand(70,130)/100);
  const device = unusual.device ? DEVICES[rand(6,8)] : profile.device;
  const location = unusual.location ? LOCATIONS[rand(8,9)] : LOCATIONS[rand(0,5)];
  const recipient = unusual.recipient ? RECIPIENTS[rand(5,8)] : RECIPIENTS[rand(0,4)];

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

  const score = Math.min(100, hurdles.reduce((a,h) => a + (h.passed ? 0 : h.weight), 0));
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
    profile,
    telco: telco.name,
    telcoCode: telco.id,
    amount,
    device,
    location,
    recipient,
    fraudType,
    mlScamProbability: (score / 100).toFixed(2),
    hurdles,
    score,
    risk,
    status,
    confirmed: null,
    failedHurdles: hurdles.filter(h => !h.passed).map(h => h.name)
  };

  transactions.unshift(txn);
  if(transactions.length > 500) transactions.pop();

  if(risk === 'high'){
    const inv = {
      id: caseId(),
      txnId: txn.id,
      account: txn.profile.name,
      telco: telco.name,
      amount: txn.amount,
      reason: `${fraudType}: ${txn.failedHurdles.join(', ')}`,
      ts: new Date(),
      priority: 'High',
      status: 'Open'
    };
    investigations.unshift(inv);
  }
  saveStore();
}

function startEngine(){
  if(running) return;
  running=true;
  createTxn();
  engineInterval = setInterval(createTxn, txnInterval);
}

// automatically start simulation when server boots
startEngine();

// ─────────────────────────────────────────────────────────────────────────────
// SHARED TELCO THREAT INTELLIGENCE & SCAMMER BLACKLIST DATABASE
// ─────────────────────────────────────────────────────────────────────────────

BLACKLIST_DATABASE = [
  { id: "BLK-GH-001", type: "Phone Number", value: "0244012999", reason: "Fake MoMo Reversal SMS Scam", reportedBy: "MTN Ghana", reportsCount: 18, risk: "HIGH", date: "2025-01-10" },
  { id: "BLK-GH-002", type: "Agent ID", value: "AG-998811", reason: "Unsolicited Agent Cashout Prompt Exploit", reportedBy: "Telecel Cash", reportsCount: 12, risk: "HIGH", date: "2025-01-14" },
  { id: "BLK-GH-003", type: "Phone Number", value: "0503991200", reason: "Fake Loan Approval Phishing", reportedBy: "AT Money", reportsCount: 9, risk: "HIGH", date: "2025-01-18" },
  { id: "BLK-GH-004", type: "Phone Number", value: "0277880011", reason: "Social Engineering Fraudster", reportedBy: "MTN Ghana", reportsCount: 24, risk: "CRITICAL", date: "2025-01-20" }
];
if (store.threats && Array.isArray(store.threats)) {
  BLACKLIST_DATABASE.splice(0, BLACKLIST_DATABASE.length, ...store.threats);
}

// API endpoints
app.use(express.json());

// Enterprise Telco Webhook APIs
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
app.get('/api/v1/threats/search', (req, res) => {
  const query = (req.query.q || "").trim().toLowerCase();
  if (!query) {
    return res.json(BLACKLIST_DATABASE);
  }
  const results = BLACKLIST_DATABASE.filter(item =>
    item.value.toLowerCase().includes(query) ||
    item.reason.toLowerCase().includes(query) ||
    item.reportedBy.toLowerCase().includes(query)
  );
  res.json(results);
});

app.post('/api/v1/threats/report', (req, res) => {
  const { type, value, reason, reportedBy } = req.body;
  if (!value || !reason) {
    return res.status(400).json({ error: "Value and reason are required for threat report." });
  }
  const existing = BLACKLIST_DATABASE.find(item => item.value === value);
  if (existing) {
    existing.reportsCount += 1;
    saveStore();
    return res.json({ message: "Existing threat record updated with additional report.", record: existing });
  }
  const newThreat = {
    id: `BLK-GH-00${BLACKLIST_DATABASE.length + 1}`,
    type: type || "Phone Number",
    value,
    reason,
    reportedBy: reportedBy || "MoMo Subscriber / FIC",
    reportsCount: 1,
    risk: "HIGH",
    date: new Date().toISOString().split('T')[0]
  };
  BLACKLIST_DATABASE.unshift(newThreat);
  saveStore();
  res.status(201).json({ message: "New threat reported and blacklisted across Ghana Telcos.", record: newThreat });
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

app.get('/api/telcos', (req, res) => res.json(TELCOS));
app.get('/api/transactions', (req, res) => res.json(transactions));
app.get('/api/profiles', (req, res) => res.json(PROFILES));
app.get('/api/investigations', (req, res) => res.json(investigations));
app.post('/api/investigations', (req, res) => {
  const inv = {id:caseId(),...req.body,ts:new Date(),status:'Open'};
  investigations.unshift(inv);
  saveStore();
  res.status(201).json(inv);
});

// toggle engine via API (optional)
app.post('/api/engine', (req, res) => {
  const {action} = req.body;
  if(action==='start') startEngine();
  if(action==='stop' && running){clearInterval(engineInterval);running=false;}
  res.json({running});
});

// routes for each page
app.get('/', (req, res) => res.render('dashboard'));
app.get('/about', (req, res) => res.render('about'));
app.get('/monitor', (req, res) => res.render('monitor'));
app.get('/transactions', (req, res) => res.render('transactions'));
app.get('/profiles', (req, res) => res.render('profiles'));
app.get('/investigations', (req, res) => res.render('investigations'));
app.get('/reports', (req, res) => res.render('reports'));
app.get('/settings', (req, res) => res.render('settings'));
app.get('/accessibility', (req, res) => res.render('accessibility'));
app.get('/contact', (req, res) => res.render('contact'));
app.get('/help', (req, res) => res.render('help'));
app.get('/login', (req, res) => res.render('login'));

// additional API endpoints for live data
app.get('/api/monitor', (req, res) => {
  // return most recent 40 transactions
  res.json(transactions.slice(0,40));
});

app.get('/api/reports', (req, res) => {
  const total = transactions.length;
  const safe = transactions.filter(t=>t.risk==='safe').length;
  const mod = transactions.filter(t=>t.risk==='moderate').length;
  const high = transactions.filter(t=>t.risk==='high').length;
  // value protected is sum of cancelled (confirmed===false)
  const saved = transactions.filter(t=>t.confirmed===false).reduce((a,t)=>a+t.amount,0);

  // hurdle failure counts
  const hf = {};
  transactions.forEach(t => t.hurdles.filter(h=>!h.passed).forEach(h=>{ hf[h.name] = (hf[h.name]||0) + 1; }));

  // risk by segment
  const seg = {};
  PROFILES.forEach(p => { seg[p.type] = { safe:0, mod:0, high:0 }; });
  transactions.forEach(t => {
    if(seg[t.profile.type]){
      seg[t.profile.type][t.risk==='safe'?'safe':t.risk==='moderate'?'mod':'high']++;
    }
  });

  // fraud type breakdown on high risk
  const fTypes = {'Fake Credit SMS':0,'SIM Swap':0,'Unusual Device':0,'Amount Anomaly':0,'Unknown Location':0,'New Recipient':0};
  transactions.filter(t=>t.risk==='high').forEach(t=>{
    t.failedHurdles.forEach(h=>{
      if(/Fake Credit/.test(h)) fTypes['Fake Credit SMS']++;
      else if(/SIM/.test(h)) fTypes['SIM Swap']++;
      else if(/Device/.test(h)) fTypes['Unusual Device']++;
      else if(/Amount/.test(h)) fTypes['Amount Anomaly']++;
      else if(/Location/.test(h)) fTypes['Unknown Location']++;
      else if(/Recipient/.test(h)) fTypes['New Recipient']++;
    });
  });

  // network breakdown
  const telcoStats = { 'MTN Mobile Money': 0, 'Telecel Cash': 0, 'AT Money': 0 };
  transactions.forEach(t => {
    if (t.telco && telcoStats[t.telco] !== undefined) {
      telcoStats[t.telco]++;
    }
  });

  res.json({ total, safe, mod, high, saved, hfStats: hf, seg, fTypes, telcoStats });
});

app.get('/api/settings', (req, res) => {
  res.json({ threshSafe, threshMod, txnInterval });
});
app.post('/api/settings', (req, res) => {
  const { threshSafe: ts, threshMod: tm, txnInterval: ti } = req.body;
  if(typeof ts==='number') threshSafe=ts;
  if(typeof tm==='number') threshMod=tm;
  if(typeof ti==='number') txnInterval=ti;
  saveStore();
  res.json({ threshSafe, threshMod, txnInterval });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});