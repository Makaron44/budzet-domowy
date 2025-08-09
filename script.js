/**********************************************************
 *  Budżet domowy Macieja – pełny script.js
 *  - wpisy + filtry + animacje
 *  - przypomnienia z kolejką toastów i „Zapłacone”
 *  - eksport CSV / PDF (z polskimi znakami – jeśli masz fonts/)
 *  - wykresy (słupki) z animacją na scroll
 *  - tryb ciemny (przełącznik #theme-toggle)
 *  - Supabase (anon) – bezpieczny włącznik + realtime sync
 **********************************************************/

/* =========================
   Konfiguracja Supabase
   ========================= */
const SUPABASE_URL      = 'https://kmcfmyrezzyejowrrbqy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImttY2ZteXJlenp5ZWpvd3JyYnF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ3NDUwMDgsImV4cCI6MjA3MDMyMTAwOH0.-IssqghD3mZkVG906Cao8udVQbzhCUEPQwIGG3nbg9s';

/* ładowane z CDN – jeżeli coś nie podeszło, apka działa offline */
const ENABLE_CLOUD =
  typeof window !== 'undefined' &&
  typeof window.supabase !== 'undefined' &&
  !!SUPABASE_URL && !!SUPABASE_ANON_KEY &&
  SUPABASE_URL.indexOf('supabase.co') !== -1;

const sb = ENABLE_CLOUD
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

let currentUser = null;

/* =========================
   DOM – podstawowe elementy
   ========================= */
const descInput     = document.getElementById('desc');
const categoryInput = document.getElementById('category');
const amountInput   = document.getElementById('amount');
const incomeBtn     = document.getElementById('income-btn');
const expenseBtn    = document.getElementById('expense-btn');
const historyList   = document.getElementById('history');
const totalSpan     = document.getElementById('total');
const toastRoot     = document.getElementById('toast');
const themeToggle   = document.getElementById('theme-toggle');

// Filtry
const filterTypeSel     = document.getElementById('filter-type');
const filterCatSel      = document.getElementById('filter-category');
const filterResetBtn    = document.getElementById('filter-reset');
const filteredWrap      = document.getElementById('filtered-summary');
const filteredTotalSpan = document.getElementById('filtered-total');

// Eksport
const exportCsvBtn = document.getElementById('export-csv-btn');
const exportPdfBtn = document.getElementById('export-pdf-btn');

// Przypomnienia
const reminderForm    = document.getElementById('reminder-form');
const reminderText    = document.getElementById('reminder-text');
const reminderDate    = document.getElementById('reminder-date');
const reminderRepeat  = document.getElementById('reminder-repeat');
const reminderList    = document.getElementById('reminder-list');

// Wykresy (słupki)
const chartCats  = document.getElementById('chart-categories');
const chartMonths= document.getElementById('chart-months');

/* =========================
   Stan i localStorage
   ========================= */
const LS_ENTRIES   = 'budget_entries_v1';
const LS_REMINDERS = 'budget_reminders_v3';

let entries   = [];
let reminders = [];

/* helpers  */
const fmtAmount = (v) =>
  (v >= 0 ? '+' : '') + Number(v).toFixed(2).replace('.', ',');

function saveEntriesLS() { localStorage.setItem(LS_ENTRIES, JSON.stringify(entries)); }
function saveRemindersLS(){ localStorage.setItem(LS_REMINDERS, JSON.stringify(reminders)); }

function loadEntriesLS() {
  try {
    const raw = localStorage.getItem(LS_ENTRIES);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (Array.isArray(data)) {
      entries = data
        .filter(e => e && typeof e.desc==='string' && typeof e.category==='string' && typeof e.amount==='number')
        .map(e => ({ id: e.id || Date.now(), desc: e.desc, category: e.category, amount: e.amount }));
    }
  } catch {}
}
function loadRemindersLS() {
  try {
    const raw = localStorage.getItem(LS_REMINDERS);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (Array.isArray(data)) reminders = data;
  } catch {}
}

/* =========================
   Toast (kolejka)
   ========================= */
let toastOpen=false;
function showActionToast({ text, onPaid, onOk, warn=false, timeout=0 }) {
  if (!toastRoot) { alert(text); onOk && onOk(); return; }
  toastRoot.innerHTML='';
  const box = document.createElement('div');
  box.className='toast-msg'+(warn?' warn':'');
  const span=document.createElement('span'); span.textContent=text;

  const right=document.createElement('div');
  right.style.display='flex'; right.style.gap='8px';

  if (onPaid) {
    const paid=document.createElement('button');
    paid.className='toast-close';
    paid.textContent='Zapłacone ✔️';
    paid.onclick=()=>{ hideToast(); onPaid&&onPaid(); };
    right.appendChild(paid);
  }
  const ok=document.createElement('button');
  ok.className='toast-close'; ok.textContent='OK';
  ok.onclick=()=>{ hideToast(); onOk&&onOk(); };

  box.appendChild(span); box.appendChild(right); right.appendChild(ok);
  toastRoot.appendChild(box); toastRoot.style.display='block'; toastOpen=true;
  if (timeout>0) {
    setTimeout(()=>{ if (toastOpen){ hideToast(); onOk&&onOk(); } }, timeout);
  }
}
function hideToast(){ toastRoot.style.display='none'; toastRoot.innerHTML=''; toastOpen=false; }

/* =========================
   Dodawanie / usuwanie wpisów
   ========================= */
function addEntry(type) {
  const desc = (descInput.value||'').trim();
  const cat  = categoryInput.value;
  let amtStr = (amountInput.value||'').replace(',','.');
  let amt    = parseFloat(amtStr);

  if (!desc || !cat || isNaN(amt) || amt<=0) return;
  if (type==='expense') amt=-amt;

  const entry={ id: Date.now(), desc, category: cat, amount: amt };
  entries.push(entry);
  saveEntriesLS();
  updateUI(true);

  // cloud
  pushEntryToCloud(entry);

  // reset
  descInput.value=''; categoryInput.selectedIndex=0; amountInput.value='';
}
incomeBtn?.addEventListener('click', ()=>addEntry('income'));
expenseBtn?.addEventListener('click',()=>addEntry('expense'));

function removeEntryByIndex(idx) {
  const id=entries[idx]?.id;
  entries.splice(idx,1);
  saveEntriesLS();
  updateUI();
  deleteEntryFromCloud(id);
}

/* =========================
   Render historii + suma
   ========================= */
function updateUI(animateLast=false) {
  historyList.innerHTML='';
  const reversed = entries.slice().reverse();

  // filtry
  const type = filterTypeSel?.value || 'all';
  const cat  = filterCatSel?.value  || 'all';

  let filteredSum=0;

  reversed.forEach((entry,iR)=> {
    const e = entry;
    const isIncome = e.amount>0;
    if ((type==='income' && !isIncome) || (type==='expense' && isIncome)) return;
    if (cat!=='all' && e.category!==cat) return;

    filteredSum += e.amount;

    const li=document.createElement('li');

    const info=document.createElement('div');
    const amountClass=e.amount>=0?'positive':'negative';
    info.innerHTML = `<strong>[${e.category}]</strong> ${e.desc}: <span class="amount ${amountClass}">${fmtAmount(e.amount)} zł</span>`;

    const btn=document.createElement('button');
    btn.title='Usuń';
    btn.innerHTML=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" width="14" height="14" fill="white"><path d="M135.2 17.7L128 32H32C14.3 32 0 46.3 0 64s14.3 32 32 32h384c17.7 0 32-14.3 32-32s-14.3-32-32-32h-96l-7.2-14.3C308.3 6.8 296.9 0 284.3 0H163.7c-12.6 0-24 6.8-28.5 17.7zM416 96H32l21.2 339c1.6 25.6 23 45 48.7 45h244.2c25.7 0 47.1-19.4 48.7-45L416 96z"/></svg>`;
    const originalIndex = entries.length-1 - iR;
    btn.onclick=()=>{ li.classList.add('removing'); setTimeout(()=> removeEntryByIndex(originalIndex),250); };

    if (animateLast && iR===0) li.classList.add('added');

    li.appendChild(info); li.appendChild(btn);
    historyList.appendChild(li);
  });

  // suma ogólna
  const total=entries.reduce((s,e)=>s+e.amount,0);
  totalSpan.textContent = total.toFixed(2).replace('.',',');
  totalSpan.style.color = total>=0 ? '#19994c' : '#e53935';

  // suma po filtrze
  if (filterTypeSel && (filterTypeSel.value!=='all' || filterCatSel.value!=='all')) {
    filteredWrap.style.display='block';
    filteredTotalSpan.textContent = filteredSum.toFixed(2).replace('.',',');
  } else {
    filteredWrap.style.display='none';
  }

  // odśwież wykresy
  renderCharts();
}

/* Filtry – obsługa */
filterTypeSel?.addEventListener('change',()=>updateUI());
filterCatSel?.addEventListener('change', ()=>updateUI());
filterResetBtn?.addEventListener('click', ()=>{
  if (filterTypeSel) filterTypeSel.value='all';
  if (filterCatSel)  filterCatSel.value='all';
  updateUI();
});

/* =========================
   Eksport CSV
   ========================= */
function exportToCSV() {
  if (!entries.length) { showActionToast({text:'Brak danych do eksportu', warn:true}); return; }
  let csv='Data,Kategoria,Opis,Kwota\n';
  entries.forEach(e=>{
    const date=new Date(e.id).toLocaleString();
    const line=`"${date}","${e.category}","${String(e.desc).replace(/"/g,'""')}",${e.amount}`;
    csv+=line+'\n';
  });
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download='budzet.csv';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1500);
}
exportCsvBtn?.addEventListener('click', exportToCSV);

/* =========================
   Eksport PDF (jsPDF + polskie znaki)
   ========================= */
async function loadFontAsBase64(path){
  try {
    const res = await fetch(path);
    if (!res.ok) throw new Error('404 font');
    const buf = await res.arrayBuffer();
    // base64
    let binary='', bytes=new Uint8Array(buf);
    for (let i=0;i<bytes.length;i++) binary+=String.fromCharCode(bytes[i]);
    return btoa(binary);
  } catch(e) {
    console.warn('Font load failed:', path, e);
    return null;
  }
}

async function exportToPDF() {
  if (!entries.length) { showActionToast({text:'Brak danych do eksportu', warn:true}); return; }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit:'pt', format:'a4' });

  // Spróbuj dodać własną czcionkę (np. Inter-Regular.ttf w /fonts/)
  let usedFont = 'helvetica'; // fallback
  const base64 = await loadFontAsBase64('fonts/Inter-Regular.ttf');
  if (base64) {
    doc.addFileToVFS('Inter-Regular.ttf', base64);
    doc.addFont('Inter-Regular.ttf','Inter','normal');
    usedFont='Inter';
  }

  const margin=56;
  let y=margin;

  doc.setFont(usedFont,'normal');
  doc.setFontSize(28);
  doc.text('Budżet domowy Macieja', margin, y);
  y+=20;

  doc.setFontSize(11);
  doc.setTextColor(120);
  doc.text(`Wygenerowano: ${new Date().toLocaleString()}`, margin, y);
  y+=24;

  // tabela
  doc.setDrawColor(230); doc.setLineWidth(1);
  const headers=['Data','Kategoria','Opis','Kwota'];
  const colX=[margin, 220, 350, 500];

  doc.setFontSize(12); doc.setTextColor(40);
  doc.text(headers[0],colX[0],y);
  doc.text(headers[1],colX[1],y);
  doc.text(headers[2],colX[2],y);
  doc.text(headers[3],colX[3],y);
  y+=10; doc.setDrawColor(220); doc.line(margin,y, 540,y); y+=6;

  doc.setFontSize(12);
  entries.forEach(e=>{
    const dt=new Date(e.id).toLocaleString();
    const amt=fmtAmount(e.amount).replace('.',',')+' zł';

    doc.setTextColor(40); doc.text(dt, colX[0], y);
    doc.text(e.category,    colX[1], y);
    doc.text(String(e.desc),colX[2], y);

    if (e.amount>=0) doc.setTextColor(24,138,62); else doc.setTextColor(229,57,53);
    doc.text(amt, colX[3], y, {align:'left'});

    y+=22;
    if (y>760){ doc.addPage(); y=margin; }
  });

  const total = entries.reduce((s,e)=>s+e.amount,0);
  y+=16; if (y>740){ doc.addPage(); y=margin; }
  doc.setTextColor(24,138,62);
  doc.setFontSize(20);
  const sumTxt = `Suma: ${total.toFixed(2).replace('.',',')} zł`;
  doc.text(sumTxt, 540, y, {align:'right'});

  doc.save('budzet.pdf');
}
exportPdfBtn?.addEventListener('click', exportToPDF);

/* =========================
   Przypomnienia
   ========================= */
function formatDateNoSeconds(iso){
  const d=new Date(iso);
  return d.toLocaleString(undefined, {year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'});
}
function nextDateISO(iso,repeat){
  const d=new Date(iso);
  if (repeat==='weekly') d.setDate(d.getDate()+7);
  else if (repeat==='monthly') d.setMonth(d.getMonth()+1);
  else if (repeat==='yearly') d.setFullYear(d.getFullYear()+1);
  return d.toISOString();
}
function cryptoId(){ return 'r'+Math.random().toString(36).slice(2)+Date.now().toString(36); }

function updateReminderUI() {
  reminderList.innerHTML='';
  reminders.sort((a,b)=>new Date(a.date)-new Date(b.date));
  reminders.forEach(r=>{
    const li=document.createElement('li');

    const info=document.createElement('div');
    info.className='rem-info';
    const title=document.createElement('div');
    title.textContent = r.text + (r.awaitingAck?' (oczekuje potwierdzenia)':'');
    const meta=document.createElement('div');
    meta.className='rem-meta';
    const badge = r.repeat!=='once'
      ? `<span class="rem-badge">${r.repeat==='monthly'?'Co miesiąc':(r.repeat==='weekly'?'Co tydzień':'Co rok')}</span>` : '';
    meta.innerHTML = `${formatDateNoSeconds(r.date)} ${badge}`;
    info.appendChild(title); info.appendChild(meta);

    const actions=document.createElement('div');
    actions.className='rem-actions';

    const paidBtn=document.createElement('button');
    paidBtn.className='btn-paid'; paidBtn.textContent='Zapłacone ✔️';
    paidBtn.onclick=()=>handlePaid(r);

    const delBtn=document.createElement('button');
    delBtn.textContent='Usuń 🗑️';
    delBtn.onclick=()=>{
      reminders = reminders.filter(x=>x.id!==r.id);
      saveRemindersLS(); updateReminderUI();
      deleteReminderFromCloud(r.id);
    };

    actions.appendChild(paidBtn); actions.appendChild(delBtn);
    li.appendChild(info); li.appendChild(actions);
    reminderList.appendChild(li);
  });
}

function handlePaid(rem){
  let input=prompt(`Kwota do zapłaty za: ${rem.text}`, "0");
  if (input===null) return;
  let amount=parseFloat(String(input).replace(',','.'));
  if (isNaN(amount)||amount<=0){ showActionToast({text:'Podaj poprawną kwotę (>0)',warn:true}); return; }

  const entry={ id: Date.now(), desc: rem.text, category:'Rachunki', amount:-Math.abs(amount) };
  entries.push(entry); saveEntriesLS(); updateUI(true); pushEntryToCloud(entry);

  acknowledgeReminder(rem);
  showActionToast({text:`Dodano wydatek: ${rem.text} (−${amount.toFixed(2)} zł)`});
}

function acknowledgeReminder(rem){
  const now=Date.now();
  if (rem.repeat==='once') {
    reminders = reminders.filter(x=>x.id!==rem.id);
    deleteReminderFromCloud(rem.id);
  } else {
    let next = nextDateISO(rem.date, rem.repeat);
    while (new Date(next).getTime()<=now) next = nextDateISO(next, rem.repeat);
    rem.date=next; delete rem.awaitingAck;
    pushReminderToCloud(rem);
  }
  saveRemindersLS(); updateReminderUI();
}

// kolejka toastów
let reminderQueue=[]; let processingQueue=false;
function enqueueReminderToast(rem){ reminderQueue.push(rem); if (!processingQueue) processQueue(); }
function processQueue(){
  if (processingQueue) return;
  if (!reminderQueue.length) { processingQueue=false; return; }
  processingQueue=true;
  const r=reminderQueue.shift();
  if ('Notification' in window && Notification.permission==='granted') {
    try{ new Notification(`Przypomnienie: ${r.text}`); }catch{}
  }
  showActionToast({
    text:`Przypomnienie: ${r.text}`, warn:true, timeout:0,
    onPaid:()=>{ handlePaid(r); processingQueue=false; processQueue(); },
    onOk: ()=>{ acknowledgeReminder(r); processingQueue=false; processQueue(); }
  });
}

function checkReminders(){
  const now=Date.now(); let changed=false;
  reminders.forEach(r=>{
    const due=new Date(r.date).getTime();
    if (due<=now){
      if (!r.awaitingAck){ r.awaitingAck=true; changed=true; }
      enqueueReminderToast(r);
    }
  });
  if (changed){ saveRemindersLS(); updateReminderUI(); }
}
reminderForm?.addEventListener('submit', ()=>{
  const text=(reminderText.value||'').trim();
  const dateVal=reminderDate.value; // lokalny 'YYYY-MM-DDTHH:MM'
  const repeat=reminderRepeat?.value || 'once';
  if (!text||!dateVal) return;

  const local=new Date(dateVal);
  const iso=local.toISOString();
  const r={ id: cryptoId(), text, date: iso, repeat, awaitingAck:false };
  reminders.push(r); saveRemindersLS(); updateReminderUI(); pushReminderToCloud(r);

  reminderText.value=''; reminderDate.value=''; if (reminderRepeat) reminderRepeat.value='once';
  showActionToast({text:`Dodano przypomnienie: ${text} – ${formatDateNoSeconds(iso)}`});
});

/* =========================
   Wykresy (proste słupki) + animacja na scroll
   ========================= */
function sumByCategory(){
  const out={}; entries.forEach(e=>{ if (e.amount<0){ out[e.category]=(out[e.category]||0)+(-e.amount); }});
  return out;
}
function sumByMonth(){
  const out={}; entries.forEach(e=>{
    const d=new Date(e.id); const key=`${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}`;
    out[key]= (out[key]||0) + e.amount;
  }); return out;
}
function renderCharts(){
  // Kategorie (wydatki)
  if (chartCats){
    chartCats.innerHTML='';
    const sums=sumByCategory();
    const cats=Object.keys(sums);
    const max=Math.max(1, ...Object.values(sums));
    cats.forEach(k=>{
      const wrap=document.createElement('div'); wrap.style.display='flex'; wrap.style.alignItems='center'; wrap.style.gap='10px'; wrap.style.margin='6px 0';
      const label=document.createElement('div'); label.style.width='120px'; label.textContent=k;
      const barBg=document.createElement('div'); barBg.style.flex='1'; barBg.style.height='12px'; barBg.style.borderRadius='999px'; barBg.style.background='#dfe7ef';
      const bar=document.createElement('div'); bar.style.height='12px'; bar.style.borderRadius='999px'; bar.style.width='0%'; bar.style.background='#ff6b6b';
      barBg.appendChild(bar);
      const val=document.createElement('div'); val.style.width='110px'; val.style.textAlign='right'; val.textContent='-'+sums[k].toFixed(2)+' zł';
      wrap.appendChild(label); wrap.appendChild(barBg); wrap.appendChild(val);
      chartCats.appendChild(wrap);

      // animacja
      observer.observe(bar);
      bar.dataset.targetPct = String((sums[k]/max)*100);
    });
  }

  // Bilans miesięczny – prosty wiersz: [zielony] przychody, [czerwony] wydatki, [niebieski] saldo liczbowo
  if (chartMonths){
    chartMonths.innerHTML='';
    const sums=sumByMonth();
    const months=Object.keys(sums).sort();
    months.forEach(m=>{
      const v=sums[m];
      const row=document.createElement('div'); row.style.display='flex'; row.style.alignItems='center'; row.style.gap='10px'; row.style.margin='6px 0';

      const label=document.createElement('div'); label.style.width='110px';
      const date = new Date(m+'-01T00:00:00');
      label.textContent = date.toLocaleString(undefined,{month:'short', year:'numeric'});

      const barBg=document.createElement('div'); barBg.style.flex='1'; barBg.style.height='12px'; barBg.style.borderRadius='999px'; barBg.style.background='#e6eef7';
      const bar=document.createElement('div'); bar.style.height='12px'; bar.style.borderRadius='999px'; bar.style.width='0%';
      bar.style.background = v>=0 ? '#2ecc71' : '#e74c3c';
      barBg.appendChild(bar);

      const val=document.createElement('div'); val.style.width='130px'; val.style.textAlign='right'; val.textContent = (v>=0?'+':'')+v.toFixed(2)+' zł';

      row.appendChild(label); row.appendChild(barBg); row.appendChild(val);
      chartMonths.appendChild(row);

      observer.observe(bar);
      bar.dataset.targetPct = String(Math.min(100, Math.abs(v) / Math.max(1, Math.abs(v)) * 100)); // prosta animacja do 100%
    });
  }
}
// IntersectionObserver do animacji słupków (powolniejsza)
const observer = new IntersectionObserver((entriesObs)=>{
  entriesObs.forEach(it=>{
    if (it.isIntersecting) {
      const el=it.target;
      const target = parseFloat(el.dataset.targetPct||'0');
      el.style.transition='width 1.2s ease';
      requestAnimationFrame(()=> el.style.width = target+'%' );
      observer.unobserve(el);
    }
  });
},{threshold:0.2});

/* =========================
   Tryb ciemny
   ========================= */
function applyTheme(){
  const mode = localStorage.getItem('theme') || 'light';
  document.documentElement.dataset.theme = mode; // użyj w CSS: [data-theme="dark"] { ... }
  if (themeToggle) themeToggle.textContent = (mode==='dark'?'☀️ Jasny':'🌙 Tryb ciemny');
}
themeToggle?.addEventListener('click', ()=>{
  const cur = localStorage.getItem('theme') || 'light';
  const next = cur==='dark' ? 'light' : 'dark';
  localStorage.setItem('theme', next);
  applyTheme();
});

/* =========================
   Supabase – auth + sync + realtime
   ========================= */
function setCloudBadge(state='offline', text){ /* opcjonalnie wizualny status */ }

async function cloudEnsureAuth(){
  if (!ENABLE_CLOUD) { setCloudBadge('offline','Chmura wyłączona'); return null; }
  try {
    const { data: ses } = await sb.auth.getSession();
    if (ses?.session?.user){ currentUser=ses.session.user; setCloudBadge('online'); return currentUser; }
    const { data, error } = await sb.auth.signInAnonymously();
    if (error) throw error;
    currentUser=data.user; setCloudBadge('online'); return currentUser;
  } catch(e){ console.warn('Auth error',e); setCloudBadge('offline','Błąd logowania'); return null; }
}

async function pullAllFromCloud(){
  if (!ENABLE_CLOUD || !currentUser) return;
  try{
    // entries
    {
      const { data, error } = await sb.from('entries')
        .select('*').eq('user_id', currentUser.id).order('id', {ascending:true});
      if (error) throw error;
      if (Array.isArray(data)) {
        entries = data.map(r=>({ id:Number(r.id), desc:r.desc, category:r.category, amount:Number(r.amount) }));
        saveEntriesLS(); updateUI();
      }
    }
    // reminders
    {
      const { data, error } = await sb.from('reminders')
        .select('*').eq('user_id', currentUser.id).order('date',{ascending:true});
      if (error) throw error;
      if (Array.isArray(data)) {
        reminders = data.map(r=>({ id:r.id, text:r.text, date:r.date, repeat:r.repeat||'once', awaitingAck:!!r.awaitingAck }));
        saveRemindersLS(); updateReminderUI();
      }
    }
  }catch(e){ console.warn('pullAllFromCloud',e); setCloudBadge('offline','Błąd synchronizacji'); }
}

async function pushEntryToCloud(entry){
  if (!ENABLE_CLOUD || !currentUser) return;
  try{
    await sb.from('entries').upsert({
      id: entry.id, user_id: currentUser.id,
      desc: entry.desc, category: entry.category, amount: entry.amount
    });
  }catch(e){ console.warn('pushEntryToCloud',e); }
}
async function deleteEntryFromCloud(id){
  if (!ENABLE_CLOUD || !currentUser || !id) return;
  try{ await sb.from('entries').delete().eq('user_id', currentUser.id).eq('id', id); }
  catch(e){ console.warn('deleteEntryFromCloud',e); }
}
async function pushReminderToCloud(rem){
  if (!ENABLE_CLOUD || !currentUser) return;
  try{
    await sb.from('reminders').upsert({
      id: rem.id, user_id: currentUser.id, text: rem.text, date: rem.date,
      repeat: rem.repeat||'once', awaitingAck: !!rem.awaitingAck
    });
  }catch(e){ console.warn('pushReminderToCloud',e); }
}
async function deleteReminderFromCloud(id){
  if (!ENABLE_CLOUD || !currentUser || !id) return;
  try{ await sb.from('reminders').delete().eq('user_id', currentUser.id).eq('id', id); }
  catch(e){ console.warn('deleteReminderFromCloud',e); }
}
function subscribeRealtime(){
  if (!ENABLE_CLOUD || !currentUser) return;
  try{
    sb.channel('entries-changes')
      .on('postgres_changes',{event:'*',schema:'public',table:'entries', filter:`user_id=eq.${currentUser.id}`},
        ()=>pullAllFromCloud())
      .subscribe();

    sb.channel('reminders-changes')
      .on('postgres_changes',{event:'*',schema:'public',table:'reminders', filter:`user_id=eq.${currentUser.id}`},
        ()=>pullAllFromCloud())
      .subscribe();
  }catch(e){ console.warn('subscribeRealtime',e); }
}

/* =========================
   Start
   ========================= */
document.addEventListener('DOMContentLoaded', async ()=>{
  applyTheme();

  loadEntriesLS(); loadRemindersLS();
  updateUI(); updateReminderUI();

  if ('Notification' in window && Notification.permission==='default') {
    Notification.requestPermission();
  }

  if (ENABLE_CLOUD){
    try{
      await cloudEnsureAuth();
      await pullAllFromCloud();
      subscribeRealtime();
    }catch(e){
      console.warn('Cloud init failed',e);
      setCloudBadge('offline','Chmura niedostępna');
    }
  } else {
    setCloudBadge('offline','Chmura wyłączona');
  }

  checkReminders();
  setInterval(checkReminders, 30000);
});
