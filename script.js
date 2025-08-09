/* =========================================================
   Budżet domowy Macieja – FULL JS z chmurą (Supabase)
   ========================================================= */

/* ============ DOM (zastane w Twoim HTML) ============ */
const descInput       = document.getElementById('desc');
const categoryInput   = document.getElementById('category');
const amountInput     = document.getElementById('amount');
const historyList     = document.getElementById('history');
const totalSpan       = document.getElementById('total');
const incomeBtn       = document.getElementById('income-btn');
const expenseBtn      = document.getElementById('expense-btn');
const exportCsvBtn    = document.getElementById('export-csv-btn');
const exportPdfBtn    = document.getElementById('export-pdf-btn');
const toastRoot       = document.getElementById('toast');

const filterTypeSel   = document.getElementById('filter-type');
const filterCatSel    = document.getElementById('filter-category');
const filterResetBtn  = document.getElementById('filter-reset');
const filteredWrap    = document.getElementById('filtered-summary');
const filteredTotalEl = document.getElementById('filtered-total');

const reminderForm    = document.getElementById('reminder-form');
const reminderText    = document.getElementById('reminder-text');
const reminderDate    = document.getElementById('reminder-date');
const reminderRepeat  = document.getElementById('reminder-repeat');
const reminderList    = document.getElementById('reminder-list');

/* ============ DODATKOWY UI – status chmury + Sync Now ============ */
(function mountCloudToolbar(){
  const container = document.querySelector('.container') || document.body;
  const bar = document.createElement('div');
  bar.id = 'cloud-toolbar';
  bar.style.display = 'flex';
  bar.style.gap = '10px';
  bar.style.alignItems = 'center';
  bar.style.justifyContent = 'space-between';
  bar.style.margin = '6px 0 2px';

  const left = document.createElement('div');
  left.style.display = 'flex';
  left.style.gap = '10px';
  left.style.alignItems = 'center';

  const badge = document.createElement('span');
  badge.id = 'cloud-badge';
  badge.style.padding = '6px 10px';
  badge.style.borderRadius = '999px';
  badge.style.fontSize = '0.9em';
  badge.style.background = '#eef2ff';
  badge.style.color = '#334';
  badge.textContent = '🔄 Łączenie…';
  left.appendChild(badge);

  const right = document.createElement('div');
  const btn = document.createElement('button');
  btn.id = 'sync-now-btn';
  btn.textContent = 'Synchronizuj teraz';
  btn.style.padding = '8px 12px';
  btn.style.border = 'none';
  btn.style.borderRadius = '8px';
  btn.style.cursor = 'pointer';
  btn.style.background = 'linear-gradient(135deg,#61c6f8,#1976d2)';
  btn.style.color = '#fff';
  btn.onclick = () => manualSync();
  right.appendChild(btn);

  bar.appendChild(left);
  bar.appendChild(right);
  const h1 = container.querySelector('h1');
  (h1?.nextSibling ? container.insertBefore(bar, h1.nextSibling) : container.prepend(bar));
})();

function setCloudBadge(state, text){
  const el = document.getElementById('cloud-badge');
  if (!el) return;
  if (state === 'online') {
    el.style.background = '#e8fff1';
    el.style.color = '#17633d';
    el.textContent = text || '🟢 Online';
  } else if (state === 'sync') {
    el.style.background = '#fff7e6';
    el.style.color = '#7a4b00';
    el.textContent = text || '🔄 Synchronizuję…';
  } else if (state === 'offline') {
    el.style.background = '#ffecec';
    el.style.color = '#7a1f1f';
    el.textContent = text || '🔴 Offline';
  } else {
    el.style.background = '#eef2ff';
    el.style.color = '#334';
    el.textContent = text || 'ℹ️ Status nieznany';
  }
}

/* ============ Stan lokalny + localStorage ============ */
const STORAGE_KEY_ENTRIES   = 'budget_entries_v2';
const STORAGE_KEY_REMINDERS = 'budget_reminders_v4';

let entries   = [];  // {id, desc, category, amount, updatedAt?}
let reminders = [];  // {id, text, date, repeat, awaitingAck, updatedAt?}

function saveEntries(){ localStorage.setItem(STORAGE_KEY_ENTRIES, JSON.stringify(entries)); }
function saveReminders(){ localStorage.setItem(STORAGE_KEY_REMINDERS, JSON.stringify(reminders)); }

function loadEntriesLS(){
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ENTRIES);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (Array.isArray(data)) {
      entries = data.map(e => ({
        id: e.id || ('loc-'+Date.now()),
        desc: String(e.desc||''),
        category: String(e.category||''),
        amount: Number(e.amount||0),
        updatedAt: e.updatedAt || Date.now(),
      }));
    }
  } catch(e){ console.warn('loadEntriesLS', e); }
}
function loadRemindersLS(){
  try {
    const raw = localStorage.getItem(STORAGE_KEY_REMINDERS);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (Array.isArray(data)) {
      reminders = data.map(r => ({
        id: r.id || ('loc-'+Date.now()),
        text: String(r.text||''),
        date: r.date, repeat: r.repeat || 'once',
        awaitingAck: !!r.awaitingAck,
        updatedAt: r.updatedAt || Date.now(),
      }));
    }
  } catch(e){ console.warn('loadRemindersLS', e); }
}

/* ============ UI – lista + suma + filtry ============ */
function moneyPL(n){
  const s = Math.abs(n).toLocaleString('pl-PL',{minimumFractionDigits:2,maximumFractionDigits:2});
  return (n>=0?`+${s}`:`-${s}`)+' zł';
}

function applyFilters(list){
  const t = filterTypeSel?.value || 'all';
  const c = filterCatSel?.value || 'all';
  return list.filter(e=>{
    if (t==='income' && e.amount<0) return false;
    if (t==='expense' && e.amount>=0) return false;
    if (c!=='all' && e.category!==c) return false;
    return true;
  });
}

function updateFilteredSummary(){
  if (!filteredWrap) return;
  const arr = applyFilters(entries);
  if (filterTypeSel.value==='all' && filterCatSel.value==='all') {
    filteredWrap.style.display='none';
    return;
  }
  const sum = arr.reduce((s,e)=>s+e.amount,0);
  filteredTotalEl.textContent = sum.toLocaleString('pl-PL',{minimumFractionDigits:2,maximumFractionDigits:2});
  filteredTotalEl.style.color = sum>=0?'#19994c':'#e53935';
  filteredWrap.style.display='block';
}

function updateUI(animateLast=false){
  historyList.innerHTML='';
  const list = entries.slice().reverse(); // najnowsze u góry
  list.forEach((e,i)=>{
    const li = document.createElement('li');

    const info = document.createElement('div');
    const s = e.amount>=0?'+':'';
    info.innerHTML = `<strong>[${e.category}]</strong> ${e.desc}: <span class="amount ${e.amount>=0?'positive':'negative'}">${s}${e.amount} zł</span>`;

    const btn = document.createElement('button');
    btn.innerHTML = '🗑️';
    const origIdx = entries.length - 1 - i;
    btn.onclick = () => {
      li.classList.add('removing');
      setTimeout(()=> removeEntry(origIdx), 220);
    };

    if (animateLast && i===0) li.classList.add('added');
    li.append(info, btn);
    historyList.appendChild(li);
  });

  const filtered = applyFilters(entries);
  const total = filtered.reduce((s,e)=>s+e.amount,0);
  totalSpan.textContent = total.toFixed(2);
  totalSpan.style.color = total>=0?'green':'red';

  updateFilteredSummary();
}

/* ============ Dodawanie/usuwanie wpisów ============ */
incomeBtn?.addEventListener('click', ()=> addEntry('income'));
expenseBtn?.addEventListener('click', ()=> addEntry('expense'));

async function addEntry(type){
  const desc = (descInput.value||'').trim();
  const category = categoryInput.value;
  let amount = parseFloat(String(amountInput.value||'').replace(',','.'));
  if (!desc || !category || isNaN(amount) || amount<=0) return;
  if (type==='expense') amount = -amount;

  const row = { id:'loc-'+Date.now(), desc, category, amount, updatedAt: Date.now() };
  entries.push(row);
  saveEntries(); updateUI(true);

  descInput.value=''; categoryInput.selectedIndex=0; amountInput.value='';

  // push do chmury (optymistycznie)
  try { await cloudInsertEntry(row); } catch(e){ console.warn(e); }
}

async function removeEntry(index){
  const row = entries[index];
  entries.splice(index,1);
  saveEntries(); updateUI();
  try { await cloudDeleteEntry(row); } catch(e){ console.warn(e); }
}

/* ============ Toasty (OK + Zapłacone) ============ */
let toastOpen=false;
function showActionToast({text,onPaid,onOk,warn=false,timeout=0}){
  if (!toastRoot){ alert(text); if(onOk)onOk(); return; }
  toastRoot.innerHTML='';
  const box = document.createElement('div');
  box.className = 'toast-msg'+(warn?' warn':'');
  const span = document.createElement('span'); span.textContent = text;

  const right = document.createElement('div'); right.style.display='flex'; right.style.gap='8px';
  if (onPaid){
    const paid = document.createElement('button');
    paid.className='toast-close'; paid.textContent='Zapłacone ✔️';
    paid.onclick=()=>{ hideToast(); onPaid(); };
    right.appendChild(paid);
  }
  const ok = document.createElement('button');
  ok.className='toast-close'; ok.textContent='OK';
  ok.onclick=()=>{ hideToast(); onOk && onOk(); };
  right.appendChild(ok);

  box.append(span,right);
  toastRoot.appendChild(box);
  toastRoot.style.display='block';
  toastOpen=true;
  if (timeout>0) setTimeout(()=>{ if(toastOpen){ hideToast(); onOk&&onOk(); } }, timeout);
}
function hideToast(){ toastOpen=false; toastRoot.style.display='none'; toastRoot.innerHTML=''; }

/* ============ Przypomnienia ============ */
function formatDateNoSeconds(iso){
  const d = new Date(iso);
  return d.toLocaleString(undefined,{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
}
function nextDateISO(iso,repeat){
  const d = new Date(iso);
  if (repeat==='weekly') d.setDate(d.getDate()+7);
  else if (repeat==='monthly') d.setMonth(d.getMonth()+1);
  else if (repeat==='yearly') d.setFullYear(d.getFullYear()+1);
  return d.toISOString();
}

function updateReminderUI(){
  reminderList.innerHTML='';
  reminders.sort((a,b)=> new Date(a.date)-new Date(b.date));
  reminders.forEach(r=>{
    const li = document.createElement('li');

    const info = document.createElement('div');
    info.className='rem-info';
    const title = document.createElement('div');
    title.textContent = r.text + (r.awaitingAck?' (oczekuje potwierdzenia)':'');
    const meta = document.createElement('div');
    meta.className='rem-meta';
    const badge = r.repeat!=='once'
      ? `<span class="rem-badge">${r.repeat==='monthly'?'Co miesiąc':r.repeat==='weekly'?'Co tydzień':'Co rok'}</span>` : '';
    meta.innerHTML = `${formatDateNoSeconds(r.date)} ${badge}`;
    info.append(title, meta);

    const actions = document.createElement('div');
    actions.className='rem-actions';

    const btnPaid = document.createElement('button');
    btnPaid.className='btn-paid'; btnPaid.textContent='Zapłacone ✔️';
    btnPaid.onclick=()=>handlePaid(r);

    const btnDel = document.createElement('button');
    btnDel.textContent='Usuń 🗑️';
    btnDel.onclick=()=> deleteReminder(r.id);

    actions.append(btnPaid, btnDel);
    li.append(info, actions);
    reminderList.appendChild(li);
  });
}

async function handlePaid(rem){
  let input = prompt(`Kwota do zapłaty za: ${rem.text}`, "0");
  if (input===null) return;
  let amount = parseFloat(String(input).replace(',','.'));
  if (isNaN(amount)||amount<=0){
    showActionToast({text:'Podaj poprawną kwotę (>0).',warn:true});
    return;
  }
  // wpis do historii (lokalnie + chmura)
  const row = { id:'loc-'+Date.now(), desc: rem.text, category:'Rachunki', amount:-Math.abs(amount), updatedAt: Date.now() };
  entries.push(row); saveEntries(); updateUI(true);
  try { await cloudInsertEntry(row); } catch(e){}

  // ACK/reminder shift
  if (rem.repeat==='once'){
    await deleteReminder(rem.id);
  } else {
    const now = Date.now();
    let next = nextDateISO(rem.date, rem.repeat);
    while(new Date(next).getTime()<=now) next=nextDateISO(next,rem.repeat);
    rem.date = next; rem.awaitingAck=false; rem.updatedAt=Date.now();
    saveReminders(); updateReminderUI();
    try { await syncReminderRow(rem); } catch(e){}
  }
  showActionToast({text:`Dodano wydatek: ${rem.text} (−${amount.toFixed(2)} zł)`});
}

reminderForm?.addEventListener('submit', async ()=>{
  const text = (reminderText.value||'').trim();
  const dateVal = reminderDate.value;
  const repeat = reminderRepeat?.value || 'once';
  if (!text || !dateVal) return;

  const iso = new Date(dateVal).toISOString();
  const row = { id:'loc-'+Math.random().toString(36).slice(2), text, date: iso, repeat, awaitingAck:false, updatedAt: Date.now() };
  reminders.push(row); saveReminders(); updateReminderUI();
  showActionToast({text:`Dodano przypomnienie: ${text}`});

  reminderText.value=''; reminderDate.value=''; if(reminderRepeat) reminderRepeat.value='once';

  try { await cloudInsertReminder(row); } catch(e){ console.warn(e); }
});

async function deleteReminder(remId){
  const row = reminders.find(r=>r.id===remId);
  reminders = reminders.filter(r=>r.id!==remId);
  saveReminders(); updateReminderUI();
  try { await cloudDeleteReminder(row); } catch(e){}
}

async function syncReminderRow(rem){
  if (!rem || String(rem.id).startsWith('loc-')) return;
  await ensureAuth();
  await supabase.from('reminders').update({
    text: rem.text, date: rem.date, repeat: rem.repeat, awaiting_ack: !!rem.awaitingAck
  }).eq('id', rem.id);
}

/* ============ Filtry – zdarzenia ============ */
filterTypeSel?.addEventListener('change', ()=>{ updateUI(); });
filterCatSel?.addEventListener('change', ()=>{ updateUI(); });
filterResetBtn?.addEventListener('click', ()=>{
  if (filterTypeSel) filterTypeSel.value='all';
  if (filterCatSel)  filterCatSel.value='all';
  updateUI();
});

/* ============ CSV ============ */
function exportToCSV(){
  if (!entries.length) return alert('Brak danych do eksportu.');
  let csv='Data,Kategoria,Opis,Kwota\n';
  entries.forEach(e=>{
    const date=new Date(e.updatedAt||Date.now()).toLocaleString('pl-PL');
    csv+=`"${date}","${e.category.replace(/"/g,'""')}","${String(e.desc).replace(/"/g,'""')}",${e.amount}\n`;
  });
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download='budzet.csv';
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1500);
}
exportCsvBtn?.addEventListener('click', exportToCSV);

/* ============ PDF (Roboto lokalnie + fallback GitHub) ============ */
let __robotoLoaded=false;
function abToBase64(ab){ let bin=''; const bytes=new Uint8Array(ab); for(let i=0;i<bytes.byteLength;i++) bin+=String.fromCharCode(bytes[i]); return btoa(bin); }
async function addFontFromResponse(doc,res,filename,family,style='normal'){
  if(!res.ok) throw new Error(`HTTP ${res.status} dla ${filename}`);
  const b64=abToBase64(await res.arrayBuffer()); doc.addFileToVFS(filename,b64); doc.addFont(filename,family,style);
}
async function tryLoadLocalRoboto(doc){
  const regs=await fetch('./fonts/Roboto-Regular.ttf',{cache:'no-store'});
  const bold=await fetch('./fonts/Roboto-Bold.ttf',{cache:'no-store'});
  await addFontFromResponse(doc,regs,'Roboto-Regular.ttf','Roboto','normal');
  await addFontFromResponse(doc,bold,'Roboto-Bold.ttf','Roboto','bold');
}
async function tryLoadRemoteRoboto(doc){
  const regUrl='https://raw.githubusercontent.com/google/fonts/main/apache/roboto/Roboto-Regular.ttf';
  const boldUrl='https://raw.githubusercontent.com/google/fonts/main/apache/roboto/Roboto-Bold.ttf';
  const regs=await fetch(regUrl,{cache:'no-store'});
  const bold=await fetch(boldUrl,{cache:'no-store'});
  await addFontFromResponse(doc,regs,'Roboto-Regular.ttf','Roboto','normal');
  await addFontFromResponse(doc,bold,'Roboto-Bold.ttf','Roboto','bold');
}
async function loadRoboto(doc){
  if(__robotoLoaded){ doc.setFont('Roboto','normal'); return; }
  try{ await tryLoadLocalRoboto(doc); }catch(e1){ console.warn('Lokalne fonty niedostępne, pobieram zdalnie…'); await tryLoadRemoteRoboto(doc); }
  doc.setFont('Roboto','normal'); __robotoLoaded=true;
}

function makePDFMoney(n){ const s = Math.abs(n).toLocaleString('pl-PL',{minimumFractionDigits:2,maximumFractionDigits:2}); return (n>=0?`+${s}`:`-${s}`)+' zł'; }

async function exportToPDF(){
  if (!entries.length) return alert('Brak danych do eksportu.');
  const { jsPDF } = window.jspdf || {}; if(!jsPDF){ alert('Brak jsPDF'); return; }
  const doc = new jsPDF({unit:'pt',format:'a4'}); await loadRoboto(doc); doc.setFont('Roboto','normal');

  const pageW=doc.internal.pageSize.getWidth(), pageH=doc.internal.pageSize.getHeight();
  const M=56, cText=[36,41,46], cMuted=[120,128,136], cLine=[214,220,226], cHead=[244,247,250], cZebra=[252,253,255], cGreen=[25,153,76], cRed=[229,57,53];
  const colDate=M, colCat=M+160, colDesc=M+300, colAmtR=pageW-M;

  doc.setFont('Roboto','bold'); doc.setFontSize(28); doc.setTextColor(...cText); doc.text('Budżet domowy Macieja', M, 70);
  doc.setFont('Roboto','normal'); doc.setFontSize(11); doc.setTextColor(...cMuted); doc.text(`Wygenerowano: ${new Date().toLocaleString('pl-PL')}`, M, 92);

  const headY=130; doc.setFillColor(...cHead); doc.roundedRect(M-8, headY-20, pageW-2*M+16, 32, 6,6,'F');
  doc.setFont('Roboto','bold'); doc.setFontSize(13); doc.setTextColor(...cText);
  doc.text('Data',colDate,headY); doc.text('Kategoria',colCat,headY); doc.text('Opis',colDesc,headY); doc.text('Kwota',colAmtR,headY,{align:'right'});
  doc.setDrawColor(...cLine); doc.setLineWidth(0.7); doc.line(M,headY+6,pageW-M,headY+6);

  doc.setFont('Roboto','normal'); doc.setFontSize(12);
  let y=headY+30, rowH=24;
  const rows=entries.slice(); // kolejność jak w appce

  const newPage=()=>{ doc.addPage(); const y0=64;
    doc.setFillColor(...cHead); doc.roundedRect(M-8, y0-20, pageW-2*M+16,32,6,6,'F');
    doc.setFont('Roboto','bold'); doc.setFontSize(13); doc.setTextColor(...cText);
    doc.text('Data',colDate,y0); doc.text('Kategoria',colCat,y0); doc.text('Opis',colDesc,y0); doc.text('Kwota',colAmtR,y0,{align:'right'});
    doc.setDrawColor(...cLine); doc.setLineWidth(0.7); doc.line(M,y0+6,pageW-M,y0+6);
    doc.setFont('Roboto','normal'); doc.setFontSize(12); return y0+30; };

  rows.forEach((e,i)=>{
    if (y>pageH-100) y=newPage();
    if (i%2===0){ doc.setFillColor(...cZebra); doc.rect(M-8,y-16,pageW-2*M+16,rowH,'F'); }
    const dateStr = new Date(e.updatedAt||Date.now()).toLocaleString('pl-PL');
    doc.setTextColor(...cText); doc.text(dateStr,colDate,y); doc.text(e.category||'',colCat,y);
    const maxW=(colAmtR-16)-colDesc; const lines=doc.splitTextToSize(String(e.desc||''),maxW);
    doc.text(lines[0],colDesc,y);
    doc.setTextColor(...(e.amount>=0?cGreen:cRed));
    doc.text(makePDFMoney(e.amount), colAmtR, y, {align:'right'}); doc.setTextColor(...cText);
    for(let k=1;k<lines.length;k++){ y+=rowH-6; if(y>pageH-100) y=newPage(); doc.text(lines[k],colDesc,y); }
    y+=rowH;
  });

  const total=entries.reduce((s,e)=>s+e.amount,0);
  if (y>pageH-120) y=newPage();
  const boxW=300, boxH=56, boxX=pageW-M-boxW, boxY=y+14;
  doc.setFillColor(236,248,240); doc.setDrawColor(210,232,216); doc.setLineWidth(1); doc.roundedRect(boxX,boxY,boxW,boxH,10,10,'FD');
  doc.setFont('Roboto','bold'); doc.setFontSize(18); doc.setTextColor(...(total>=0?cGreen:cRed));
  doc.text(`Suma: ${total.toLocaleString('pl-PL',{minimumFractionDigits:2,maximumFractionDigits:2})} zł`, boxX+boxW/2, boxY+boxH/2+6, {align:'center'});

  doc.setFont('Roboto','normal'); doc.setFontSize(9); doc.setTextColor(...cMuted); doc.text('Budżet domowy – PDF wygenerowany w przeglądarce', M, pageH-24);
  doc.save('budzet.pdf');
}
exportPdfBtn?.addEventListener('click', exportToPDF);

/* ============ Tryb ciemny – jeśli masz #theme-toggle ============ */
document.getElementById('theme-toggle')?.addEventListener('click', ()=>{
  document.documentElement.classList.toggle('dark');
  // zapamiętaj preferencję jeśli chcesz:
  // localStorage.setItem('theme', document.documentElement.classList.contains('dark')?'dark':'light');
});

/* =========================================================
   SUPABASE – konfiguracja, auth, sync, realtime
   ========================================================= */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://kmcfmyrezzyejowrrbqy.supabase.co'
const supabaseKey = process.env.SUPABASE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

let currentUser=null;

async function ensureAuth(){
  if (!supabase){ setCloudBadge('offline','(brak klienta Supabase)'); return null; }
  const { data:ses } = await supabase.auth.getSession();
  if (ses?.session?.user){ currentUser=ses.session.user; setCloudBadge('online'); return currentUser; }
  try{
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
    currentUser = data.user; setCloudBadge('online');
    return currentUser;
  }catch(e){ console.warn('auth',e); setCloudBadge('offline'); return null; }
}

/* --- Cloud CRUD: ENTRIES --- */
async function cloudInsertEntry(localRow){
  await ensureAuth(); if(!currentUser) return;
  setCloudBadge('sync');
  const { data, error } = await supabase.from('entries')
    .insert({ user_id: currentUser.id, desc: localRow.desc, category: localRow.category, amount: localRow.amount })
    .select().single();
  if (!error && data?.id){
    const idx = entries.findIndex(x=>x.id===localRow.id);
    if (idx>-1){ entries[idx].id=data.id; entries[idx].updatedAt = new Date(data.updated_at).getTime(); }
    saveEntries(); updateUI();
  }
  setCloudBadge('online');
}
async function cloudDeleteEntry(row){
  if (!row || String(row.id).startsWith('loc-')) return;
  await ensureAuth(); if(!currentUser) return;
  setCloudBadge('sync');
  await supabase.from('entries').delete().eq('id', row.id);
  setCloudBadge('online');
}

/* --- Cloud CRUD: REMINDERS --- */
async function cloudInsertReminder(localRow){
  await ensureAuth(); if(!currentUser) return;
  setCloudBadge('sync');
  const { data, error } = await supabase.from('reminders')
    .insert({ user_id: currentUser.id, text: localRow.text, date: localRow.date, repeat: localRow.repeat, awaiting_ack: !!localRow.awaitingAck })
    .select().single();
  if (!error && data?.id){
    const i=reminders.findIndex(r=>r.id===localRow.id);
    if (i>-1){ reminders[i].id=data.id; reminders[i].updatedAt=new Date(data.updated_at).getTime(); }
    saveReminders(); updateReminderUI();
  }
  setCloudBadge('online');
}
async function cloudDeleteReminder(row){
  if (!row || String(row.id).startsWith('loc-')) return;
  await ensureAuth(); if(!currentUser) return;
  setCloudBadge('sync'); await supabase.from('reminders').delete().eq('id', row.id); setCloudBadge('online');
}

/* --- Pull-all (cloud wins) --- */
async function pullAllFromCloud(){
  await ensureAuth(); if(!currentUser) return;
  setCloudBadge('sync','⬇️ Pobieram…');

  // entries
  const { data: eData, error: eErr } = await supabase
    .from('entries').select('id, desc, category, amount, updated_at, created_at')
    .order('created_at',{ascending:true});
  if (!eErr && Array.isArray(eData)){
    entries = eData.map(e=>({ id:e.id, desc:e.desc, category:e.category, amount:Number(e.amount), updatedAt: new Date(e.updated_at).getTime() }));
    saveEntries(); updateUI();
  }

  // reminders
  const { data: rData, error: rErr } = await supabase
    .from('reminders').select('id, text, date, repeat, awaiting_ack, updated_at, created_at')
    .order('date',{ascending:true});
  if (!rErr && Array.isArray(rData)){
    reminders = rData.map(r=>({ id:r.id, text:r.text, date:r.date, repeat:r.repeat, awaitingAck:!!r.awaiting_ack, updatedAt:new Date(r.updated_at).getTime() }));
    saveReminders(); updateReminderUI();
  }

  setCloudBadge('online','🟢 Online (zsynchronizowano)');
}

/* --- Realtime: odśwież po zmianach --- */
function subscribeRealtime(){
  if (!supabase) return;
  supabase.channel('entries-rt')
    .on('postgres_changes',{event:'*',schema:'public',table:'entries'}, ()=> pullAllFromCloud())
    .subscribe();
  supabase.channel('reminders-rt')
    .on('postgres_changes',{event:'*',schema:'public',table:'reminders'}, ()=> pullAllFromCloud())
    .subscribe();
}

/* --- Manual Sync (przycisk) --- */
async function manualSync(){ await pullAllFromCloud(); }

/* ============ Pętla przypomnień (toast) ============ */
function checkReminders(){
  const now=Date.now(); let changed=false;
  reminders.forEach(r=>{
    const due = new Date(r.date).getTime();
    if (due<=now){
      if(!r.awaitingAck){ r.awaitingAck=true; r.updatedAt=Date.now(); changed=true; }
      showActionToast({ text:`Przypomnienie: ${r.text}`, warn:true,
        onPaid: ()=>handlePaid(r),
        onOk:   async ()=>{ await acknowledgeReminder(r); }
      });
    }
  });
  if (changed){ saveReminders(); updateReminderUI(); }
}
async function acknowledgeReminder(rem){
  if (rem.repeat==='once'){
    await deleteReminder(rem.id);
  } else {
    const now=Date.now(); let next=nextDateISO(rem.date, rem.repeat);
    while(new Date(next).getTime()<=now) next=nextDateISO(next,rem.repeat);
    rem.date=next; rem.awaitingAck=false; rem.updatedAt=Date.now();
    saveReminders(); updateReminderUI(); try{ await syncReminderRow(rem); }catch(e){}
  }
}

/* ============ INIT ============ */
document.addEventListener('DOMContentLoaded', async ()=>{
  loadEntriesLS(); loadRemindersLS(); updateUI(); updateReminderUI();

  // powiadomienia (opcjonalnie)
  if ('Notification' in window && Notification.permission === 'default'){
    Notification.requestPermission();
  }

  // start chmury
  await ensureAuth();
  await pullAllFromCloud();
  subscribeRealtime();

  // cykliczne sprawdzanie przypomnień
  checkReminders();
  setInterval(checkReminders, 30000);
});
