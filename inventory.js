// Asagiri Inventory - PC在庫管理画面

const Inv = (() => {
  let currentTab = 'stock';
  let rawData = { stock: [], lots: [], history: [], stocktake: [] };
  let sortKey = '';
  let sortAsc = true;

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

  // --- Util ---
  function formatDateTime(s) {
    if (!s) return '';
    try {
      const d = new Date(s);
      if (isNaN(d.getTime())) return s;
      const y = d.getFullYear();
      const mo = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const h = String(d.getHours()).padStart(2, '0');
      const mi = String(d.getMinutes()).padStart(2, '0');
      return y + '/' + mo + '/' + day + ' ' + h + ':' + mi;
    } catch (e) { return s; }
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
      api: 'getCurrentStockList',
      columns: [
        { key: '品目ID', label: '品目ID' },
        { key: '品名', label: '品名' },
        { key: '大カテゴリ', label: 'カテゴリ' },
        { key: '現在在庫数', label: '数量', align: 'right' },
        { key: '単位', label: '単位' },
        { key: 'アラート', label: 'アラート' },
      ],
      filters: ['category', 'itemName', 'location'],
    },
    lots: {
      api: 'getAllLots',
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
    stocktake: {
      api: 'getStocktakeSessions',
      columns: [
        { key: 'セッションID', label: 'セッションID' },
        { key: '開始日時', label: '開始日時' },
        { key: '担当者名', label: '担当者' },
        { key: 'ステータス', label: 'ステータス' },
        { key: 'カウント数', label: 'カウント', align: 'right' },
        { key: '差異あり数', label: '差異あり', align: 'right' },
        { key: '未カウント数', label: '未カウント', align: 'right' },
        { key: '操作', label: '' },
      ],
      filters: [],
    },
  };

  // --- Filter builders ---
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
      wrapper.appendChild(document.createTextNode(' ~ '));
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

  // --- Login ---
  function isLoggedIn() {
    return localStorage.getItem('USER_GMAIL') && localStorage.getItem('USER_PASSWORD');
  }

  function login() {
    const email = document.getElementById('login-email').value.trim();
    const pw = document.getElementById('login-password').value;
    if (!email || !email.includes('@')) {
      alert('正しいメールアドレスを入力してください。');
      return;
    }
    if (!pw) {
      alert('パスワードを入力してください。');
      return;
    }
    localStorage.setItem('USER_GMAIL', email);
    localStorage.setItem('USER_PASSWORD', pw);
    showMainPage();
  }

  function showMainPage() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('main-page').style.display = 'block';
    const userEl = document.getElementById('login-user');
    if (userEl) userEl.textContent = localStorage.getItem('USER_GMAIL') || '';
    fetchAllTabs();
  }

  // --- Init ---
  function init() {
    if (isLoggedIn()) {
      loadCacheForTab('stock');
      showMainPage();
    }
    renderFilters();
    renderTableHead();
    renderStSummary();
    renderTableBody();
  }

  // --- Cache ---
  function saveCacheForTab(tab, data) {
    try {
      sessionStorage.setItem('inv_' + tab, JSON.stringify(data));
    } catch (e) { /* ignore quota errors */ }
  }

  function loadCacheForTab(tab) {
    try {
      const cached = sessionStorage.getItem('inv_' + tab);
      if (cached) {
        rawData[tab] = JSON.parse(cached);
        return true;
      }
    } catch (e) { /* ignore */ }
    return false;
  }

  async function fetchAllTabs() {
    if (!isApiConfigured()) return;
    const gmail = localStorage.getItem('USER_GMAIL') || '';
    const password = localStorage.getItem('USER_PASSWORD') || '';
    const tabs = Object.keys(TAB_CONFIG);

    const promises = tabs.map(async (tab) => {
      try {
        const config = TAB_CONFIG[tab];
        const url = getApiUrl() + '?action=' + config.api
          + '&gmail=' + encodeURIComponent(gmail)
          + '&password=' + encodeURIComponent(password);
        const res = await fetch(url, { method: 'GET', redirect: 'follow' });
        const json = await res.json();
        if (json.success) {
          rawData[tab] = json.data || [];
          saveCacheForTab(tab, rawData[tab]);
        }
      } catch (e) { /* skip failed tabs */ }
    });

    await Promise.all(promises);
    // Re-render current tab with fresh data
    populateFilterOptions(rawData[currentTab]);
    renderStSummary();
    renderTableBody();
  }

  // --- Tab ---
  function switchTab(tab) {
    currentTab = tab;
    sortKey = '';
    sortAsc = true;
    document.querySelectorAll('.tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === tab);
    });
    loadCacheForTab(tab);
    renderFilters();
    renderTableHead();
    populateFilterOptions(rawData[currentTab]);
    renderStSummary();
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
    container.appendChild(el('button', {
      className: 'btn-fetch', id: 'btn-fetch', onClick: fetchData
    }, 'データ更新'));
    if (currentTab === 'stock') {
      container.appendChild(el('button', {
        className: 'btn-register', id: 'btn-register', onClick: openModal
      }, '+ 新規登録'));
    }
    bindFilterEvents();
  }

  // --- Render table head ---
  function renderTableHead() {
    const config = TAB_CONFIG[currentTab];
    const tr = document.createElement('tr');
    for (const col of config.columns) {
      const th = document.createElement('th');
      const arrow = sortKey === col.key ? (sortAsc ? ' ▲' : ' ▼') : '';
      th.textContent = col.label + arrow;
      if (col.align) th.style.textAlign = col.align;
      th.addEventListener('click', () => {
        if (sortKey === col.key) {
          sortAsc = !sortAsc;
        } else {
          sortKey = col.key;
          sortAsc = true;
        }
        renderTableHead();
        renderTableBody();
      });
      tr.appendChild(th);
    }
    const thead = document.getElementById('table-head');
    thead.textContent = '';
    thead.appendChild(tr);
  }

  // --- Bind filter events ---
  function bindFilterEvents() {
    document.querySelectorAll('#filters input, #filters select').forEach(input => {
      input.addEventListener('input', () => renderTableBody());
      input.addEventListener('change', () => renderTableBody());
    });
  }

  // --- Render table body ---
  function renderTableBody() {
    const config = TAB_CONFIG[currentTab];
    const data = rawData[currentTab];
    let filtered = applyFilters(data);

    if (sortKey) {
      filtered = filtered.slice().sort((a, b) => {
        const va = a[sortKey] != null ? a[sortKey] : '';
        const vb = b[sortKey] != null ? b[sortKey] : '';
        if (typeof va === 'number' && typeof vb === 'number') {
          return sortAsc ? va - vb : vb - va;
        }
        const sa = String(va);
        const sb = String(vb);
        const cmp = sa.localeCompare(sb, 'ja');
        return sortAsc ? cmp : -cmp;
      });
    }

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
          if (currentTab === 'stocktake' && col.key === 'ステータス') {
            const status = row[col.key] || '';
            const span = document.createElement('span');
            span.textContent = status;
            span.className = 'st-status '
              + (status === '完了待ち' ? 'st-status-pending' : '')
              + (status === '確定' ? 'st-status-confirmed' : '')
              + (status === '進行中' ? 'st-status-active' : '');
            td.appendChild(span);
          } else if (currentTab === 'stocktake' && col.key === '操作') {
            if (row['ステータス'] === '完了待ち' || row['ステータス'] === '確定') {
              const btn = document.createElement('button');
              btn.textContent = '詳細';
              btn.className = 'btn-fetch';
              btn.style.padding = '4px 12px';
              btn.addEventListener('click', () => openStDetail(row['セッションID'], row['ステータス']));
              td.appendChild(btn);
            }
          } else {
            let val = row[col.key] != null ? String(row[col.key]) : '';
            if (val && (col.key === '開始日時' || col.key === '日時')) {
              val = formatDateTime(val);
            }
            td.textContent = val;
          }
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
    btn.textContent = '更新中...';

    try {
      const gmail = localStorage.getItem('USER_GMAIL') || '';
      const password = localStorage.getItem('USER_PASSWORD') || '';
      const url = getApiUrl() + '?action=' + config.api
        + '&gmail=' + encodeURIComponent(gmail)
        + '&password=' + encodeURIComponent(password);
      const res = await fetch(url, { method: 'GET', redirect: 'follow' });
      const json = await res.json();

      if (!json.success) throw new Error(json.error || 'データ取得に失敗しました');

      rawData[currentTab] = json.data || [];
      saveCacheForTab(currentTab, rawData[currentTab]);
      populateFilterOptions(rawData[currentTab]);
      renderStSummary();
      renderTableBody();
    } catch (err) {
      alert('通信エラー: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'データ更新';
    }
  }

  // --- Modal ---
  let locationCache = null;

  function openModal() {
    clearForm();
    loadLocations();
    document.getElementById('modal-overlay').style.display = 'flex';
  }

  function closeModal() {
    document.getElementById('modal-overlay').style.display = 'none';
    clearForm();
  }

  function closeModalOnOverlay(event) {
    if (event.target === event.currentTarget) closeModal();
  }

  function clearForm() {
    document.getElementById('reg-name').value = '';
    document.getElementById('reg-barcode').value = '';
    document.getElementById('reg-category').value = '';
    document.getElementById('reg-subcategory').value = '';
    document.getElementById('reg-unit').value = '';
    document.getElementById('reg-tax').value = '8';
    document.getElementById('reg-cost').value = '';
    document.getElementById('reg-price').value = '';
    document.getElementById('reg-location').value = '';
    document.getElementById('reg-threshold').value = '';
    document.getElementById('reg-lot').checked = false;
    document.getElementById('reg-expiry').checked = false;
    const msg = document.getElementById('reg-message');
    msg.style.display = 'none';
    msg.textContent = '';
    msg.className = 'reg-message';
  }

  function showRegMessage(text, isError) {
    const msg = document.getElementById('reg-message');
    msg.textContent = text;
    msg.className = 'reg-message ' + (isError ? 'error' : 'success');
    msg.style.display = 'block';
  }

  async function loadLocations() {
    const select = document.getElementById('reg-location');
    if (locationCache) {
      populateLocationSelect(select, locationCache);
      return;
    }
    if (!isApiConfigured()) return;
    try {
      const gmail = localStorage.getItem('USER_GMAIL') || '';
      const password = localStorage.getItem('USER_PASSWORD') || '';
      const url = getApiUrl() + '?action=getLocations&gmail=' + encodeURIComponent(gmail) + '&password=' + encodeURIComponent(password);
      const res = await fetch(url, { method: 'GET', redirect: 'follow' });
      const json = await res.json();
      if (json.success && json.data) {
        locationCache = json.data;
        populateLocationSelect(select, locationCache);
      }
    } catch (e) {
      console.error('場所一覧の取得に失敗:', e);
    }
  }

  function populateLocationSelect(select, locations) {
    select.textContent = '';
    select.appendChild(el('option', { value: '' }, '指定なし'));
    for (const loc of locations) {
      select.appendChild(el('option', { value: loc['場所ID'] }, loc['場所名']));
    }
  }

  async function registerItem(continueInput) {
    const name = document.getElementById('reg-name').value.trim();
    const category = document.getElementById('reg-category').value;
    const unit = document.getElementById('reg-unit').value;

    if (!name) { showRegMessage('品名を入力してください', true); return; }
    if (!category) { showRegMessage('大カテゴリを選択してください', true); return; }
    if (!unit) { showRegMessage('単位を選択してください', true); return; }

    const btnContinue = document.getElementById('btn-reg-continue');
    const btnClose = document.getElementById('btn-reg-close');
    btnContinue.disabled = true;
    btnClose.disabled = true;

    try {
      const gmail = localStorage.getItem('USER_GMAIL') || '';
      const password = localStorage.getItem('USER_PASSWORD') || '';
      const params = new URLSearchParams({
        action: 'registerItem',
        gmail: gmail,
        password: password,
        品名: name,
        バーコード: document.getElementById('reg-barcode').value.trim(),
        大カテゴリ: category,
        中カテゴリ: document.getElementById('reg-subcategory').value.trim(),
        単位: unit,
        標準単価: document.getElementById('reg-cost').value || '0',
        販売単価: document.getElementById('reg-price').value || '0',
        ロット管理: document.getElementById('reg-lot').checked ? 'TRUE' : 'FALSE',
        賞味期限管理: document.getElementById('reg-expiry').checked ? 'TRUE' : 'FALSE',
        税率: document.getElementById('reg-tax').value,
        閾値: document.getElementById('reg-threshold').value || '',
        主場所ID: document.getElementById('reg-location').value,
      });

      const url = getApiUrl() + '?' + params.toString();
      const res = await fetch(url, { method: 'GET', redirect: 'follow' });
      const json = await res.json();

      if (!json.success) throw new Error(json.error || '登録に失敗しました');

      const itemId = json.data && json.data['品目ID'] ? json.data['品目ID'] : '';
      showRegMessage('登録しました' + (itemId ? '（' + itemId + '）' : ''), false);

      if (continueInput) {
        document.getElementById('reg-name').value = '';
        document.getElementById('reg-barcode').value = '';
        document.getElementById('reg-subcategory').value = '';
        document.getElementById('reg-cost').value = '';
        document.getElementById('reg-price').value = '';
        document.getElementById('reg-threshold').value = '';
        document.getElementById('reg-lot').checked = false;
        document.getElementById('reg-expiry').checked = false;
        document.getElementById('reg-name').focus();
      } else {
        closeModal();
        fetchData();
      }
    } catch (err) {
      showRegMessage('エラー: ' + err.message, true);
    } finally {
      btnContinue.disabled = false;
      btnClose.disabled = false;
    }
  }

  // --- Start ---
  init();

  // --- Stocktake summary ---
  function renderStSummary() {
    const box = document.getElementById('st-summary');
    if (!box) return;
    if (currentTab !== 'stocktake') {
      box.style.display = 'none';
      return;
    }
    const data = rawData.stocktake;
    if (data.length === 0) {
      box.style.display = 'none';
      return;
    }

    const pendingSessions = data.filter(r => r['\u30b9\u30c6\u30fc\u30bf\u30b9'] === '\u5b8c\u4e86\u5f85\u3061');
    const active = data.filter(r => r['\u30b9\u30c6\u30fc\u30bf\u30b9'] === '\u9032\u884c\u4e2d').length;
    const pendingDiff = pendingSessions.reduce((s, r) => s + (parseInt(r['\u5dee\u7570\u3042\u308a\u6570']) || 0), 0);

    // Find latest session date
    let latest = '';
    for (const r of data) {
      const d = r['\u958b\u59cb\u65e5\u6642'] || '';
      if (d > latest) latest = d;
    }
    if (latest.length > 10) latest = latest.substring(0, 10);

    box.style.display = 'flex';
    box.textContent = '';

    function addCard(label, value, cls) {
      box.appendChild(el('div', { className: 'st-summary-card' + (cls ? ' ' + cls : '') },
        el('div', { className: 'st-summary-value' }, String(value)),
        el('div', { className: 'st-summary-label' }, label)
      ));
    }

    if (pendingSessions.length > 0) {
      addCard('\u627f\u8a8d\u5f85\u3061', pendingSessions.length + '\u4ef6', 'st-card-pending');
      if (pendingDiff > 0) addCard('\u5dee\u7570\u3042\u308a', pendingDiff + '\u54c1\u76ee', 'st-card-diff');
    }
    if (active > 0) addCard('\u9032\u884c\u4e2d', active + '\u4ef6', 'st-card-active');
    if (pendingSessions.length === 0 && active === 0) {
      addCard('\u5bfe\u5fdc\u5f85\u3061\u306a\u3057', '\u2713', 'st-card-confirmed');
    }
    if (latest) addCard('\u6700\u7d42\u68da\u5378', latest, '');
  }

  // --- Stocktake detail ---
  let stDetailSessionId = null;
  let stDetailEditable = false;
  let stDetailData = [];

  async function openStDetail(sessionId, status) {
    stDetailSessionId = sessionId;
    stDetailEditable = status === '完了待ち';
    stDetailData = [];
    document.getElementById('st-modal-title').textContent = '棚卸詳細 — ' + sessionId;

    const approveBtn = document.getElementById('btn-st-approve');
    approveBtn.style.display = stDetailEditable ? 'inline-block' : 'none';
    const saveBtn = document.getElementById('btn-st-save');
    saveBtn.style.display = stDetailEditable ? 'inline-block' : 'none';
    const saveMsg = document.getElementById('st-save-message');
    saveMsg.style.display = 'none';

    const tbody = document.getElementById('st-detail-body');
    tbody.textContent = '';
    tbody.appendChild(el('tr', {},
      el('td', { colspan: '6', style: 'text-align:center;padding:20px;color:#666;' }, '読み込み中...')
    ));
    document.getElementById('st-modal-overlay').style.display = 'flex';

    try {
      const gmail = localStorage.getItem('USER_GMAIL') || '';
      const password = localStorage.getItem('USER_PASSWORD') || '';
      const url = getApiUrl() + '?action=getStocktakeDetail&gmail=' + encodeURIComponent(gmail)
        + '&password=' + encodeURIComponent(password)
        + '&sessionId=' + encodeURIComponent(sessionId);
      const res = await fetch(url, { method: 'GET', redirect: 'follow' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || '取得に失敗');

      tbody.textContent = '';
      stDetailData = json.data || [];
      if (stDetailData.length === 0) {
        tbody.appendChild(el('tr', {},
          el('td', { colspan: '6', style: 'text-align:center;padding:20px;color:#666;' }, '明細データがありません')
        ));
        return;
      }
      renderStDetailRows(tbody);
    } catch (err) {
      tbody.textContent = '';
      tbody.appendChild(el('tr', {},
        el('td', { colspan: '6', style: 'text-align:center;padding:20px;color:#d32f2f;' }, 'エラー: ' + err.message)
      ));
    }
  }

  function renderStDetailRows(tbody) {
    tbody.textContent = '';
    for (let i = 0; i < stDetailData.length; i++) {
      const d = stDetailData[i];
      const diff = d['差異'];
      const isUncounted = d['備考'] === '未カウント';
      const rowClass = isUncounted ? 'st-uncounted-row' : (diff !== 0 && diff !== '' ? 'st-diff-row' : '');
      const tr = el('tr', { className: rowClass });
      tr.appendChild(el('td', {}, d['品目ID']));
      tr.appendChild(el('td', {}, d['品名']));
      tr.appendChild(el('td', { style: 'text-align:right;' }, d['帳簿在庫'] != null ? String(d['帳簿在庫']) : ''));

      // 実数: editable input for 完了待ち
      const tdCount = document.createElement('td');
      tdCount.style.textAlign = 'right';
      if (stDetailEditable) {
        const input = document.createElement('input');
        input.type = 'number';
        input.min = '0';
        input.className = 'st-count-input';
        input.value = d['実数'] != null && d['実数'] !== '' ? d['実数'] : '';
        input.dataset.index = i;
        input.addEventListener('input', function() {
          const idx = parseInt(this.dataset.index);
          const newVal = this.value !== '' ? parseInt(this.value) : '';
          stDetailData[idx]['実数'] = newVal;
          const book = stDetailData[idx]['帳簿在庫'] || 0;
          stDetailData[idx]['差異'] = newVal !== '' ? newVal - book : '';
          // Update diff cell
          const diffTd = this.parentElement.nextElementSibling;
          const newDiff = stDetailData[idx]['差異'];
          diffTd.textContent = newDiff !== '' ? String(newDiff) : '-';
          // Update row highlight
          const row = this.closest('tr');
          row.className = newDiff !== 0 && newDiff !== '' ? 'st-diff-row' : '';
        });
        tdCount.appendChild(input);
      } else {
        tdCount.textContent = d['実数'] != null && d['実数'] !== '' ? String(d['実数']) : '-';
      }
      tr.appendChild(tdCount);

      tr.appendChild(el('td', { style: 'text-align:right;' }, diff != null && diff !== '' ? String(diff) : '-'));
      tr.appendChild(el('td', {}, d['備考'] || ''));
      tbody.appendChild(tr);
    }
  }

  async function saveStCounts() {
    if (!stDetailSessionId || !stDetailEditable) return;

    // Collect edited rows
    const updates = [];
    for (const d of stDetailData) {
      if (d['実数'] !== '' && d['実数'] != null) {
        updates.push({ '品目ID': d['品目ID'], '実数': d['実数'] });
      }
    }
    if (updates.length === 0) {
      alert('保存するデータがありません。');
      return;
    }

    const btn = document.getElementById('btn-st-save');
    btn.disabled = true;
    btn.textContent = '保存中...';
    const saveMsg = document.getElementById('st-save-message');

    try {
      const gmail = localStorage.getItem('USER_GMAIL') || '';
      const password = localStorage.getItem('USER_PASSWORD') || '';
      const url = getApiUrl() + '?action=updateStocktakeCounts&gmail=' + encodeURIComponent(gmail)
        + '&password=' + encodeURIComponent(password)
        + '&sessionId=' + encodeURIComponent(stDetailSessionId)
        + '&updates=' + encodeURIComponent(JSON.stringify(updates));
      const res = await fetch(url, { method: 'GET', redirect: 'follow' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || '保存に失敗');

      saveMsg.textContent = json.data.updatedCount + '件の実数を更新しました';
      saveMsg.className = 'reg-message success';
      saveMsg.style.display = 'block';
      setTimeout(() => { saveMsg.style.display = 'none'; }, 3000);
    } catch (err) {
      saveMsg.textContent = 'エラー: ' + err.message;
      saveMsg.className = 'reg-message error';
      saveMsg.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = '修正を保存';
    }
  }

  function closeStDetailModal() {
    document.getElementById('st-modal-overlay').style.display = 'none';
    stDetailSessionId = null;
    stDetailData = [];
  }

  function closeStModal(event) {
    if (event.target === event.currentTarget) closeStDetailModal();
  }

  async function approveStocktake() {
    if (!stDetailSessionId) return;
    if (!confirm('この棚卸セッションを承認し、在庫を調整しますか？\nこの操作は元に戻せません。')) return;

    const btn = document.getElementById('btn-st-approve');
    btn.disabled = true;
    btn.textContent = '処理中...';

    try {
      const gmail = localStorage.getItem('USER_GMAIL') || '';
      const password = localStorage.getItem('USER_PASSWORD') || '';
      const url = getApiUrl() + '?action=approveStocktake&gmail=' + encodeURIComponent(gmail)
        + '&password=' + encodeURIComponent(password)
        + '&sessionId=' + encodeURIComponent(stDetailSessionId);
      const res = await fetch(url, { method: 'GET', redirect: 'follow' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || '承認に失敗');

      alert('承認完了: ' + json.data.adjustedCount + '件の在庫調整を実行しました。');
      closeStDetailModal();
      fetchData();
    } catch (err) {
      alert('エラー: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = '承認して在庫調整';
    }
  }

  function logout() {
    localStorage.removeItem('USER_GMAIL');
    localStorage.removeItem('USER_PASSWORD');
    document.getElementById('main-page').style.display = 'none';
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('login-email').value = '';
    document.getElementById('login-password').value = '';
    rawData = { stock: [], lots: [], history: [], stocktake: [] };
  }

  return { switchTab, fetchData, login, logout, openModal, closeModal, closeModalOnOverlay, registerItem, closeStDetailModal, closeStModal, approveStocktake, saveStCounts };
})();
