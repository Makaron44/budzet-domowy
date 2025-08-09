// ====== Elementy z DOM ======
const descInput = document.getElementById('desc');
const categoryInput = document.getElementById('category');
const amountInput = document.getElementById('amount');
const historyList = document.getElementById('history');
const totalSpan = document.getElementById('total');
const incomeBtn = document.getElementById('income-btn');
const expenseBtn = document.getElementById('expense-btn');

const exportCsvBtn = document.getElementById('export-csv-btn');
const exportPdfBtn  = document.getElementById('export-pdf-btn');

// --- Filtry (opcjonalnie) ---
const filterType = document.getElementById('filter-type');         // all | income | expense
const filterCategory = document.getElementById('filter-category');  // all | nazwa kategorii
const filterResetBtn = document.getElementById('filter-reset');
const filteredSummary = document.getElementById('filtered-summary');
const filteredTotalSpan = document.getElementById('filtered-total');

// --- „Wykresy” CSS (kontenery w HTML) ---
const chartCatsRoot   = document.getElementById('chart-categories'); // Wydatki wg kategorii
const chartMonthsRoot = document.getElementById('chart-months');     // Bilans miesięczny

// --- Przełącznik motywu ---
const themeToggleBtn = document.getElementById('theme-toggle');

// ====== Stan + localStorage (historia) ======
const STORAGE_KEY = 'budget_entries_v1';
let entries = [];

// Zapis / odczyt wpisów
function saveEntries() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)); }
  catch (e) { console.warn('Nie udało się zapisać do localStorage:', e); }
}
function loadEntries() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (Array.isArray(data)) {
      entries = data
        .filter(e => e && typeof e.desc === 'string' && typeof e.category === 'string' && typeof e.amount === 'number')
        .map(e => ({ desc: e.desc, category: e.category, amount: e.amount, id: e.id || Date.now() }));
    }
  } catch (e) { console.warn('Nie udało się odczytać z localStorage:', e); }
}

// Dodawanie / usuwanie wpisów
function addEntry(type) {
  const desc = descInput.value.trim();
  const category = categoryInput.value;
  let amountStr = (amountInput.value || '').replace(',', '.');
  let amount = parseFloat(amountStr);

  if (!desc || !category || isNaN(amount) || amount <= 0) return;
  if (type === 'expense') amount = -amount;

  entries.push({ desc, category, amount, id: Date.now() });
  saveEntries();

  descInput.value = '';
  categoryInput.selectedIndex = 0;
  amountInput.value = '';

  updateUI(true);
}
incomeBtn?.addEventListener('click', () => addEntry('income'));
expenseBtn?.addEventListener('click', () => addEntry('expense'));

function removeEntry(index) {
  if (index < 0) return;
  entries.splice(index, 1);
  saveEntries();
  updateUI();
}

/* ===============================
   FILTROWANIE
   =============================== */
function getFilteredEntries() {
  let list = entries.slice();

  const type = filterType?.value || 'all';
  if (type === 'income')  list = list.filter(e => e.amount > 0);
  if (type === 'expense') list = list.filter(e => e.amount < 0);

  const cat = filterCategory?.value || 'all';
  if (cat !== 'all') list = list.filter(e => e.category === cat);

  return list;
}
filterType?.addEventListener('change', () => updateUI());
filterCategory?.addEventListener('change', () => updateUI());
filterResetBtn?.addEventListener('click', () => {
  if (filterType) filterType.value = 'all';
  if (filterCategory) filterCategory.value = 'all';
  updateUI();
});

/* ===============================
   „WYKRESY” CSS — RENDER
   =============================== */
function renderCategoryChart() {
  if (!chartCatsRoot) return;
  chartCatsRoot.innerHTML = '';

  // Suma WYDATKÓW (ujemne) per kategoria
  const sums = {};
  entries.forEach(e => {
    if (e.amount < 0) {
      const cat = e.category || 'Inne';
      const val = Math.abs(e.amount);
      sums[cat] = (sums[cat] || 0) + val;
    }
  });

  const cats = Object.keys(sums);
  if (cats.length === 0) {
    chartCatsRoot.innerHTML = `<div class="chart-empty">Brak wydatków do pokazania.</div>`;
    return;
  }

  const max = Math.max(...cats.map(c => sums[c]));
  cats.sort((a,b) => sums[b] - sums[a]); // większe na górze

  cats.forEach(cat => {
    const percent = max > 0 ? Math.round((sums[cat] / max) * 100) : 0;
    const row = document.createElement('div');
    row.className = 'chart-row';
    row.innerHTML = `
      <div class="chart-label anim-label">${cat}</div>
      <div class="chart-bar">
        <div class="chart-fill expense" style="width:${percent}%"></div>
      </div>
      <div class="chart-value anim-value">-${sums[cat].toFixed(2)} zł</div>
    `;
    chartCatsRoot.appendChild(row);
  });
}

function yyyymm(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}
function labelMonth(ym) {
  const [y,m] = ym.split('-');
  const d = new Date(Number(y), Number(m)-1, 1);
  return d.toLocaleDateString(undefined, { month:'short', year:'numeric' });
}

function renderMonthlyChart() {
  if (!chartMonthsRoot) return;
  chartMonthsRoot.innerHTML = '';

  // Agregacja po miesiącach
  const map = new Map();
  entries.forEach(e => {
    const key = yyyymm(e.id || Date.now());
    const cur = map.get(key) || { income:0, expense:0, saldo:0 };
    if (e.amount >= 0) cur.income += e.amount;
    else cur.expense += Math.abs(e.amount);
    cur.saldo += e.amount;
    map.set(key, cur);
  });

  if (map.size === 0) {
    chartMonthsRoot.innerHTML = `<div class="chart-empty">Brak danych miesięcznych.</div>`;
    return;
  }

  const rows = [...map.entries()].sort((a,b) => a[0].localeCompare(b[0]));

  let max = 0;
  rows.forEach(([,v]) => {
    max = Math.max(max, v.income, v.expense, Math.abs(v.saldo));
  });
  if (max === 0) max = 1;

  rows.forEach(([ym, v]) => {
    const pIncome  = Math.round((v.income / max) * 100);
    const pExpense = Math.round((v.expense / max) * 100);
    const pSaldo   = Math.round((Math.abs(v.saldo) / max) * 100);

    const row = document.createElement('div');
    row.className = 'chart-row chart-month';
    row.innerHTML = `
      <div class="chart-label anim-label">${labelMonth(ym)}</div>
      <div class="chart-bars3">
        <div class="chart-bar thin"><div class="chart-fill income"  style="width:${pIncome}%"></div></div>
        <div class="chart-bar thin"><div class="chart-fill expense" style="width:${pExpense}%"></div></div>
        <div class="chart-bar thin"><div class="chart-fill saldo ${v.saldo>=0?'pos':'neg'}" style="width:${pSaldo}%"></div></div>
      </div>
      <div class="chart-values">
        <span class="v income anim-value">+${v.income.toFixed(2)}</span>
        <span class="v expense anim-value">-${v.expense.toFixed(2)}</span>
        <span class="v saldo ${v.saldo>=0?'pos':'neg'} anim-value">=${v.saldo>=0?'+':''}${v.saldo.toFixed(2)}</span>
      </div>
    `;
    chartMonthsRoot.appendChild(row);
  });
}

/* ===============================
   ANIMACJE: przygotowanie i start „na widoku”
   =============================== */
function prepareBarsForAnimation(root) {
  if (!root) return;
  root.classList.remove('in-view');

  const rows = Array.from(root.querySelectorAll('.chart-row'));
  rows.forEach((row, idx) => {
    row.style.setProperty('--row-delay', (idx * 200) + 'ms'); // fala: 0ms, 150ms, 300ms...
  });

  // słupki — wolniej i z opóźnieniem wg wiersza
  root.querySelectorAll('.chart-fill').forEach(el => {
    el.classList.remove('animate');
    el.style.transition = 'transform 2.2s ease-out var(--row-delay)';
  });

  // etykiety — fade + lekki wjazd
  root.querySelectorAll('.anim-label').forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(6px) scale(.98)';
    el.style.transition = 'opacity .7s ease calc(var(--row-delay) + 150ms), transform .7s ease calc(var(--row-delay) + 150ms)';
  });

  // wartości — fade + „skok”
  root.querySelectorAll('.anim-value').forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(6px) scale(.98)';
    el.style.transition = 'opacity .7s ease calc(var(--row-delay) + 320ms), transform .7s cubic-bezier(.2,.8,.2,1) calc(var(--row-delay) + 320ms)';
  });
}

function observeAnimateOnView(root) {
  if (!root) return;
  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        root.classList.add('in-view'); // uruchamia CSS etykiet/wartości
        // uruchom słupki
        root.querySelectorAll('.chart-fill').forEach(el => el.classList.add('animate'));
        // odpal fade-in tekstów (przez .in-view + transition ustawione wyżej)
        root.querySelectorAll('.anim-label, .anim-value').forEach(el => {
          requestAnimationFrame(() => {
            el.style.opacity = '1';
            el.style.transform = 'none';
          });
        });
        obs.disconnect(); // animuj tylko raz
      }
    });
  }, { threshold: 0.3 }); // 30% kontenera w widoku
  observer.observe(root);
}

/* ===============================
   RENDER HISTORII + SUM + WYKRESY
   =============================== */
function updateUI(animateLastAdded = false) {
  historyList.innerHTML = '';

  const filtered = getFilteredEntries();

  const reversed = filtered.slice().reverse();
  reversed.forEach((entry, i) => {
    const li = document.createElement('li');

    const info = document.createElement('div');
    const amountClass = entry.amount >= 0 ? 'positive' : 'negative';
    const sign = entry.amount > 0 ? '+' : '';
    info.innerHTML = `<strong>[${entry.category}]</strong> ${entry.desc}: 
      <span class="amount ${amountClass}">${sign}${entry.amount} zł</span>`;

    const removeBtn = document.createElement('button');
    removeBtn.innerHTML = '🗑️';
    removeBtn.title = 'Usuń wpis';

    // znajdź indeks oryginalny (bo reversed/filtry to te same referencje obiektów)
    const originalIndex = entries.lastIndexOf(entry);

    removeBtn.onclick = () => {
      li.classList.add('removing');
      setTimeout(() => removeEntry(originalIndex), 250);
    };

    if (animateLastAdded && i === 0) li.classList.add('added');

    li.appendChild(info);
    li.appendChild(removeBtn);
    historyList.appendChild(li);
  });

  // suma globalna
  const total = entries.reduce((sum, e) => sum + e.amount, 0);
  totalSpan.textContent = total.toFixed(2);
  totalSpan.style.color = total >= 0 ? 'var(--positive, green)' : 'var(--negative, red)';

  // suma po filtrze (pokazuj gdy filtr aktywny)
  const isDefault =
    (!filterType || filterType.value === 'all') &&
    (!filterCategory || filterCategory.value === 'all');

  if (!isDefault && filteredSummary && filteredTotalSpan) {
    const filteredSum = filtered.reduce((s, e) => s + e.amount, 0);
    filteredTotalSpan.textContent = filteredSum.toFixed(2);
    filteredTotalSpan.style.color = filteredSum >= 0 ? 'var(--positive, green)' : 'var(--negative, red)';
    filteredSummary.style.display = 'block';
  } else if (filteredSummary) {
    filteredSummary.style.display = 'none';
  }

  // Wykresy
  renderCategoryChart();
  renderMonthlyChart();

  // Przygotuj animacje i start dopiero na widoku
  prepareBarsForAnimation(chartCatsRoot);
  prepareBarsForAnimation(chartMonthsRoot);
  observeAnimateOnView(chartCatsRoot);
  observeAnimateOnView(chartMonthsRoot);
}

/* ===============================
   EKSPORT CSV
   =============================== */
function exportToCSV() {
  if (!entries.length) {
    showActionToast ? showActionToast({ text: 'Brak danych do eksportu.', warn: true }) : alert('Brak danych do eksportu.');
    return;
  }

  let csv = 'Data,Kategoria,Opis,Kwota\n';
  entries.forEach(e => {
    const date = new Date(e.id).toLocaleString();
    const line = `"${date}","${e.category}","${String(e.desc).replace(/"/g,'""')}",${e.amount}`;
    csv += line + '\n';
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = 'budzet.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
exportCsvBtn?.addEventListener('click', exportToCSV);

/* ===============================
   EKSPORT PDF (jsPDF)
   =============================== */
/* ========== PDF: ładny układ + polskie znaki (Roboto) ========== */

// helpers
function abToBase64(ab) {
  let binary = '';
  const bytes = new Uint8Array(ab);
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function addLocalFont(doc, path, family, style='normal') {
  const res = await fetch(path); // lokalnie: /fonts/Roboto-Regular.ttf
  if (!res.ok) throw new Error('Nie mogę pobrać fontu: ' + path);
  const b64 = abToBase64(await res.arrayBuffer());
  const filename = path.split('/').pop();
  doc.addFileToVFS(filename, b64);
  doc.addFont(filename, family, style);
}

// formatuj kwotę z separatorem i dwoma miejscami
function money(n) {
  const sign = n >= 0 ? '+' : '−';
  return `${sign}${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

async function exportToPDF() {
  if (!entries.length) {
    (typeof showActionToast === 'function')
      ? showActionToast({ text: 'Brak danych do eksportu.', warn: true })
      : alert('Brak danych do eksportu.');
    return;
  }

  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) {
    alert('Nie można załadować generatora PDF. Sprawdź tag <script> do jsPDF.');
    return;
  }

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });

  // 1) czcionki z polskimi znakami
  try {
    // w exportToPDF przed rysowaniem:
await addLocalFont(doc, './fonts/Roboto-Regular.ttf', 'Roboto', 'normal');
await addLocalFont(doc, './fonts/Roboto-Bold.ttf',    'Roboto', 'bold');
doc.setFont('Roboto', 'normal');
  } catch (e) {
    console.warn('Font Roboto nie został wczytany, używam domyślnej:', e);
  }

  // 2) stałe i kolory
  const margin = 56;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const tableTop = 120;
  const rowH = 22;

  const colorText = [34, 34, 34];
  const colorMuted = [110, 117, 126];
  const colorLine = [210, 215, 221];
  const colorHeaderBg = [245, 247, 250];
  const green = [25, 153, 76];
  const red = [229, 57, 53];
  const blue = [33, 150, 243];

  // 3) nagłówek
  doc.setFontSize(22);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(...colorText);
  doc.text('Budżet domowy Macieja', margin, 64);

  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(...colorMuted);
  doc.text(`Wygenerowano: ${new Date().toLocaleString()}`, margin, 84);

  // 4) nagłówki kolumn
  const col = {
    date:  margin,
    cat:   margin + 140,
    desc:  margin + 260,
    amtR:  pageW - margin
  };

  // tło pod nagłówkiem
  doc.setFillColor(...colorHeaderBg);
  doc.rect(margin - 8, tableTop - 18, pageW - margin * 2 + 16, 28, 'F');

  doc.setFontSize(12);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(...colorText);
  doc.text('Data',     col.date, tableTop);
  doc.text('Kategoria',col.cat,  tableTop);
  doc.text('Opis',     col.desc, tableTop);
  doc.text('Kwota',    col.amtR, tableTop, { align: 'right' });

  // linia pod nagłówkiem
  doc.setDrawColor(...colorLine);
  doc.setLineWidth(0.8);
  doc.line(margin, tableTop + 6, pageW - margin, tableTop + 6);

  // 5) wiersze
  doc.setFontSize(11);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(...colorText);

  let y = tableTop + 26;
  const rows = entries.slice();

  rows.forEach((e, idx) => {
    if (y > pageH - 96) {
      doc.addPage();
      y = 64;

      // przenieś nagłówki na nową stronę
      doc.setFillColor(...colorHeaderBg);
      doc.rect(margin - 8, y - 18, pageW - margin * 2 + 16, 28, 'F');

      doc.setFont(undefined, 'bold');
      doc.setFontSize(12);
      doc.setTextColor(...colorText);
      doc.text('Data',     col.date, y);
      doc.text('Kategoria',col.cat,  y);
      doc.text('Opis',     col.desc, y);
      doc.text('Kwota',    col.amtR, y, { align: 'right' });

      doc.setDrawColor(...colorLine);
      doc.setLineWidth(0.8);
      doc.line(margin, y + 6, pageW - margin, y + 6);

      doc.setFont(undefined, 'normal');
      doc.setFontSize(11);
      doc.setTextColor(...colorText);
      y += 26;
    }

    // zebra
    if (idx % 2 === 0) {
      doc.setFillColor(252, 253, 255);
      doc.rect(margin - 8, y - 16, pageW - margin * 2 + 16, rowH, 'F');
    }

    const dateStr = new Date(e.id).toLocaleString();
    const amountStr = money(e.amount);

    // dane
    doc.text(dateStr, col.date, y);
    doc.text(e.category, col.cat, y);

    // opis — przytnij szerokość
    const maxDescW = (col.amtR - 12) - col.desc;
    const descLines = doc.splitTextToSize(String(e.desc), maxDescW);
    doc.text(descLines[0], col.desc, y);

    // kwota prawa, kolor +/- 
    if (e.amount >= 0) doc.setTextColor(...green); else doc.setTextColor(...red);
    doc.text(`${amountStr} zł`, col.amtR, y, { align: 'right' });
    doc.setTextColor(...colorText);

    // kolejne linie opisu pod spodem
    for (let i = 1; i < descLines.length; i++) {
      y += rowH - 6;
      doc.text(descLines[i], col.desc, y);
    }
    y += rowH;
  });

  // 6) suma w ładnym boxie po prawej
  const total = entries.reduce((s, e) => s + e.amount, 0);
  if (y > pageH - 96) { doc.addPage(); y = 64; }

  const sumBoxW = 220, sumBoxH = 40;
  const boxX = pageW - margin - sumBoxW;
  const boxY = y + 8;

  doc.setFillColor(245, 250, 245);
  doc.setDrawColor(220, 235, 222);
  doc.roundedRect(boxX, boxY, sumBoxW, sumBoxH, 6, 6, 'FD');

  doc.setFont(undefined, 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...(total >= 0 ? green : red));
  doc.text(`Suma: ${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`,
           boxX + sumBoxW/2, boxY + sumBoxH/2 + 5, { align: 'center' });

  // 7) stopka
  doc.setFontSize(9);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(...colorMuted);
  doc.text('Budżet domowy – wygenerowano w przeglądarce', margin, pageH - 24);

  doc.save('budzet.pdf');
}

// podmień nasłuch:
exportPdfBtn?.addEventListener('click', () => {
  // pozwól pokazać banerek, jeśli pobieranie czcionki chwilę trwa
  if (typeof showActionToast === 'function') {
    showActionToast({ text: 'Przygotowuję PDF…', onOk: null, timeout: 2000 });
  }
  exportToPDF().catch(err => {
    console.error(err);
    alert('Nie udało się wygenerować PDF.');
  });
});


/* ===============================
   PRZYPOMNIENIA (cykliczne + stały toast)
   =============================== */
const reminderForm = document.getElementById('reminder-form');
const reminderText = document.getElementById('reminder-text');
const reminderDate = document.getElementById('reminder-date');
const reminderRepeat = document.getElementById('reminder-repeat');
const reminderList = document.getElementById('reminder-list');
const toastRoot = document.getElementById('toast');

const REMINDERS_KEY = 'budget_reminders_v3';
let reminders = [];

/* ---- Toasty akcyjne (2 przyciski) ---- */
let toastOpen = false;
function showActionToast({ text, onPaid, onOk, warn = false, timeout = 0 }) {
  if (!toastRoot) { alert(text); if (onOk) onOk(); return; }
  toastRoot.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'toast-msg' + (warn ? ' warn' : '');
  const span = document.createElement('span');
  span.textContent = text;

  const right = document.createElement('div');
  right.style.display = 'flex';
  right.style.gap = '8px';

  if (onPaid) {
    const paid = document.createElement('button');
    paid.className = 'toast-close';
    paid.textContent = 'Zapłacone ✔️';
    paid.onclick = () => { hideToast(); onPaid && onPaid(); };
    right.appendChild(paid);
  }

  const ok = document.createElement('button');
  ok.className = 'toast-close';
  ok.textContent = 'OK';
  ok.onclick = () => { hideToast(); onOk && onOk(); };

  box.appendChild(span);
  box.appendChild(right);
  right.appendChild(ok);

  toastRoot.appendChild(box);
  toastRoot.style.display = 'block';
  toastOpen = true;

  if (timeout && timeout > 0) {
    setTimeout(() => { if (toastOpen) { hideToast(); onOk && onOk(); } }, timeout);
  }
}
function hideToast() {
  toastRoot.style.display = 'none';
  toastRoot.innerHTML = '';
  toastOpen = false;
}

/* Storage przypomnień */
function saveReminders() { localStorage.setItem(REMINDERS_KEY, JSON.stringify(reminders)); }
function loadReminders() {
  try {
    const raw = localStorage.getItem(REMINDERS_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (Array.isArray(data)) reminders = data;
  } catch {}
}

/* Helpers przypomnień */
function formatDateNoSeconds(iso) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  });
}
function nextDateISO(iso, repeat) {
  const d = new Date(iso);
  if (repeat === 'weekly') d.setDate(d.getDate() + 7);
  else if (repeat === 'monthly') d.setMonth(d.getMonth() + 1);
  else if (repeat === 'yearly') d.setFullYear(d.getFullYear() + 1);
  return d.toISOString();
}
function cryptoId() { return 'r' + Math.random().toString(36).slice(2) + Date.now().toString(36); }

/* Zapłacone (z listy i z toastu) */
function handlePaid(rem) {
  let input = prompt(`Kwota do zapłaty za: ${rem.text}`, "0");
  if (input === null) return; // anulowano
  let amount = parseFloat(String(input).replace(',', '.'));
  if (isNaN(amount) || amount <= 0) {
    showActionToast({ text: 'Podaj poprawną kwotę (większą od 0).', warn: true, onOk: null });
    return;
  }
  // wpis do historii
  entries.push({ desc: rem.text, category: 'Rachunki', amount: -Math.abs(amount), id: Date.now() });
  saveEntries();
  updateUI(true);

  acknowledgeReminder(rem); // po zapłacie – potwierdzamy
  showActionToast({ text: `Dodano wydatek: ${rem.text} (−${amount.toFixed(2)} zł)` });
}

/* Potwierdzenie (OK lub po „Zapłacone”) */
function acknowledgeReminder(rem) {
  const now = Date.now();
  if (rem.repeat === 'once') {
    reminders = reminders.filter(x => x.id !== rem.id);
  } else {
    let next = nextDateISO(rem.date, rem.repeat);
    while (new Date(next).getTime() <= now) next = nextDateISO(next, rem.repeat);
    rem.date = next;
    delete rem.awaitingAck;
  }
  saveReminders();
  updateReminderUI();
}

/* UI przypomnień */
function updateReminderUI() {
  reminderList.innerHTML = '';
  reminders.sort((a, b) => new Date(a.date) - new Date(b.date));
  reminders.forEach(r => {
    const li = document.createElement('li');

    const info = document.createElement('div');
    info.className = 'rem-info';
    const title = document.createElement('div');
    title.textContent = r.text + (r.awaitingAck ? ' (oczekuje potwierdzenia)' : '');
    const meta = document.createElement('div');
    meta.className = 'rem-meta';
    const badge = r.repeat !== 'once'
      ? `<span class="rem-badge">${r.repeat === 'monthly' ? 'Co miesiąc' : r.repeat === 'weekly' ? 'Co tydzień' : 'Co rok'}</span>`
      : '';
    meta.innerHTML = `${formatDateNoSeconds(r.date)} ${badge}`;
    info.appendChild(title);
    info.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'rem-actions';

    const paidBtn = document.createElement('button');
    paidBtn.className = 'btn-paid';
    paidBtn.textContent = 'Zapłacone ✔️';
    paidBtn.onclick = () => handlePaid(r);

    const delBtn = document.createElement('button');
    delBtn.textContent = 'Usuń 🗑️';
    delBtn.onclick = () => {
      reminders = reminders.filter(x => x.id !== r.id);
      saveReminders(); updateReminderUI();
    };

    actions.appendChild(paidBtn);
    actions.appendChild(delBtn);

    li.appendChild(info);
    li.appendChild(actions);
    reminderList.appendChild(li);
  });
}

/* Kolejkowanie toastów przypomnień (po jednym naraz) */
let reminderQueue = [];
let processingQueue = false;

function enqueueReminderToast(rem) {
  reminderQueue.push(rem);
  if (!processingQueue) processQueue();
}
function processQueue() {
  if (processingQueue) return;
  if (reminderQueue.length === 0) { processingQueue = false; return; }
  processingQueue = true;

  const r = reminderQueue.shift();
  if ('Notification' in window && Notification.permission === 'granted') {
    try { new Notification(`Przypomnienie: ${r.text}`); } catch {}
  }

  showActionToast({
    text: `Przypomnienie: ${r.text}`,
    warn: true,
    timeout: 0, // stały baner
    onPaid: () => { handlePaid(r); processingQueue = false; processQueue(); },
    onOk:   () => { acknowledgeReminder(r); processingQueue = false; processQueue(); }
  });
}

/* Sprawdzanie terminów – NIC nie usuwamy automatycznie */
function checkReminders() {
  const now = Date.now();
  let changed = false;

  reminders.forEach(r => {
    const due = new Date(r.date).getTime();
    if (due <= now) {
      if (!r.awaitingAck) { r.awaitingAck = true; changed = true; }
      enqueueReminderToast(r); // pokaż nawet po odświeżeniu
    }
  });

  if (changed) {
    saveReminders();
    updateReminderUI();
  }
}
setInterval(checkReminders, 30000);

// Dodawanie przypomnień
reminderForm?.addEventListener('submit', () => {
  const text = reminderText.value.trim();
  const dateVal = reminderDate.value; // lokalne 'YYYY-MM-DDTHH:MM'
  const repeat = reminderRepeat?.value || 'once';
  if (!text || !dateVal) return;

  const local = new Date(dateVal);
  const iso = local.toISOString();

  reminders.push({ id: cryptoId(), text, date: iso, repeat });
  saveReminders();
  updateReminderUI();

  reminderText.value = '';
  reminderDate.value = '';
  if (reminderRepeat) reminderRepeat.value = 'once';

  showActionToast({ text: `Dodano przypomnienie: ${text} – ${formatDateNoSeconds(iso)}` });
});

/* ====== Start ====== */
document.addEventListener('DOMContentLoaded', () => {
  // Historia/wpisy
  loadEntries();
  updateUI();

  // Przypomnienia
  loadReminders();
  updateReminderUI();
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
  checkReminders(); // pokaż oczekujące od razu

  // Motyw – przywróć zapisany (opcjonalnie)
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'dark') {
    document.body.classList.add('dark');
    if (themeToggleBtn) themeToggleBtn.textContent = '☀️ Tryb jasny';
  }
});

// Przełącznik motywu – zapamiętaj wybór
themeToggleBtn?.addEventListener('click', () => {
  document.body.classList.toggle('dark');
  const isDark = document.body.classList.contains('dark');
  themeToggleBtn.textContent = isDark ? '☀️ Tryb jasny' : '🌙 Tryb ciemny';
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
});
