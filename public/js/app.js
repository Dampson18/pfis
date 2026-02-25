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
let monFilter = 'all', typeFilter = 'all';

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
  const action=`<button class="btn btn-outline btn-sm" onclick="openTxnModal('${t.id}')">View</button>`;
  if(short){
    return `<tr>
      <td style="font-size:11px;font-family:monospace;">${t.id}</td>
      <td>${t.profile.name}</td>
      <td>${fmt(t.amount)}</td>
      <td><strong style="color:var(--danger-red);">${t.score}</strong></td>
      <td style="font-size:11px;">${t.failedHurdles.slice(0,2).join(', ')}${t.failedHurdles.length>2?'...':''}</td>
      <td style="font-size:11px;">${fmtTime(t.ts)}</td>
      <td>${statusBadge}</td>
      <td>${action}</td>
    </tr>`;
  }
  return `<tr>
    <td>${t.id}</td>
    <td>${new Date(t.ts).toLocaleString('en-GH')}</td>
    <td>${t.profile.name}</td>
    <td>${fmt(t.amount)}</td>
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
  // `data` expected to be an array of recent transactions
  // update risk counts
  const safe = data.filter(t=>t.risk==='safe').length;
  const mod = data.filter(t=>t.risk==='moderate').length;
  const high = data.filter(t=>t.risk==='high').length;
  document.getElementById('monC-safe').textContent=safe;
  document.getElementById('monC-mod').textContent=mod;
  document.getElementById('monC-high').textContent=high;

  const feed = document.getElementById('monitorFeed');
  if(!feed) return;
  feed.innerHTML='';
  data.forEach(txn => {
    // apply filters
    if((monFilter!=='all' && txn.risk!==monFilter) || (typeFilter!=='all' && txn.profile.type!==typeFilter)) return;
    const borderCol = txn.risk==='high'?'var(--danger-red)':txn.risk==='moderate'?'var(--warn-amber)':'var(--safe-green)';
    const bg = txn.risk==='high'?'#FFF5F5':txn.risk==='moderate'?'#FFFBEB':'#F0FFF4';
    const el = document.createElement('div');
    el.style.cssText=`background:${bg};border:1px solid var(--gov-border);border-left:4px solid ${borderCol};padding:12px 16px;margin-bottom:10px;border-radius:2px;animation:slideIn .3s ease;`;
    el.innerHTML=`
      <style>@keyframes slideIn{from{opacity:0;transform:translateY(-8px);}to{opacity:1;transform:none;}}</style>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
        <div style="flex:1;">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
            <span class="badge badge-${txn.risk}">${txn.risk.toUpperCase()} · ${txn.score}</span>
            <span style="font-size:11px;font-family:monospace;color:var(--gov-muted);">${txn.id}</span>
            <span style="font-size:11px;color:var(--gov-muted);">${fmtTime(txn.ts)}</span>
          </div>
          <div style="font-size:14px;font-weight:600;color:var(--gov-navy);margin-bottom:4px;">${txn.profile.name} · ${fmt(txn.amount)} → ${txn.recipient}</div>
          <div style="font-size:12px;color:var(--gov-muted);">${txn.device} · ${txn.location}</div>
          ${txn.failedHurdles && txn.failedHurdles.length?`<div style="font-size:11px;color:var(--danger-red);margin-top:4px;">Failed: ${txn.failedHurdles.join(', ')}</div>`:''}
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0;">
          ${txn.risk==='high'&&txn.confirmed===null?`
            <button class="btn btn-success btn-sm" onclick="confirmTxn('${txn.id}',this)">Confirm</button>
            <button class="btn btn-danger btn-sm" onclick="cancelTxn('${txn.id}',this)">Cancel</button>
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
function clearMonitor(){
  const feed=document.getElementById('monitorFeed');
  if(feed) feed.innerHTML='';
}

// new transaction table rendering with filters & CSV export
function renderTxnTable(){
  const rf=document.getElementById('txnRiskFilter').value;
  const sf=document.getElementById('txnStatusFilter').value;
  fetch('/api/transactions').then(r=>r.json()).then(data=>{
    let filtered=data.filter(t=>(rf==='all'||t.risk===rf)&&(sf==='all'||t.status===sf));
    document.getElementById('txnCount').textContent=filtered.length+' transactions recorded';
    const body = document.getElementById('txnBody');
    if(!filtered.length){
      body.innerHTML='<tr><td colspan="12" style="text-align:center;color:var(--gov-muted);padding:40px;">No transactions match the selected filters.</td></tr>';
    } else {
      body.innerHTML = filtered.map(t=>`<tr>
          <td>${t.id}</td>
          <td>${new Date(t.ts).toLocaleString('en-GH')}</td>
          <td>${t.profile.name}</td>
          <td>${t.profile.type}</td>
          <td>${fmt(t.amount)}</td>
          <td>${t.recipient}</td>
          <td>${t.device}</td>
          <td>${t.location}</td>
          <td>${t.score}</td>
          <td>${t.risk.toUpperCase()}</td>
          <td>${t.status}</td>
          <td>—</td>
        </tr>`).join('');
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

// simple modal/action stubs to prevent errors
function openTxnModal(id){
  alert('Transaction detail view is not implemented yet for '+id);
}
function confirmTxn(id){
  alert('Confirm action not implemented for '+id);
}
function cancelTxn(id){
  alert('Cancel action not implemented for '+id);
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
