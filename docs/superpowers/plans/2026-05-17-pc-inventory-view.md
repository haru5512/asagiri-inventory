# PC在庫管理画面 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a PC-only inventory view page with 3 tabs (stock summary, lot expiry, transaction history), client-side filtering, and print support.

**Architecture:** New standalone page (`inventory.html`) separate from the mobile PWA. Shares `config.js` for API URL. Data fetched once from GAS API per tab, then filtered client-side for instant response. Print via `window.print()` with `@media print` CSS. All DOM manipulation uses safe methods (textContent, createElement) — no innerHTML.

**Tech Stack:** Vanilla JS, HTML/CSS, GAS Web App API, localStorage (shared config)

**Note:** No test framework — manual browser verification. GAS APIs (getStockSummary, getLotList, getTransactionHistory) may not exist yet; the page handles empty responses gracefully.

---

## File Map

| File | Responsibility | Action |
|------|---------------|--------|
| `inventory.html` | PC management page HTML | Create |
| `inventory.js` | Data fetch, tabs, filtering, print logic | Create |
| `inventory.css` | PC layout + print styles | Create |
| `config.js` | Shared API URL config | No change (already exists) |

---

### Task 1: HTML骨格 + CSS基本レイアウト

**Files:**
- Create: `inventory.html`
- Create: `inventory.css`

- [ ] **Step 1: Create inventory.html**

```html
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Asagiri Inventory - 在庫管理</title>
  <link rel="stylesheet" href="./inventory.css">
</head>
<body>
  <div class="page">
    <header class="page-header">
      <h1>Asagiri Inventory - 在庫管理</h1>
      <button class="btn-print" onclick="window.print()">印刷</button>
    </header>

    <nav class="tabs">
      <button class="tab active" data-tab="stock" onclick="Inv.switchTab('stock')">現在在庫</button>
      <button class="tab" data-tab="lots" onclick="Inv.switchTab('lots')">賞味期限</button>
      <button class="tab" data-tab="history" onclick="Inv.switchTab('history')">入出庫履歴</button>
    </nav>

    <div class="filters" id="filters"></div>

    <div class="table-container">
      <table id="data-table">
        <thead id="table-head"></thead>
        <tbody id="table-body"></tbody>
      </table>
      <div id="empty-message" class="empty-message" style="display:none;">
        データがありません。「データ取得」ボタンを押してください。
      </div>
    </div>

    <footer class="page-footer">
      <span id="row-count">表示: 0件</span>
    </footer>
  </div>

  <script src="./config.js"></script>
  <script src="./inventory.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create inventory.css**

```css
/* PC Inventory View */
:root {
  --primary: #2c7a3f;
  --primary-dark: #1e5a2d;
  --text: #333;
  --text-light: #666;
  --bg: #f5f5f5;
  --card-bg: #fff;
  --border: #ddd;
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Hiragino Sans', 'Noto Sans JP', sans-serif;
  font-size: 14px;
  color: var(--text);
  background: var(--bg);
}

.page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 16px 24px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 0;
  border-bottom: 2px solid var(--primary);
}

.page-header h1 {
  font-size: 20px;
  color: var(--primary-dark);
}

.btn-print {
  padding: 8px 20px;
  background: var(--primary);
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.btn-print:hover { opacity: 0.9; }

.tabs {
  display: flex;
  gap: 0;
  margin-top: 16px;
  border-bottom: 2px solid var(--border);
}

.tab {
  padding: 10px 24px;
  background: none;
  border: none;
  border-bottom: 3px solid transparent;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-light);
  cursor: pointer;
  transition: all 0.2s;
}

.tab:hover { color: var(--text); }

.tab.active {
  color: var(--primary);
  border-bottom-color: var(--primary);
}

.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: flex-end;
  padding: 16px 0;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.filter-group label {
  font-size: 12px;
  color: var(--text-light);
  font-weight: 600;
}

.filter-group input,
.filter-group select {
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 4px;
  font-size: 13px;
  outline: none;
}

.filter-group input:focus,
.filter-group select:focus {
  border-color: var(--primary);
}

.btn-fetch {
  padding: 7px 16px;
  background: var(--primary);
  color: #fff;
  border: none;
  border-radius: 4px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}

.btn-fetch:hover { opacity: 0.9; }
.btn-fetch:disabled { opacity: 0.5; cursor: not-allowed; }

.table-container {
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow-x: auto;
}

table { width: 100%; border-collapse: collapse; }

thead th {
  position: sticky;
  top: 0;
  background: var(--primary);
  color: #fff;
  padding: 10px 12px;
  text-align: left;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
}

tbody td {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  font-size: 13px;
  white-space: nowrap;
}

tbody tr:hover { background: #f0f7f1; }
tbody tr:nth-child(even) { background: #fafafa; }
tbody tr:nth-child(even):hover { background: #f0f7f1; }

.empty-message {
  padding: 40px;
  text-align: center;
  color: var(--text-light);
}

.page-footer {
  padding: 12px 0;
  font-size: 13px;
  color: var(--text-light);
}

@media print {
  body { background: #fff; font-size: 11px; }
  .page { max-width: none; padding: 0; }
  .page-header { border-bottom: 1px solid #000; }
  .btn-print, .tabs, .filters { display: none !important; }
  .table-container { border: none; overflow: visible; }
  thead th {
    background: #eee !important;
    color: #000 !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  tbody td { border-bottom: 1px solid #ccc; }
  tr { page-break-inside: avoid; }
  @page { size: A4 landscape; margin: 10mm; }
}
```

- [ ] **Step 3: Verify in browser**

Open `inventory.html`. Verify: header, tabs, empty table, print button opens dialog.

- [ ] **Step 4: Commit**

```bash
git add inventory.html inventory.css
git commit -m "feat: create PC inventory view page skeleton"
```

---

### Task 2: inventory.js — タブ切替 + フィルタ + データ取得

**Files:**
- Create: `inventory.js`

- [ ] **Step 1: Create inventory.js**

All DOM manipulation uses safe methods (createElement, textContent, appendChild). No innerHTML.

```javascript
const Inv = (() => {
  let currentTab = 'stock';
  let rawData = { stock: [], lots: [], history: [] };

  // --- DOM helper ---
  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (k === 'className') node.className = v;
        else if (k.startsWith('on')) node.addEventListener(k.slice(2).toLowerCase(), v);
        else node.setAttribute(k, v);
      }
    }
    for (const child of children) {
      if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else if (child) node.appendChild(child);
    }
    return node;
  }

  // --- API ---
  function getApiUrl() {
    return localStorage.getItem('WEB_APP_URL') || CONFIG.WEB_APP_URL;
  }

  function isApiConfigured() {
    const url = getApiUrl();
    return url && !url.includes('\u300a') && url.startsWith('https://');
  }

  // --- Tab config ---
  const TAB_CONFIG = {
    stock: {
      api: 'getStockSummary',
      columns: [
        { key: '品目ID', label: '品目ID' },
        { key: '品名', label: '品名' },
        { key: '大カテゴリ', label: 'カテゴリ' },
        { key: '数量', label: '数量', align: 'right' },
        { key: '単位', label: '単位' },
        { key: '場所名', label: '場所' },
      ],
      filters: ['category', 'itemName', 'location'],
    },
    lots: {
      api: 'getLotList',
      columns: [
        { key: '品目ID', label: '品目ID' },
        { key: '品名', label: '品名' },
        { key: 'ロットID', label: 'ロットID' },
        { key: 'ロット番号', label: 'ロット番号' },
        { key: '残数量', label: '残数量', align: 'right' },
        { key: '賞味期限', label: '賞味期限' },
        { key: 'ステータス', label: 'ステータス' },
      ],
      filters: ['category', 'itemName', 'expiryDays'],
    },
    history: {
      api: 'getTransactionHistory',
      columns: [
        { key: '日時', label: '日時' },
        { key: '区分', label: '区分' },
        { key: '品目ID', label: '品目ID' },
        { key: '品名', label: '品名' },
        { key: '数量', label: '数量', align: 'right' },
        { key: '場所名', label: '場所' },
        { key: 'Gmail', label: '担当者' },
      ],
      filters: ['category', 'itemName', 'period', 'opType'],
    },
  };

  // --- Filter builders (safe DOM) ---
  function buildSelect(id, options) {
    const select = el('select', { id: id });
    for (const opt of options) {
      select.appendChild(el('option', { value: opt.value }, opt.label));
    }
    return select;
  }

  const FILTER_BUILDERS = {
    category: () => el('div', { className: 'filter-group' },
      el('label', {}, 'カテゴリ'),
      buildSelect('f-category', [{ value: '', label: 'すべて' }])
    ),
    itemName: () => el('div', { className: 'filter-group' },
      el('label', {}, '品目名'),
      el('input', { type: 'text', id: 'f-item-name', placeholder: '検索...' })
    ),
    location: () => el('div', { className: 'filter-group' },
      el('label', {}, '場所'),
      buildSelect('f-location', [{ value: '', label: 'すべて' }])
    ),
    expiryDays: () => el('div', { className: 'filter-group' },
      el('label', {}, '賞味期限'),
      buildSelect('f-expiry-days', [
        { value: '', label: 'すべて' },
        { value: '7', label: '7日以内' },
        { value: '14', label: '14日以内' },
        { value: '30', label: '30日以内' },
        { value: '60', label: '60日以内' },
        { value: '90', label: '90日以内' },
      ])
    ),
    period: () => {
      const group = el('div', { className: 'filter-group' },
        el('label', {}, '期間')
      );
      const wrapper = document.createElement('span');
      wrapper.appendChild(el('input', { type: 'date', id: 'f-date-from' }));
      wrapper.appendChild(document.createTextNode(' ～ '));
      wrapper.appendChild(el('input', { type: 'date', id: 'f-date-to' }));
      group.appendChild(wrapper);
      return group;
    },
    opType: () => el('div', { className: 'filter-group' },
      el('label', {}, '区分'),
      buildSelect('f-op-type', [
        { value: '', label: 'すべて' },
        { value: '入庫', label: '入庫' },
        { value: '出庫消費', label: '出庫消費' },
        { value: '廃棄', label: '廃棄' },
        { value: '移動', label: '移動' },
        { value: '棚卸調整', label: '棚卸調整' },
      ])
    ),
  };

  // --- Init ---
  function init() {
    renderFilters();
    renderTableHead();
  }

  // --- Tab ---
  function switchTab(tab) {
    currentTab = tab;
    document.querySelectorAll('.tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === tab);
    });
    renderFilters();
    renderTableHead();
    renderTableBody();
  }

  // --- Render filters ---
  function renderFilters() {
    const config = TAB_CONFIG[currentTab];
    const container = document.getElementById('filters');
    container.textContent = '';
    for (const f of config.filters) {
      if (FILTER_BUILDERS[f]) container.appendChild(FILTER_BUILDERS[f]());
    }
    const fetchBtn = el('button', {
      className: 'btn-fetch', id: 'btn-fetch', onClick: fetchData
    }, 'データ取得');
    container.appendChild(fetchBtn);
    bindFilterEvents();
  }

  // --- Render table head ---
  function renderTableHead() {
    const config = TAB_CONFIG[currentTab];
    const tr = document.createElement('tr');
    for (const col of config.columns) {
      const th = document.createElement('th');
      th.textContent = col.label;
      if (col.align) th.style.textAlign = col.align;
      tr.appendChild(th);
    }
    const thead = document.getElementById('table-head');
    thead.textContent = '';
    thead.appendChild(tr);
  }

  // --- Bind filter events ---
  function bindFilterEvents() {
    const inputs = document.querySelectorAll('#filters input, #filters select');
    inputs.forEach(input => {
      input.addEventListener('input', () => renderTableBody());
      input.addEventListener('change', () => renderTableBody());
    });
  }

  // --- Render table body ---
  function renderTableBody() {
    const config = TAB_CONFIG[currentTab];
    const data = rawData[currentTab];
    const filtered = applyFilters(data);

    const tbody = document.getElementById('table-body');
    const emptyMsg = document.getElementById('empty-message');
    tbody.textContent = '';

    if (filtered.length === 0) {
      emptyMsg.style.display = 'block';
    } else {
      emptyMsg.style.display = 'none';
      for (const row of filtered) {
        const tr = document.createElement('tr');
        for (const col of config.columns) {
          const td = document.createElement('td');
          td.textContent = row[col.key] != null ? String(row[col.key]) : '';
          if (col.align) td.style.textAlign = col.align;
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      }
    }

    document.getElementById('row-count').textContent =
      '表示: ' + filtered.length + '件' +
      (data.length !== filtered.length ? ' / 全' + data.length + '件' : '');
  }

  // --- Apply filters ---
  function applyFilters(data) {
    let result = data;

    const categoryEl = document.getElementById('f-category');
    if (categoryEl && categoryEl.value) {
      result = result.filter(r => r['大カテゴリ'] === categoryEl.value);
    }

    const nameEl = document.getElementById('f-item-name');
    if (nameEl && nameEl.value) {
      const keyword = nameEl.value.toLowerCase();
      result = result.filter(r =>
        (r['品名'] || '').toLowerCase().includes(keyword) ||
        (r['品目ID'] || '').toLowerCase().includes(keyword)
      );
    }

    const locEl = document.getElementById('f-location');
    if (locEl && locEl.value) {
      result = result.filter(r =>
        r['場所名'] === locEl.value || r['場所ID'] === locEl.value
      );
    }

    const expiryEl = document.getElementById('f-expiry-days');
    if (expiryEl && expiryEl.value) {
      const days = parseInt(expiryEl.value, 10);
      const limit = new Date();
      limit.setDate(limit.getDate() + days);
      result = result.filter(r => {
        if (!r['賞味期限']) return false;
        return new Date(r['賞味期限']) <= limit;
      });
    }

    const fromEl = document.getElementById('f-date-from');
    const toEl = document.getElementById('f-date-to');
    if (fromEl && fromEl.value) {
      result = result.filter(r => r['日時'] >= fromEl.value);
    }
    if (toEl && toEl.value) {
      const toDate = toEl.value + 'T23:59:59';
      result = result.filter(r => r['日時'] <= toDate);
    }

    const opEl = document.getElementById('f-op-type');
    if (opEl && opEl.value) {
      result = result.filter(r => r['区分'] === opEl.value);
    }

    return result;
  }

  // --- Populate dynamic filter options ---
  function populateFilterOptions(data) {
    const categories = [...new Set(data.map(r => r['大カテゴリ']).filter(Boolean))].sort();
    const categoryEl = document.getElementById('f-category');
    if (categoryEl) {
      const current = categoryEl.value;
      categoryEl.textContent = '';
      categoryEl.appendChild(el('option', { value: '' }, 'すべて'));
      for (const c of categories) {
        categoryEl.appendChild(el('option', { value: c }, c));
      }
      categoryEl.value = current;
    }

    const locations = [...new Set(data.map(r => r['場所名']).filter(Boolean))].sort();
    const locEl = document.getElementById('f-location');
    if (locEl) {
      const current = locEl.value;
      locEl.textContent = '';
      locEl.appendChild(el('option', { value: '' }, 'すべて'));
      for (const l of locations) {
        locEl.appendChild(el('option', { value: l }, l));
      }
      locEl.value = current;
    }
  }

  // --- Fetch data ---
  async function fetchData() {
    if (!isApiConfigured()) {
      alert('API未設定です。スマホアプリの設定画面から Web App URL を設定してください。');
      return;
    }

    const config = TAB_CONFIG[currentTab];
    const btn = document.getElementById('btn-fetch');
    btn.disabled = true;
    btn.textContent = '取得中...';

    try {
      const url = getApiUrl() + '?action=' + config.api;
      const res = await fetch(url, { method: 'GET', redirect: 'follow' });
      const json = await res.json();

      if (!json.success) throw new Error(json.error || 'データ取得に失敗しました');

      rawData[currentTab] = json.data || [];
      populateFilterOptions(rawData[currentTab]);
      renderTableBody();
    } catch (err) {
      alert('通信エラー: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'データ取得';
    }
  }

  // --- Start ---
  init();

  return { switchTab, fetchData };
})();
```

- [ ] **Step 2: Verify in browser**

Open `inventory.html`. Verify:
- Tab switching works, filters change per tab
- "データ取得" shows alert if API not configured
- Print button opens print preview with filters hidden
- Table headers change per tab
- Empty message displays

- [ ] **Step 3: Commit**

```bash
git add inventory.js
git commit -m "feat: add inventory.js with tabs, filters, data fetch"
```

---

### Task 3: Service Worker + 作業ログ更新

**Files:**
- Modify: `sw.js`
- Modify: `作業ログ.md`

- [ ] **Step 1: Add inventory files to SW precache**

Add to the PRECACHE array in sw.js:
```javascript
  './inventory.html',
  './inventory.js',
  './inventory.css',
```

- [ ] **Step 2: Update 作業ログ.md**

Update file structure section and add PC management screen record.

- [ ] **Step 3: Commit**

```bash
git add sw.js 作業ログ.md
git commit -m "chore: update SW precache and work log for PC inventory view"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | HTML skeleton + CSS (layout + print) | inventory.html, inventory.css |
| 2 | JS: tabs, filters, API fetch, table render | inventory.js |
| 3 | SW precache + work log update | sw.js, 作業ログ.md |
