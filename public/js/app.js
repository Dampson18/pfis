// log helper that appends to activity log
function addLog(msg){
  const tbody=document.getElementById('activityLog');
  if(tbody){
    const tr=document.createElement('tr');
    tr.innerHTML=`<td style="font-size:11px;"><span style="color:var(--gov-muted);font-family:monospace;">[${fmtTime(new Date())}]</span> ${msg}</td>`;
    tbody.insertBefore(tr,tbody.firstChild);
    while(tbody.children.length>50) tbody.removeChild(tbody.lastChild);
  }
  console.log('[LOG]', msg);
}

// ─── DATA ───────────────────────────────────────────────────────────────────
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
const RECIPIENTS = ["MTN MoMo #0244-XXX","Vodafone Cash #0205-XXX","AirtelTigo #0277-XXX","GCB Acct #1003-XXX","Ecobank #0038-XXX","New Recipient","Unknown Account","International Wire"];

let transactions = [], investigations = [], running = false, engineInterval = null;
let txnInterval = 2800;
let threshSafe = 40, threshMod = 70;
let monFilter = 'all', typeFilter = 'all', telcoFilter = 'all';

// --- SMS Fake Alert & Telecom Fraud Checker ---
function checkSmsScam() {
  const telco = document.getElementById('smsTelcoSelect')?.value || 'MTN';
  const senderId = document.getElementById('smsSenderInput')?.value || '';
  const smsText = document.getElementById('smsTextInput')?.value || '';

  if (!smsText.trim()) {
    alert('Please enter or paste an SMS message to analyze.');
    return;
  }

  const resPlaceholder = document.getElementById('smsResultPlaceholder');
  const resDetails = document.getElementById('smsResultDetails');
  if (resPlaceholder) resPlaceholder.style.display = 'none';
  if (resDetails) {
    resDetails.style.display = 'block';
    resDetails.innerHTML = `<div style="text-align:center;padding:20px;color:var(--gov-navy);">⌛ Analyzing SMS text against ${telco} mobile money fraud database...</div>`;
  }

  fetch('/api/analyze-sms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ smsText, senderId, telco })
  })
  .then(res => res.json())
  .then(data => {
    if (!resDetails) return;
    const badgeBg = data.isFakeSms ? 'var(--danger-bg)' : data.riskLevel === 'moderate' ? 'var(--warn-bg)' : 'var(--safe-bg)';
    const badgeColor = data.isFakeSms ? 'var(--danger-red)' : data.riskLevel === 'moderate' ? 'var(--warn-amber)' : 'var(--safe-green)';
    const riskLabel = data.isFakeSms ? 'FAKE SMS FRAUD DETECTED' : data.riskLevel === 'moderate' ? 'MODERATE RISK' : 'AUTHENTIC TRANSACTION SMS';

    let hurdlesHtml = data.hurdles.map(h => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;background:#fff;border:1px solid #e2e8f0;border-radius:2px;margin-bottom:4px;font-size:12px;">
        <div>
          <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${h.passed ? '#22C55E' : 'var(--danger-red)'};margin-right:6px;"></span>
          <strong>${h.name}</strong>
          <div style="font-size:11px;color:var(--gov-muted);">${h.details}</div>
        </div>
        <span style="font-weight:700;font-size:11px;color:${h.passed ? 'var(--safe-green)' : 'var(--danger-red)'};">${h.passed ? 'PASS' : `+${h.weight} RISK PTS`}</span>
      </div>
    `).join('');

    resDetails.innerHTML = `
      <div style="background:${badgeBg};border:1px solid ${badgeColor};padding:12px;border-radius:2px;margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <span style="font-weight:700;color:${badgeColor};font-size:14px;">${riskLabel}</span>
          <span class="badge" style="background:${badgeColor};color:#fff;font-size:12px;">Risk Score: ${data.score}/100</span>
        </div>
        <div style="font-size:12px;color:#2d3748;line-height:1.4;">${data.recommendation}</div>
      </div>
      <div style="font-size:12px;font-weight:700;color:var(--gov-navy);margin-bottom:6px;">Hurdle Inspection Breakdown:</div>
      ${hurdlesHtml}
    `;
    addLog(`📱 SMS Fraud Check executed (${data.targetTelco}): Sender ID "${data.senderId}", Risk Score ${data.score}/100`);
  })
  .catch(err => {
    if (resDetails) resDetails.innerHTML = `<div style="color:var(--danger-red);">Error analyzing SMS: ${err.message}</div>`;
  });
}

function loadSampleScamSms() {
  const telcoSelect = document.getElementById('smsTelcoSelect');
  const senderInput = document.getElementById('smsSenderInput');
  const textInput = document.getElementById('smsTextInput');
  if (telcoSelect) telcoSelect.value = 'MTN';
  if (senderInput) senderInput.value = '0244012999';
  if (textInput) textInput.value = 'Payment received for GHS 850.00 from Kwame Mensah. I wrongly sent it to your MTN MoMo. Kindly send it back to 0244012999 immediately or call 0244012999.';
}

function loadSampleLegitSms() {
  const telcoSelect = document.getElementById('smsTelcoSelect');
  const senderInput = document.getElementById('smsSenderInput');
  const textInput = document.getElementById('smsTextInput');
  if (telcoSelect) telcoSelect.value = 'MTN';
  if (senderInput) senderInput.value = 'MobileMoney';
  if (textInput) textInput.value = 'Payment received for GHS 450.00 from Ama Boateng. Current balance: GHS 1250.00. Available balance: GHS 1250.00. Reference: TXN-PFIS-MOMO99.';
}

// --- Threat Intelligence Blacklist Handlers ---
function searchBlacklist() {
  const query = document.getElementById('blacklistSearchInput')?.value || '';
  const tbody = document.getElementById('blacklistTableBody');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:12px;">⌛ Searching threat database...</td></tr>';

  fetch(`/api/v1/threats/search?q=${encodeURIComponent(query)}`)
    .then(r => r.json())
    .then(data => {
      if (!data || !data.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:12px;color:var(--gov-muted);">No threat records found matching your query.</td></tr>';
        return;
      }
      tbody.innerHTML = data.map(item => `
        <tr>
          <td style="font-family:monospace;font-weight:700;">${item.value}</td>
          <td><span class="badge badge-navy" style="font-size:10px;">${item.type}</span></td>
          <td style="font-size:11px;">${item.reason}</td>
          <td style="font-size:11px;">${item.reportedBy}</td>
          <td style="font-weight:700;color:var(--danger-red);">${item.reportsCount}</td>
          <td><span class="badge badge-high">${item.risk}</span></td>
        </tr>
      `).join('');
    })
    .catch(err => {
      tbody.innerHTML = `<tr><td colspan="6" style="color:var(--danger-red);text-align:center;">Error searching threats: ${err.message}</td></tr>`;
    });
}

function reportScammer() {
  const value = document.getElementById('reportValue')?.value;
  const reason = document.getElementById('reportReason')?.value;
  if (!value || !value.trim()) {
    alert('Please enter a phone number or agent ID to report.');
    return;
  }

  fetch('/api/v1/threats/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: value.trim(), reason, reportedBy: "Operator / MoMo Subscriber" })
  })
  .then(r => r.json())
  .then(data => {
    alert(data.message || 'Scammer reported and blacklisted across Ghana Telcos.');
    if (document.getElementById('reportValue')) document.getElementById('reportValue').value = '';
    searchBlacklist();
  })
  .catch(err => alert('Failed to submit report: ' + err.message));
}

// --- Case Filing Handlers ---
function openReportModal() {
  const modal = document.getElementById('reportModal');
  if (modal) modal.classList.add('open');
}

function submitCase() {
  const caseRef = document.getElementById('caseRef')?.value || 'MANUAL-ENTRY';
  const caseType = document.getElementById('caseType')?.value || 'Fake Credit SMS Reversal Scam';
  const casePriority = document.getElementById('casePriority')?.value || 'High';
  const caseDesc = document.getElementById('caseDesc')?.value || 'Reported suspicious activity';

  fetch('/api/investigations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      txnId: caseRef,
      account: 'Investigated MoMo Account',
      amount: 0,
      reason: `${caseType}: ${caseDesc}`,
      priority: casePriority
    })
  })
  .then(r => r.json())
  .then(inv => {
    addLog(`📁 Investigation Case Created: ${inv.id}`);
    closeModal('reportModal');
    alert(`Case ${inv.id} filed successfully with Financial Intelligence Centre.`);
    if (window.location.pathname === '/investigations') {
      fetch('/api/investigations').then(r => r.json()).then(renderInvestPage);
    }
  });
}

function rand(a,b){return Math.floor(Math.random()*(b-a+1))+a;}
function fmt(n){return '₵'+Number(n).toLocaleString('en-GH',{minimumFractionDigits:2,maximumFractionDigits:2});}
function fmtTime(d){return d.toLocaleTimeString('en-GH',{hour:'2-digit',minute:'2-digit',second:'2-digit'});}
function fmtDate(d){return d.toLocaleDateString('en-GH',{day:'2-digit',month:'short',year:'numeric'})+' '+fmtTime(d);}
function uid(){return 'TXN-PFIS-'+Date.now().toString(36).toUpperCase();}
function caseId(){return 'CASE-PFIS-'+Date.now().toString(36).toUpperCase();}

// navigation is now handled by separate pages; showPage is retained for any dynamic behaviour
function showPage(id){ /* noop when using full pages */ }

// ─── ENGINE ─────────────────────────────────────────────────────────────────
function toggleEngine(){
  if(running){
    clearInterval(engineInterval);
    running=false;
    document.getElementById('engineBtn').textContent='▶ Activate Engine';
    document.getElementById('engineBtn').classList.remove('stop');
    document.getElementById('statusDot').classList.remove('active');
    document.getElementById('statusText').textContent='Engine Offline';
    addLog('Engine deactivated by operator.');
  } else {
    running=true;
    document.getElementById('engineBtn').textContent='■ Deactivate';
    document.getElementById('engineBtn').classList.add('stop');
    document.getElementById('statusDot').classList.add('active');
    document.getElementById('statusText').textContent='Engine Active';
    document.getElementById('engineNotice') && (document.getElementById('engineNotice').style.display='none');
    addLog('Engine activated. Monitoring '+PROFILES.length+' user profiles across all channels.');
    processTxn();
    engineInterval = setInterval(processTxn, txnInterval);
  }
}

// ---------- helper renderers ----------
function txnRow(t,short=false){
  const riskBadge=`<span class="badge badge-${t.risk}">${t.risk.toUpperCase()}</span>`;
  const statusBadge=t.status==='approved'?'<span class="badge badge-safe">Approved</span>':
    t.status==='blocked'?'<span class="badge badge-high">Blocked</span>':
    t.status==='monitoring'?'<span class="badge badge-moderate">Monitoring</span>':
    '<span class="badge" style="background:#742A2A;color:#fff;">Cancelled</span>';
  const telcoBadge = `<span class="badge badge-navy" style="font-size:10px;">${t.telco || 'MTN Mobile Money'}</span>`;
  const action=`<button class="btn btn-outline btn-sm" onclick="openTxnModal('${t.id}')">View Detail</button>`;
  const dateStr = t.ts ? new Date(t.ts).toLocaleTimeString('en-GH', {hour:'2-digit', minute:'2-digit', second:'2-digit'}) : 'Just now';

  if(short){
    return `<tr>
      <td style="font-size:11px;font-family:monospace;">${t.id}</td>
      <td>${telcoBadge}</td>
      <td>${t.profile ? t.profile.name : 'Unknown'}</td>
      <td>${fmt(t.amount)}</td>
      <td><strong style="color:var(--danger-red);">${t.score}</strong></td>
      <td style="font-size:11px;color:var(--danger-red);font-weight:600;">${t.fraudType || t.failedHurdles.join(', ')}</td>
      <td style="font-size:11px;">${dateStr}</td>
      <td>${statusBadge}</td>
      <td>${action}</td>
    </tr>`;
  }
  return `<tr>
    <td style="font-family:monospace;font-size:11px;">${t.id}</td>
    <td>${telcoBadge}</td>
    <td>${new Date(t.ts).toLocaleString('en-GH')}</td>
    <td>${t.profile ? t.profile.name : 'Customer'}</td>
    <td>${t.profile ? t.profile.type : 'User'}</td>
    <td>${fmt(t.amount)}</td>
    <td style="font-size:11px;">${t.recipient || 'N/A'}</td>
    <td style="font-size:11px;font-weight:600;color:${t.risk==='high'?'var(--danger-red)':'var(--gov-navy)'}">${t.fraudType || 'Standard'}</td>
    <td><strong>${t.score}</strong></td>
    <td>${riskBadge}</td>
    <td>${statusBadge}</td>
    <td>${action}</td>
  </tr>`;
}

function renderDashboard(data){
  if(running){
    const notice=document.getElementById('engineNotice');
    if(notice) notice.style.display='none';
  }
  const total = data.length;
  const safe = data.filter(t=>t.risk==='safe').length;
  const mod = data.filter(t=>t.risk==='moderate').length;
  const high = data.filter(t=>t.risk==='high').length;
  const saved = data.filter(t=>t.confirmed===false).reduce((a,t)=>a+t.amount,0);

  // basic stats cards
  const stTotal = document.getElementById('st-total');
  if(stTotal) stTotal.textContent = total;
  document.getElementById('st-safe').textContent = safe;
  document.getElementById('st-mod').textContent = mod;
  document.getElementById('st-high').textContent = high;
  document.getElementById('st-saved').textContent = fmt(saved);
  document.getElementById('st-rate').textContent = total?Math.round((safe/total)*100)+'%':'—';

  // distribution bars
  if(total>0){
    const meta = document.getElementById('distMeta');
    if(meta) meta.textContent = total+' total';
    const bars = document.getElementById('distBars');
    if(bars){
      bars.innerHTML = ['safe','moderate','high'].map(r=>{
        const cnt = r==='safe'?safe:r==='moderate'?mod:high;
        const pct = Math.round((cnt/total)*100);
        const col = r==='safe'?'var(--safe-green)':r==='moderate'?'var(--warn-amber)':'var(--danger-red)';
        const lbl = r==='safe'?'Safe':r==='moderate'?'Moderate':'High Risk';
        return `<div>
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">
            <span style="color:${col};font-weight:700;">${lbl}</span><span class="text-muted">${cnt} (${pct}%)</span>
          </div>
          <div style="background:#E2E8F0;border-radius:2px;height:14px;">
            <div style="width:${pct}%;height:100%;background:${col};border-radius:2px;transition:width .4s;"></div>
          </div>
        </div>`;
      }).join('');
    }
  }

  // trend svg
  const scores = data.slice(0,20).reverse().map(t=>t.score);
  if(scores.length>1){
    const svg=document.getElementById('trendSvg');
    const w=svg.clientWidth||540,h=90,max=100;
    const pts=scores.map((s,i)=>`${(i/(scores.length-1))*w},${h-(s/max)*(h-10)+5}`).join(' ');
    svg.innerHTML=`
      <defs>
        <linearGradient id="tg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#1B2A4A" stop-opacity=".15"/>
          <stop offset="100%" stop-color="#1B2A4A" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <polygon points="${pts} ${w},${h} 0,${h}" fill="url(#tg)"/>
      <polyline points="${pts}" fill="none" stroke="var(--gov-navy)" stroke-width="2"/>
      ${scores.map((s,i)=>{
        const x=(i/(scores.length-1))*w,y=h-(s/max)*(h-10)+5;
        const col=s<=threshSafe?'var(--safe-green)':s<=threshMod?'var(--warn-amber)':'var(--danger-red)';
        return `<circle cx="${x}" cy="${y}" r="4" fill="${col}" stroke="#fff" stroke-width="1.5"/>`;
      }).join('')}
    `;
  }

  // high-risk table
  const highTxns = data.filter(t=>t.risk==='high').slice(0,8);
  const dashBody = document.getElementById('dashHighBody');
  if(dashBody){
    dashBody.innerHTML = highTxns.length?highTxns.map(t=>txnRow(t,true)).join(''):
      '<tr><td colspan="8" style="text-align:center;color:var(--gov-muted);padding:28px;">No high-risk transactions detected.</td></tr>';
  }

  // user type chart
  const typeData={};
  PROFILES.forEach(p=>{typeData[p.type]={total:0,high:0};});
  data.forEach(t=>{if(typeData[t.profile.type]){typeData[t.profile.type].total++;if(t.risk==='high')typeData[t.profile.type].high++;}});
  const typeChart = document.getElementById('userTypeChart');
  if(typeChart){
    typeChart.innerHTML = Object.entries(typeData).map(([type,d])=>{
      const pct=d.total?Math.round((d.high/d.total)*100):0;
      return `<div style="margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px;">
          <span class="fw-700">${type}</span><span class="text-muted">${d.high}/${d.total} high-risk</span>
        </div>
        <div style="background:#E2E8F0;border-radius:2px;height:10px;">
          <div style="width:${pct}%;height:100%;background:var(--danger-red);border-radius:2px;transition:width .4s;"></div>
        </div>
      </div>`;
    }).join('');
  }
}

function renderTransactionsPage(data){
  const container = document.getElementById('txnContainer');
  if(!container) return;
  if(!data.length){ container.innerHTML='<p>No transactions available.</p>'; return; }
  let rows = data.map(t=>`<tr>
      <td>${t.id}</td>
      <td>${new Date(t.ts).toLocaleString('en-GH')}</td>
      <td>${t.profile.name}</td>
      <td>${fmt(t.amount)}</td>
      <td>${t.risk.toUpperCase()}</td>
    </tr>`).join('');
  container.innerHTML = `<table class="gov-table"><thead><tr><th>Ref</th><th>Date</th><th>Customer</th><th>Amount</th><th>Risk</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderProfilesPage(data){
  const container = document.getElementById('profileContainer');
  if(!container) return;
  container.innerHTML = data.map(p=>{
    return `<div class="card"><div class="card-body"><h4>${p.name}</h4><p>${p.type} — ${p.sub}</p><p style="font-size:11px;color:#555;">${p.id}</p></div></div>`;
  }).join('');
}

function renderInvestPage(data){
  const container = document.getElementById('investContainer');
  if(!container) return;
  if(!data.length){ container.innerHTML='<p>No investigations logged.</p>'; return; }
  container.innerHTML = `<ul>${data.map(i=>`<li>${i.id} &ndash; ${i.account} &ndash; ${fmt(i.amount)} &ndash; ${i.status}</li>`).join('')}</ul>`;
}

function renderMonitorPage(data){
  const safe = data.filter(t=>t.risk==='safe').length;
  const mod = data.filter(t=>t.risk==='moderate').length;
  const high = data.filter(t=>t.risk==='high').length;
  if (document.getElementById('monC-safe')) document.getElementById('monC-safe').textContent=safe;
  if (document.getElementById('monC-mod')) document.getElementById('monC-mod').textContent=mod;
  if (document.getElementById('monC-high')) document.getElementById('monC-high').textContent=high;

  const feed = document.getElementById('monitorFeed');
  if(!feed) return;
  feed.innerHTML='';
  data.forEach(txn => {
    if ((monFilter!=='all' && txn.risk!==monFilter) ||
        (typeFilter!=='all' && txn.profile.type!==typeFilter) ||
        (telcoFilter!=='all' && txn.telcoCode!==telcoFilter)) return;

    const borderCol = txn.risk==='high'?'var(--danger-red)':txn.risk==='moderate'?'var(--warn-amber)':'var(--safe-green)';
    const bg = txn.risk==='high'?'#FFF5F5':txn.risk==='moderate'?'#FFFBEB':'#F0FFF4';
    const timeStr = txn.ts ? new Date(txn.ts).toLocaleTimeString('en-GH', {hour:'2-digit', minute:'2-digit', second:'2-digit'}) : 'Just now';

    const el = document.createElement('div');
    el.style.cssText=`background:${bg};border:1px solid var(--gov-border);border-left:4px solid ${borderCol};padding:12px 16px;margin-bottom:10px;border-radius:2px;animation:slideIn .3s ease;`;
    el.innerHTML=`
      <style>@keyframes slideIn{from{opacity:0;transform:translateY(-8px);}to{opacity:1;transform:none;}}</style>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
        <div style="flex:1;">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
            <span class="badge badge-${txn.risk}">${txn.risk.toUpperCase()} · SCORE ${txn.score}</span>
            <span class="badge badge-navy">${txn.telco || 'MTN Mobile Money'}</span>
            <span style="font-size:11px;font-family:monospace;color:var(--gov-muted);">${txn.id}</span>
            <span style="font-size:11px;color:var(--gov-muted);">${timeStr}</span>
          </div>
          <div style="font-size:14px;font-weight:600;color:var(--gov-navy);margin-bottom:4px;">${txn.profile ? txn.profile.name : 'Customer'} · ${fmt(txn.amount)} → ${txn.recipient}</div>
          <div style="font-size:12px;color:var(--gov-muted);">${txn.device} · ${txn.location} · <strong style="color:var(--gov-navy);">${txn.fraudType || 'Standard'}</strong></div>
          ${txn.failedHurdles && txn.failedHurdles.length?`<div style="font-size:11px;color:var(--danger-red);margin-top:4px;">Failed Hurdles: ${txn.failedHurdles.join(', ')}</div>`:''}
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0;">
          ${txn.risk==='high'&&txn.confirmed===null?`
            <button class="btn btn-success btn-sm" onclick="confirmTxn('${txn.id}')">Clear</button>
            <button class="btn btn-danger btn-sm" onclick="cancelTxn('${txn.id}')">Block & Escalate</button>
          `:`<button class="btn btn-outline btn-sm" onclick="openTxnModal('${txn.id}')">Detail</button>`}
        </div>
      </div>
    `;
    feed.appendChild(el);
  });
}

function setMonFilter(f,el){
  monFilter=f;
  document.querySelectorAll('.sidebar-link').forEach(a=>a.classList.remove('active'));
  el && el.classList.add('active');
}
function setTypeFilter(f,el){
  typeFilter=f;
  document.querySelectorAll('.active-type').forEach(a=>a.classList.remove('active-type'));
  el && el.classList.add('active-type');
}
function setTelcoFilter(f,el){
  telcoFilter=f;
  document.querySelectorAll('.active-telco').forEach(a=>a.classList.remove('active-telco'));
  el && el.classList.add('active-telco');
}
function clearMonitor(){
  const feed=document.getElementById('monitorFeed');
  if(feed) feed.innerHTML='';
}

// new transaction table rendering with filters & CSV export
function renderTxnTable(){
  const rf=document.getElementById('txnRiskFilter')?.value || 'all';
  const sf=document.getElementById('txnStatusFilter')?.value || 'all';
  const tf=document.getElementById('txnTelcoFilter')?.value || 'all';

  fetch('/api/transactions').then(r=>r.json()).then(data=>{
    let filtered=data.filter(t =>
      (rf==='all'||t.risk===rf) &&
      (sf==='all'||t.status===sf) &&
      (tf==='all'||t.telco===tf)
    );
    if(document.getElementById('txnCount')) {
      document.getElementById('txnCount').textContent=filtered.length+' transactions recorded';
    }
    const body = document.getElementById('txnBody');
    if(!body) return;
    if(!filtered.length){
      body.innerHTML='<tr><td colspan="12" style="text-align:center;color:var(--gov-muted);padding:40px;">No transactions match the selected filters.</td></tr>';
    } else {
      body.innerHTML = filtered.map(t=>txnRow(t, false)).join('');
    }
  });
}

function exportCSV(){
  fetch('/api/transactions').then(r=>r.json()).then(data=>{
    const header = ['Ref No','Date/Time','Customer','Type','Amount','Recipient','Device','Location','Risk Score','Risk Level','Status'];
    const rows = data.map(t=>[
      t.id,
      new Date(t.ts).toLocaleString('en-GH'),
      t.profile.name,
      t.profile.type,
      t.amount,
      t.recipient,
      t.device,
      t.location,
      t.score,
      t.risk,
      t.status
    ]);
    const csv = [header].concat(rows).map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv],{type:'text/csv'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'transactions.csv';
    a.click();
    URL.revokeObjectURL(url);
  });
}

// enhanced reports renderer
function renderReportsPage(stat){
  // stat object now includes hfStats, seg, fTypes
  document.getElementById('rpt-total').textContent = stat.total;
  document.getElementById('rpt-rate').textContent = stat.total ? Math.round((stat.safe+stat.mod)/stat.total*100)+'%' : '—';
  document.getElementById('rpt-saved').textContent = fmt(stat.saved || 0);

  // hurdle failures
  const hfArr = Object.entries(stat.hfStats||{});
  const maxHF = hfArr.length ? Math.max(...hfArr.map(([k,v])=>v)) : 1;
  document.getElementById('hurdleStats').innerHTML = hfArr.length ? hfArr.map(([name,cnt])=>{
    const pct = Math.round((cnt/maxHF)*100);
    return `<div style="margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px;">
        <span class="fw-700">${name}</span><span class="text-muted">${cnt} failures</span>
      </div>
      <div style="background:#E2E8F0;border-radius:2px;height:12px;">
        <div style="width:${pct}%;height:100%;background:var(--gov-navy);border-radius:2px;transition:width .4s;"></div>
      </div>
    </div>`;
  }).join('') : '<div class="text-muted text-small">No data.</div>';

  // risk by segment
  const segArr = Object.entries(stat.seg||{});
  document.getElementById('riskBySegment').innerHTML = segArr.map(([type,d])=>{
    const tot = d.safe+d.mod+d.high;
    return `<div style="margin-bottom:12px;">
      <div style="font-weight:700;font-size:13px;margin-bottom:6px;">${type} (${tot} txns)</div>
      <div style="display:flex;height:16px;border-radius:2px;overflow:hidden;">
        <div style="width:${tot?Math.round((d.safe/tot)*100):0}%;background:var(--safe-green);"></div>
        <div style="width:${tot?Math.round((d.mod/tot)*100):0}%;background:var(--warn-amber);"></div>
        <div style="width:${tot?Math.round((d.high/tot)*100):0}%;background:var(--danger-red);"></div>
      </div>
      <div style="display:flex;gap:12px;font-size:11px;margin-top:4px;color:var(--gov-muted);">
        <span>Safe: ${d.safe}</span><span>Moderate: ${d.mod}</span><span style="color:var(--danger-red);">High: ${d.high}</span>
      </div>
    </div>`;
  }).join('');

  // fraud types
  const ftArr = Object.entries(stat.fTypes||{});
  const ftMax = ftArr.length ? Math.max(...ftArr.map(([k,v])=>v)) : 1;
  document.getElementById('fraudTypeBreakdown').innerHTML = ftArr.map(([name,cnt])=>{
    const pct = ftMax?Math.round((cnt/ftMax)*100):0;
    return `<div style="margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px;">
        <span class="fw-700">${name}</span><span class="text-muted">${cnt} incidents</span>
      </div>
      <div style="background:#E2E8F0;border-radius:2px;height:12px;">
        <div style="width:${pct}%;height:100%;background:var(--danger-red);border-radius:2px;transition:width .4s;"></div>
      </div>
    </div>`;
  }).join('');
}


function renderSettingsPage(cfg){
  // populate the inputs in the full settings markup
  const safeInput = document.getElementById('thresh-safe');
  const modInput = document.getElementById('thresh-mod');
  const intervalInput = document.getElementById('txnInterval');
  if(safeInput) safeInput.value = cfg.threshSafe;
  if(modInput) modInput.value = cfg.threshMod;
  if(intervalInput) intervalInput.value = cfg.txnInterval/1000;
}

// ---------- page initialization ----------
document.addEventListener('DOMContentLoaded', () => {
  const path = window.location.pathname;
  if(path === '/'){
    const refresh = () => fetch('/api/transactions').then(r=>r.json()).then(renderDashboard);
    refresh();
    setInterval(refresh, 3000);
    searchBlacklist();
  }
  if(path === '/monitor'){
    const poll = () => fetch('/api/monitor').then(r=>r.json()).then(renderMonitorPage);
    poll();
    setInterval(poll, 3000);
  }
  if(path === '/transactions'){
    // populate table and enable filters / export
    renderTxnTable();
  }
  if(path === '/profiles'){
    fetch('/api/profiles').then(r=>r.json()).then(renderProfilesPage);
  }
  if(path === '/investigations'){
    fetch('/api/investigations').then(r=>r.json()).then(renderInvestPage);
  }
  if(path === '/reports'){
    fetch('/api/reports').then(r=>r.json()).then(renderReportsPage);
  }
  if(path === '/settings'){
    fetch('/api/settings').then(r=>r.json()).then(cfg=>{
      renderSettingsPage(cfg);
      // ensure risk panel visible by default
      showSettings('risk');
    });
  }
});

// Modal & Action handlers
function openTxnModal(id){
  fetch('/api/transactions').then(r=>r.json()).then(data=>{
    const t = data.find(x => x.id === id);
    if(!t) {
      alert('Transaction record not found.');
      return;
    }
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    const modalFooter = document.getElementById('modalFooter');
    const modal = document.getElementById('txnModal');

    if(modalTitle) modalTitle.textContent = `Transaction Audit Detail — ${t.id}`;
    if(modalBody) {
      const col = t.score<=threshSafe?'var(--safe-green)':t.score<=threshMod?'var(--warn-amber)':'var(--danger-red)';
      let hurdlesHtml = (t.hurdles || []).map(h => `
        <div class="hurdle-item" style="display:flex;align-items:center;gap:8px;padding:8px;border:1px solid var(--gov-border);background:var(--gov-silver);margin-bottom:4px;">
          <div class="hurdle-dot ${h.passed?'pass':'fail'}" style="width:10px;height:10px;border-radius:50%;background:${h.passed?'#22C55E':'var(--danger-red)'}"></div>
          <span class="hurdle-label" style="flex:1;font-size:12px;">${h.name}</span>
          <span class="hurdle-weight" style="font-size:11px;color:var(--gov-muted);">${h.weight} pts</span>
        </div>
      `).join('');

      modalBody.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
          <div>
            <div style="font-size:11px;color:var(--gov-muted);text-transform:uppercase;">Telecom Network</div>
            <div style="font-weight:700;color:var(--gov-navy);font-size:15px;">${t.telco || 'MTN Mobile Money'}</div>
            <div style="font-size:12px;margin-top:4px;">Customer: <strong>${t.profile ? t.profile.name : 'Unknown'}</strong> (${t.profile ? t.profile.type : 'User'})</div>
            <div style="font-size:12px;">Device: ${t.device}</div>
            <div style="font-size:12px;">Location: ${t.location}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:11px;color:var(--gov-muted);text-transform:uppercase;">Risk Evaluation Score</div>
            <div style="font-size:36px;font-weight:700;color:${col};">${t.score}/100</div>
            <span class="badge badge-${t.risk}">${t.risk.toUpperCase()} LEVEL</span>
          </div>
        </div>

        <div style="background:var(--gov-silver);padding:10px;border-radius:2px;margin-bottom:16px;">
          <div style="font-size:11px;color:var(--gov-muted);text-transform:uppercase;">Transaction Amount & Recipient</div>
          <div style="font-size:18px;font-weight:700;color:var(--gov-navy);">${fmt(t.amount)} &rarr; ${t.recipient}</div>
          <div style="font-size:12px;color:var(--danger-red);margin-top:2px;">Fraud Category: <strong>${t.fraudType || 'Standard Transaction'}</strong></div>
        </div>

        <div style="font-size:12px;font-weight:700;color:var(--gov-navy);margin-bottom:6px;">Multi-Hurdle Verification Audit:</div>
        <div class="hurdle-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
          ${hurdlesHtml}
        </div>
      `;
    }

    if(modalFooter) {
      modalFooter.innerHTML = `
        ${t.status !== 'blocked' && t.status !== 'approved' ? `
          <button class="btn btn-success" onclick="confirmTxn('${t.id}')">Clear Transaction</button>
          <button class="btn btn-danger" onclick="cancelTxn('${t.id}')">Block & Escalate</button>
        ` : ''}
        <button class="btn btn-outline" onclick="closeModal('txnModal')">Close</button>
      `;
    }

    if(modal) modal.classList.add('open');
  });
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if(modal) modal.classList.remove('open');
}

function confirmTxn(id){
  addLog(`✅ Transaction ${id} marked as cleared and approved.`);
  closeModal('txnModal');
  alert(`Transaction ${id} verified as legitimate.`);
}

function cancelTxn(id){
  addLog(`🚨 Transaction ${id} blocked and escalated to Telecom Fraud Unit.`);
  closeModal('txnModal');
  alert(`Transaction ${id} has been blocked and flagged for investigation.`);
}

// settings panel helpers
function showSettings(id,el){
  ['risk','alerts','integration','engine','users'].forEach(s=>{
    const section=document.getElementById('settings-'+s);
    if(section) section.style.display='none';
  });
  const target=document.getElementById('settings-'+id);
  if(target) target.style.display='block';
  document.querySelectorAll('.sidebar-link').forEach(a=>a.classList.remove('active'));
  if(el) el.classList.add('active');
}
function generateReport(){
  alert('Report download is not implemented in this demo.');
}

function saveThresholds(){
  threshSafe=parseInt(document.getElementById('thresh-safe').value);
  threshMod=parseInt(document.getElementById('thresh-mod').value);
  const newInterval=parseFloat(document.getElementById('txnInterval').value)*1000;
  if(running&&newInterval!==txnInterval){
    clearInterval(engineInterval);
    txnInterval=newInterval;
    engineInterval=setInterval(processTxn,txnInterval);
  } else {txnInterval=newInterval;}
  // update server config as well
  fetch('/api/settings',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({threshSafe,threshMod,txnInterval})
  });
  addLog('⚙ Thresholds updated: Safe≤'+threshSafe+', Moderate≤'+threshMod+', Interval '+txnInterval/1000+'s');
  alert('Configuration saved. New thresholds: Safe ≤'+threshSafe+', Moderate ≤'+threshMod);
}

// clock widget
if(document.getElementById('dashTime')){
  setInterval(()=>{
    const now=new Date();
    const el=document.getElementById('dashTime');
    if(el) el.innerHTML=`<div style="font-size:16px;font-weight:700;">${fmtTime(now)}</div><div>${now.toLocaleDateString('en-GH',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</div>`;
  },1000);
}
