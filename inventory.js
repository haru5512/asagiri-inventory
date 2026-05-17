// Asagiri Inventory - PC在庫管理画面

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
    container.appendChild(el('button', {
      className: 'btn-fetch', id: 'btn-fetch', onClick: fetchData
    }, 'データ取得'));
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
    document.querySelectorAll('#filters input, #filters select').forEach(input => {
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
