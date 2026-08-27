const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

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
  "GCB Acct #1003-XXX-01",
  "Ecobank #0038-XXX-92",
  "Unknown MoMo Wallet #0599-XXX-000",
  "Unverified Agent #0240-XXX-777"
];

// Official shortcodes recognized for Ghana Telco Mobile Money alerts
const OFFICIAL_SENDER_IDS = ["MobileMoney", "MTNMoMo", "TelecelCash", "Telecel", "VodaCash", "ATMoney", "AirtelTigo"];

// Function to analyze incoming SMS text for fraudulent fake money / cashout scams
function analyzeSmsPayload(smsText, senderId, targetTelco = "MTN") {
  const text = (smsText || "").trim();
  const sender = (senderId || "").trim();

  const hurdles = [];
  let score = 0;

  // 1. Sender ID Verification (Weight: 30)
  const isOfficialSender = OFFICIAL_SENDER_IDS.some(s => sender.toLowerCase() === s.toLowerCase());
  const isPhoneNumber = /^(\+?233|0)[25][0-9]{8}$/.test(sender.replace(/[\s-]/g, ''));
  let senderPassed = isOfficialSender;
  if (!senderPassed) {
    score += 30;
  }
  hurdles.push({
    name: "Official Sender ID",
    passed: senderPassed,
    weight: 30,
    details: senderPassed ? `Verified shortcode (${sender})` : `Unverified / Personal Sender (${sender || 'Unknown'})`
  });

  // 2. Transaction Reference Existence Check (Weight: 25)
  // Extract patterns like TXN/REF/Id numbers or check if text claims payment received
  const refMatch = text.match(/(?:Txn ID|Ref|Reference|Transaction ID|ID)[:\s]+([A-Z0-9]{8,18})/i);
  const extractedRef = refMatch ? refMatch[1] : null;
  const matchInLedger = extractedRef ? transactions.some(t => t.id.includes(extractedRef) || extractedRef.includes(t.id)) : false;

  // If the SMS claims funds were credited but no ledger match exists
  const claimsCredit = /received|credited|sent you|cash-in|deposit|payment of/i.test(text);
  let ledgerPassed = !claimsCredit || matchInLedger;
  if (!ledgerPassed) {
    score += 25;
  }
  hurdles.push({
    name: "Ledger Transaction Match",
    passed: ledgerPassed,
    weight: 25,
    details: ledgerPassed ? "Matches official telecom transaction log" : "No matching credit record found in telecom database (Fake SMS Credit Alert)"
  });

  // 3. Fake Alert / Urgency Keywords Trigger (Weight: 20)
  const suspiciousKeywords = [
    /wrongly sent/i, /send it back/i, /call this number/i, /kindly refund/i,
    /approved your loan/i, /dial \*170\*/i, /enter pin/i, /agent commission/i,
    /congratulations/i, /won/i, /overpaid/i, /call 0[25][0-9]{8}/i
  ];
  const foundKeywords = suspiciousKeywords.filter(re => re.test(text)).map(re => re.source.replace(/\\/g, ''));
  let keywordPassed = foundKeywords.length === 0;
  if (!keywordPassed) {
    score += Math.min(20, foundKeywords.length * 10);
  }
  hurdles.push({
    name: "Scam Keyword Analysis",
    passed: keywordPassed,
    weight: 20,
    details: keywordPassed ? "No social engineering triggers detected" : `Suspicious scam triggers detected: [${foundKeywords.join(', ')}]`
  });

  // 4. SMS Structure & Syntax Integrity (Weight: 15)
  // Official alerts have standard formatting e.g. "Payment received for GHS X.XX from Y. Current balance: GHS Z.XX"
  const hasStandardFormat = /balance|bal:|ghs|ghc|current balance|available balance/i.test(text);
  let syntaxPassed = hasStandardFormat || !claimsCredit;
  if (!syntaxPassed) {
    score += 15;
  }
  hurdles.push({
    name: "SMS Syntax Integrity",
    passed: syntaxPassed,
    weight: 15,
    details: syntaxPassed ? "Standard mobile money SMS syntax" : "Non-standard format lacking official balance update or telecom footer"
  });

  // 5. Telecommunication Network Match (Weight: 10)
  const telcoObj = TELCOS.find(t => t.id === targetTelco) || TELCOS[0];
  let telcoPassed = true;
  if (claimsCredit) {
    const textLower = text.toLowerCase();
    if (targetTelco === 'MTN' && (textLower.includes('telecel') || textLower.includes('at money'))) telcoPassed = false;
    if (targetTelco === 'TELECEL' && (textLower.includes('momo') || textLower.includes('at money'))) telcoPassed = false;
    if (targetTelco === 'AT' && (textLower.includes('momo') || textLower.includes('telecel'))) telcoPassed = false;
  }
  if (!telcoPassed) {
    score += 10;
  }
  hurdles.push({
    name: "Telco Network Alignment",
    passed: telcoPassed,
    weight: 10,
    details: telcoPassed ? `Aligned with ${telcoObj.name}` : `Mismatched telecom network header for ${telcoObj.name}`
  });

  const riskLevel = score <= 30 ? 'safe' : score <= 65 ? 'moderate' : 'high';
  const isFakeSms = !senderPassed || !ledgerPassed || score > 50;

  return {
    score,
    riskLevel,
    isFakeSms,
    extractedRef,
    senderId: sender || "Unknown",
    targetTelco: telcoObj.name,
    hurdles,
    recommendation: isFakeSms
      ? "🚨 HIGH RISK (FAKE SMS SCAM): Do NOT send money or refund. Verify your account balance via official USSD menu (*170#, *110#, or *110#)."
      : riskLevel === 'moderate'
      ? "⚠ MODERATE RISK: Verify transaction in your official mobile app or USSD before taking action."
      : "✅ LEGITIMATE SMS ALERT: Matches standard official telecom transaction indicators."
  };
}

let transactions = [];
let investigations = [];
let running = false;
let engineInterval = null;
let txnInterval = 2800;
let threshSafe = 40, threshMod = 70;

function rand(a,b){return Math.floor(Math.random()*(b-a+1))+a;}
function uid(){return 'TXN-PFIS-'+Date.now().toString(36).toUpperCase();}
function caseId(){return 'CASE-PFIS-'+Date.now().toString(36).toUpperCase();}

function createTxn(){
  const profile = PROFILES[rand(0,PROFILES.length-1)];
  const telco = TELCOS[rand(0, TELCOS.length - 1)];
  const hour = new Date().getHours();

  // Fraud vectors including Telecom specific ones (Fake Credit SMS, Cashout Fraud, SIM Swap)
  const isFakeSmsFraud = Math.random() > 0.8;
  const isSimSwapFraud = Math.random() > 0.82;

  const unusual = {
    device: Math.random()>0.65,
    hour: hour<profile.hours[0]||hour>profile.hours[1]||Math.random()>0.7,
    amount: Math.random()>0.6,
    location: Math.random()>0.75,
    recipient: Math.random()>0.72,
    sim: isSimSwapFraud || Math.random()>0.85,
    fakeSms: isFakeSmsFraud
  };

  const amount = unusual.amount ? profile.avg*rand(4,9) : profile.avg*(rand(70,130)/100);
  const device = unusual.device ? DEVICES[rand(6,8)] : profile.device;
  const location = unusual.location ? LOCATIONS[rand(8,9)] : LOCATIONS[rand(0,5)];
  const recipient = unusual.recipient ? RECIPIENTS[rand(5,7)] : RECIPIENTS[rand(0,4)];

  const hurdles = [
    {name:"Device Identity",passed:!unusual.device,weight:20},
    {name:"Amount vs Baseline",passed:!unusual.amount,weight:25},
    {name:"Transaction Timing",passed:!unusual.hour,weight:15},
    {name:"Known Location",passed:!unusual.location,weight:15},
    {name:"Known Recipient",passed:!unusual.recipient,weight:15},
    {name:"SIM Integrity (Swap Alert)",passed:!unusual.sim,weight:10},
    {name:"Fake Credit SMS Verification",passed:!unusual.fakeSms,weight:25}
  ];

  const score = Math.min(100, hurdles.reduce((a,h)=>a+(h.passed?0:h.weight),0));
  const risk = score<=threshSafe?'safe':score<=threshMod?'moderate':'high';
  const status = risk==='high'?'blocked':risk==='moderate'?'monitoring':'approved';

  const fraudType = unusual.fakeSms ? "Fake Credit SMS Scam"
                  : unusual.sim ? "SIM Swap Fraud"
                  : unusual.amount ? "Unusual Cashout Amount"
                  : unusual.device ? "Unrecognized Device"
                  : "Behavioral Anomaly";

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
    hurdles,
    score,
    risk,
    status,
    confirmed: null,
    failedHurdles: hurdles.filter(h=>!h.passed).map(h=>h.name)
  };

  transactions.unshift(txn);
  if(transactions.length>500) transactions.pop();

  if(risk==='high'){
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
}

function startEngine(){
  if(running) return;
  running=true;
  createTxn();
  engineInterval = setInterval(createTxn, txnInterval);
}

// automatically start simulation when server boots
startEngine();

// API endpoints
app.use(express.json());

// Endpoint to analyze fake SMS / cashout fraud
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
  res.json({ threshSafe, threshMod, txnInterval });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});