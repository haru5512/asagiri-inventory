// Asagiri Inventory - Phase 3a: 入出庫記録 + バーコードスキャン + 品目検索

const App = (() => {
  let codeReader = null;
  let scanning = false;
  let searching = false;
  let currentOp = null;    // 'stockin' | 'stockout' | 'dispose' | 'move'
  let currentItem = null;
  let currentLocations = { from: '', to: '' };

  const OP_LABELS = {
    stockin: '入庫',
    stockout: '出庫',
    dispose: '廃棄',
    move: '移動',
  };

  function opLabel() {
    return OP_LABELS[currentOp] || '';
  }

  // --- DOM ヘルパー ---
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

  function clearAndAppend(parent, ...children) {
    parent.textContent = '';
    for (const child of children) {
      if (child) parent.appendChild(child);
    }
  }

  // --- API URL 管理 ---
  function getApiUrl() {
    return localStorage.getItem('WEB_APP_URL') || CONFIG.WEB_APP_URL;
  }

  function isApiConfigured() {
    const url = getApiUrl();
    return url && !url.includes('\u300a') && url.startsWith('https://');
  }

  // --- 初期化 ---
  function init() {
    document.getElementById('app-version').textContent = 'v' + CONFIG.APP_VERSION;
    document.getElementById('settings-version').textContent = CONFIG.APP_VERSION;

    updateApiStatus();
    updateGmailStatus();

    document.getElementById('input-barcode').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') searchManual();
    });
    document.getElementById('input-op-barcode').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') searchOpManual();
    });

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js');
      });
    }
  }

  function updateApiStatus() {
    const apiEl = document.getElementById('settings-api');
    const urlInput = document.getElementById('input-api-url');
    if (isApiConfigured()) {
      apiEl.textContent = '接続済み';
      apiEl.className = 'setting-value connected';
      if (urlInput) urlInput.value = getApiUrl();
    } else {
      apiEl.textContent = '未設定';
      apiEl.className = 'setting-value not-connected';
      if (urlInput) urlInput.value = '';
    }
  }

  function saveApiUrl() {
    const input = document.getElementById('input-api-url').value.trim();
    if (!input) return;
    if (!input.startsWith('https://script.google.com/')) {
      alert('URLが正しくありません。\nhttps://script.google.com/... で始まるURLを入力してください。');
      return;
    }
    localStorage.setItem('WEB_APP_URL', input);
    updateApiStatus();
    alert('保存しました');
  }

  // --- Gmail 管理 ---
  function getGmail() {
    return localStorage.getItem('USER_GMAIL') || '';
  }

  function isGmailConfigured() {
    const gmail = getGmail();
    return gmail && gmail.includes('@');
  }

  function updateGmailStatus() {
    const gmailEl = document.getElementById('settings-gmail');
    const gmailInput = document.getElementById('input-gmail');
    if (isGmailConfigured()) {
      gmailEl.textContent = getGmail();
      gmailEl.className = 'setting-value connected';
      if (gmailInput) gmailInput.value = getGmail();
    } else {
      gmailEl.textContent = '未設定';
      gmailEl.className = 'setting-value not-connected';
      if (gmailInput) gmailInput.value = '';
    }
  }

  function saveGmail() {
    const input = document.getElementById('input-gmail').value.trim();
    if (!input || !input.includes('@')) {
      alert('正しいメールアドレスを入力してください。');
      return;
    }
    localStorage.setItem('USER_GMAIL', input);
    updateGmailStatus();
    alert('保存しました');
  }

  function requireGmail() {
    if (!isGmailConfigured()) {
      alert('担当者メールが未設定です。\n設定画面からメールアドレスを入力してください。');
      goToSettings();
      return false;
    }
    return true;
  }

  // --- 場所キャッシュ ---
  function getCachedLocations() {
    const data = localStorage.getItem('CACHED_LOCATIONS');
    return data ? JSON.parse(data) : [];
  }

  async function fetchLocations() {
    if (!isApiConfigured()) return [];
    try {
      const url = getApiUrl() + '?action=getLocations';
      const res = await fetch(url, { method: 'GET', redirect: 'follow' });
      const json = await res.json();
      if (json.success && json.data) {
        localStorage.setItem('CACHED_LOCATIONS', JSON.stringify(json.data));
        return json.data;
      }
    } catch (err) {
      console.error('Failed to fetch locations:', err);
    }
    return getCachedLocations();
  }

  async function reloadLocations() {
    const btn = document.getElementById('btn-reload-locations');
    if (btn) btn.disabled = true;
    const locations = await fetchLocations();
    if (btn) btn.disabled = false;
    const count = locations.length;
    const locEl = document.getElementById('settings-locations');
    if (locEl) locEl.textContent = count > 0 ? count + '件キャッシュ済み' : '未取得';
    alert(count > 0 ? count + '件の場所データを取得しました' : '場所データの取得に失敗しました');
  }

  // --- 画面遷移 ---
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
  }

  function goToTop() {
    stopScan();
    currentOp = null;
    currentItem = null;
    currentLocations = { from: '', to: '' };
    showScreen('screen-top');
  }

  // --- 入出庫フロー ---
  function startOp(op) {
    if (!requireGmail()) return;
    currentOp = op;
    currentItem = null;
    goToOpScan();
  }

  function goToOpScan() {
    document.getElementById('op-scan-title').textContent = opLabel() + ' - スキャン';
    showScreen('screen-op-scan');
    startOpScan();
  }

  function goToOpManual(fromCameraError) {
    stopScan();
    document.getElementById('op-manual-title').textContent = opLabel() + ' - 手入力';
    document.getElementById('op-camera-banner').style.display = fromCameraError ? 'block' : 'none';
    showScreen('screen-op-manual');
    document.getElementById('input-op-barcode').value = '';
    document.getElementById('input-op-barcode').focus();
  }

  function startOpScan() {
    if (scanning) return;
    loadZXing()
      .then(() => {
        if (!codeReader) {
          codeReader = new ZXing.BrowserMultiFormatReader();
        }
        return codeReader.listVideoInputDevices();
      })
      .then(devices => {
        if (devices.length === 0) throw new Error('カメラが見つかりません');
        const backCam = devices.find(d => /back|rear|environment/i.test(d.label)) || devices[0];
        const videoEl = document.getElementById('op-scan-video');
        scanning = true;
        codeReader.decodeFromVideoDevice(
          backCam.deviceId,
          videoEl,
          (result, err) => {
            if (result) {
              const code = result.getText();
              stopScan();
              lookupOpItem(code);
            }
            if (err && !(err instanceof ZXing.NotFoundException)) {
              console.error('Scan error:', err);
            }
          }
        );
      })
      .catch(err => {
        console.error('Camera/ZXing error:', err);
        scanning = false;
        goToOpManual(true);
      });
  }

  function searchOpManual() {
    const input = document.getElementById('input-op-barcode').value.trim();
    if (!input) return;
    lookupOpItem(input);
  }

  async function lookupOpItem(barcode) {
    if (searching) return;
    if (!isApiConfigured()) {
      alert('API未設定です。設定画面から Web App URL を入力してください。');
      goToSettings();
      return;
    }
    searching = true;
    showScreen('screen-loading');
    try {
      const url = getApiUrl() + '?action=findItemByBarcode&barcode=' + encodeURIComponent(barcode);
      const res = await fetch(url, { method: 'GET', redirect: 'follow' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || '不明なエラー');
      if (json.data) {
        currentItem = json.data;
        goToOpInput();
      } else {
        alert('未登録のコードです: ' + barcode);
        goToOpScan();
      }
    } catch (err) {
      alert('通信エラー: ' + err.message);
      goToOpScan();
    } finally {
      searching = false;
    }
  }

  // --- 数量入力画面 ---
  function renderItemInfo(container, item) {
    clearAndAppend(container,
      el('div', { className: 'result-card' },
        el('div', { className: 'result-row' },
          el('span', { className: 'result-label' }, '品目ID'),
          el('span', { className: 'result-value' }, item['品目ID'])
        ),
        el('div', { className: 'result-row' },
          el('span', { className: 'result-label' }, '品名'),
          el('span', { className: 'result-value' }, item['品名'])
        ),
        el('div', { className: 'result-row' },
          el('span', { className: 'result-label' }, '単位'),
          el('span', { className: 'result-value' }, item['単位'] || '-')
        ),
        el('div', { className: 'result-row' },
          el('span', { className: 'result-label' }, 'ロット管理'),
          el('span', { className: 'result-value' }, item['ロット管理'] ? 'あり' : 'なし')
        )
      )
    );
  }

  function buildLocationSelect(id, required) {
    const locations = getCachedLocations();
    const select = el('select', { id: id, className: 'form-select' });
    if (!required) {
      select.appendChild(el('option', { value: '' }, '-- 未指定（主場所） --'));
    } else {
      select.appendChild(el('option', { value: '' }, '-- 選択してください --'));
    }
    for (const loc of locations) {
      const opt = el('option', { value: loc['場所ID'] }, loc['場所名'] || loc['場所ID']);
      select.appendChild(opt);
    }
    return select;
  }

  async function fetchItemLots(itemId) {
    if (!isApiConfigured()) return [];
    try {
      const url = getApiUrl() + '?action=getActiveLots&品目ID=' + encodeURIComponent(itemId);
      const res = await fetch(url, { method: 'GET', redirect: 'follow' });
      const json = await res.json();
      if (json.success && json.data) return json.data;
    } catch (err) {
      console.error('Failed to fetch lots:', err);
    }
    return [];
  }

  function goToOpInput() {
    document.getElementById('op-input-title').textContent = opLabel() + ' - 入力';
    renderItemInfo(document.getElementById('op-item-info'), currentItem);

    const form = document.getElementById('op-input-form');
    form.textContent = '';

    // Quantity
    form.appendChild(el('div', { className: 'form-group' },
      el('label', { for: 'input-op-qty' }, '数量'),
      el('input', { type: 'number', id: 'input-op-qty', min: '1', placeholder: '数量を入力', inputmode: 'numeric' })
    ));

    // Location fields based on operation type
    if (currentOp === 'move') {
      form.appendChild(el('div', { className: 'form-group' },
        el('label', {}, '移動元'),
        buildLocationSelect('input-op-loc-from', true)
      ));
      form.appendChild(el('div', { className: 'form-group' },
        el('label', {}, '移動先'),
        buildLocationSelect('input-op-loc-to', true)
      ));
      if (currentLocations.from) {
        document.getElementById('input-op-loc-from').value = currentLocations.from;
      }
      if (currentLocations.to) {
        document.getElementById('input-op-loc-to').value = currentLocations.to;
      }
    } else if (currentOp === 'stockout' || currentOp === 'dispose') {
      form.appendChild(el('div', { className: 'form-group' },
        el('label', {}, '場所'),
        buildLocationSelect('input-op-loc-from', true)
      ));
      if (currentLocations.from) {
        document.getElementById('input-op-loc-from').value = currentLocations.from;
      }
    } else if (currentOp === 'stockin') {
      form.appendChild(el('div', { className: 'form-group' },
        el('label', {}, '場所（任意）'),
        buildLocationSelect('input-op-loc-from', false)
      ));
      if (currentLocations.from) {
        document.getElementById('input-op-loc-from').value = currentLocations.from;
      }
    }

    // Lot selection for dispose
    if (currentOp === 'dispose' && currentItem['ロット管理']) {
      const lotGroup = el('div', { className: 'form-group' },
        el('label', {}, 'ロット選択'),
        el('select', { id: 'input-op-lot-id', className: 'form-select' },
          el('option', { value: '' }, '読み込み中...')
        )
      );
      form.appendChild(lotGroup);

      fetchItemLots(currentItem['品目ID']).then(lots => {
        const select = document.getElementById('input-op-lot-id');
        if (!select) return;
        select.textContent = '';
        if (lots.length === 0) {
          select.appendChild(el('option', { value: '' }, '有効なロットがありません'));
        } else {
          select.appendChild(el('option', { value: '' }, '-- 選択してください --'));
          for (const lot of lots) {
            const label = lot['ロットID'] + ' / ' + lot['ロット番号']
              + ' (残' + lot['残数量'] + ', 期限: ' + (lot['賞味期限'] || '-') + ')';
            select.appendChild(el('option', { value: lot['ロットID'] }, label));
          }
        }
      });
    }

    // Lot management fields for stockin
    if (currentOp === 'stockin' && currentItem['ロット管理']) {
      form.appendChild(el('div', { className: 'form-group' },
        el('label', { for: 'input-op-lot-number' }, 'ロット番号'),
        el('input', { type: 'text', id: 'input-op-lot-number', placeholder: 'ロット番号を入力', autocomplete: 'off' })
      ));
      form.appendChild(el('div', { className: 'form-group' },
        el('label', { for: 'input-op-expiry' }, '賞味期限'),
        el('input', { type: 'date', id: 'input-op-expiry' })
      ));
    }

    showScreen('screen-op-input');
  }

  // --- 確認画面 + API + 完了画面 ---
  function collectOpFormData() {
    const qty = parseInt(document.getElementById('input-op-qty').value, 10);
    if (!qty || qty <= 0) {
      alert('数量を正しく入力してください。');
      return null;
    }

    const data = {
      op: currentOp,
      itemId: currentItem['品目ID'],
      itemName: currentItem['品名'],
      qty: qty,
      unit: currentItem['単位'] || '',
      gmail: getGmail(),
    };

    if (currentOp === 'move') {
      data.fromLocationId = document.getElementById('input-op-loc-from').value;
      data.toLocationId = document.getElementById('input-op-loc-to').value;
      if (!data.fromLocationId || !data.toLocationId) {
        alert('移動元と移動先を選択してください。');
        return null;
      }
      if (data.fromLocationId === data.toLocationId) {
        alert('移動元と移動先が同じです。');
        return null;
      }
    } else if (currentOp === 'stockout' || currentOp === 'dispose') {
      data.fromLocationId = document.getElementById('input-op-loc-from').value;
      if (!data.fromLocationId) {
        alert('場所を選択してください。');
        return null;
      }
    } else if (currentOp === 'stockin') {
      const locEl = document.getElementById('input-op-loc-from');
      data.fromLocationId = locEl ? locEl.value : '';
    }

    // Lot selection for dispose
    if (currentOp === 'dispose' && currentItem['ロット管理']) {
      const lotEl = document.getElementById('input-op-lot-id');
      data.lotId = lotEl ? lotEl.value : '';
      if (!data.lotId) {
        alert('ロットを選択してください。');
        return null;
      }
    }

    // Lot data for stockin
    if (currentOp === 'stockin' && currentItem['ロット管理']) {
      const lotNumEl = document.getElementById('input-op-lot-number');
      const expiryEl = document.getElementById('input-op-expiry');
      if (lotNumEl && expiryEl) {
        data.lotNumber = lotNumEl.value.trim();
        data.expiry = expiryEl.value;
        if (!data.lotNumber) {
          alert('ロット番号を入力してください。');
          return null;
        }
        if (!data.expiry) {
          alert('賞味期限を入力してください。');
          return null;
        }
      }
    }

    // Persist location selections for "continue scanning"
    currentLocations.from = data.fromLocationId || '';
    currentLocations.to = data.toLocationId || '';

    return data;
  }

  function locationName(id) {
    if (!id) return '主場所';
    const locations = getCachedLocations();
    const loc = locations.find(l => l['場所ID'] === id);
    return loc ? (loc['場所名'] || id) : id;
  }

  function goToOpConfirm() {
    const data = collectOpFormData();
    if (!data) return;

    document.getElementById('op-confirm-title').textContent = opLabel() + ' - 確認';

    const card = el('div', { className: 'result-card' },
      el('div', { className: 'result-header found' }, opLabel() + 'の確認')
    );

    const rows = [
      ['品目ID', data.itemId],
      ['品名', data.itemName],
      ['区分', opLabel()],
      ['数量', data.qty + ' ' + data.unit],
    ];

    if (currentOp === 'move') {
      rows.push(['移動元', locationName(data.fromLocationId)]);
      rows.push(['移動先', locationName(data.toLocationId)]);
    } else if (data.fromLocationId) {
      rows.push(['場所', locationName(data.fromLocationId)]);
    }

    if (data.lotNumber) {
      rows.push(['ロット番号', data.lotNumber]);
    }
    if (data.expiry) {
      rows.push(['賞味期限', data.expiry]);
    }
    if (data.lotId) {
      rows.push(['ロットID', data.lotId]);
    }
    if (currentOp === 'stockout' && currentItem['ロット管理']) {
      rows.push(['ロット引き当て', 'FIFO自動（記録後に結果表示）']);
    }

    rows.push(['担当者', data.gmail]);

    for (const [label, value] of rows) {
      card.appendChild(
        el('div', { className: 'result-row' },
          el('span', { className: 'result-label' }, label),
          el('span', { className: 'result-value' }, String(value))
        )
      );
    }

    clearAndAppend(document.getElementById('op-confirm-content'), card);
    showScreen('screen-op-confirm');
  }

  async function recordOp() {
    const data = collectOpFormData();
    if (!data) return;

    const btn = document.getElementById('btn-op-record');
    btn.disabled = true;
    showScreen('screen-loading');

    try {
      let apiAction, params;

      // GAS API パラメータ名マッピング:
      // PWA: itemId/qty/locationId → GAS: 品目ID/数量/場所ID

      if (currentOp === 'stockin') {
        if (data.lotNumber && data.expiry) {
          // ロット管理品 → registerLot (T_ロット + T_入出庫 に同時登録)
          apiAction = 'registerLot';
          params = {
            gmail: data.gmail,
            品目ID: data.itemId,
            入庫数量: data.qty,
            ロット番号: data.lotNumber,
            賞味期限: data.expiry,
          };
        } else {
          // 通常品 → recordStockIn
          apiAction = 'recordStockIn';
          params = {
            gmail: data.gmail,
            品目ID: data.itemId,
            数量: data.qty,
            場所ID: data.fromLocationId || '',
          };
        }
      } else if (currentOp === 'stockout') {
        // recordStockOutWithLot はロット品なら自動FIFO、通常品なら通常出庫
        apiAction = 'recordStockOutWithLot';
        params = {
          gmail: data.gmail,
          品目ID: data.itemId,
          数量: data.qty,
          場所ID: data.fromLocationId,
        };
      } else if (currentOp === 'dispose') {
        if (data.lotId) {
          // ロット管理品 → discardLot
          apiAction = 'discardLot';
          params = {
            gmail: data.gmail,
            ロットID: data.lotId,
            廃棄理由: '現場廃棄',
          };
        } else {
          // 通常品 → recordStockOut で廃棄区分
          apiAction = 'recordStockOut';
          params = {
            gmail: data.gmail,
            品目ID: data.itemId,
            数量: data.qty,
            場所ID: data.fromLocationId,
            備考: '廃棄',
          };
        }
      } else if (currentOp === 'move') {
        apiAction = 'recordStockMove';
        params = {
          gmail: data.gmail,
          品目ID: data.itemId,
          数量: data.qty,
          場所ID: data.fromLocationId,
          移動先場所ID: data.toLocationId,
        };
      }

      const query = Object.entries(params)
        .map(([k, v]) => k + '=' + encodeURIComponent(v))
        .join('&');
      const url = getApiUrl() + '?action=' + apiAction + '&' + query;
      const res = await fetch(url, { method: 'GET', redirect: 'follow' });
      const json = await res.json();

      if (!json.success) throw new Error(json.error || '記録に失敗しました');

      showOpDone(true, data, json);
    } catch (err) {
      showOpDone(false, data, null, err.message);
    } finally {
      btn.disabled = false;
    }
  }

  function showOpDone(success, data, json, errorMsg) {
    const content = document.getElementById('op-done-content');
    const actions = document.getElementById('op-done-actions');

    if (success) {
      const card = el('div', { className: 'result-card' },
        el('div', { className: 'result-header found' }, opLabel() + '完了'),
        el('div', { className: 'result-row' },
          el('span', { className: 'result-label' }, '品名'),
          el('span', { className: 'result-value' }, data.itemName)
        ),
        el('div', { className: 'result-row' },
          el('span', { className: 'result-label' }, '数量'),
          el('span', { className: 'result-value' }, data.qty + ' ' + data.unit)
        )
      );

      // Show FIFO allocation results if available (GAS: 引当詳細)
      const allocs = json.data && json.data['引当詳細'];
      if (allocs && allocs.length > 0) {
        const allocDiv = el('div', { className: 'lot-allocation' },
          el('div', { className: 'lot-allocation-title' }, 'FIFO 引き当て結果')
        );
        for (const alloc of allocs) {
          allocDiv.appendChild(
            el('div', { className: 'lot-allocation-row' },
              el('span', {}, (alloc['ロット番号'] || alloc['ロットID']) + ': ' + alloc['引当数量'] + '個'),
              el('span', { className: 'lot-expiry' }, '期限: ' + (alloc['賞味期限'] || '-'))
            )
          );
        }
        card.appendChild(allocDiv);
      }

      clearAndAppend(content, card);
    } else {
      clearAndAppend(content,
        el('div', { className: 'result-card' },
          el('div', { className: 'result-header error' }, '記録失敗'),
          el('div', { className: 'error-detail' }, errorMsg)
        )
      );
    }

    clearAndAppend(actions,
      el('button', { className: 'btn btn-primary', onClick: () => {
        currentItem = null;
        goToOpScan();
      }}, '続けてスキャン（' + opLabel() + '）'),
      el('button', { className: 'btn btn-secondary', onClick: goToTop }, 'トップに戻る')
    );

    showScreen('screen-op-done');
  }

  function goToScan() {
    showScreen('screen-scan');
    startScan();
  }

  function goToManual(fromCameraError) {
    stopScan();
    document.getElementById('camera-banner').style.display = fromCameraError ? 'block' : 'none';
    showScreen('screen-manual');
    document.getElementById('input-barcode').value = '';
    document.getElementById('input-barcode').focus();
  }

  function goToSettings() {
    showScreen('screen-settings');
    updateGmailStatus();
    const locations = getCachedLocations();
    const locEl = document.getElementById('settings-locations');
    if (locEl) locEl.textContent = locations.length > 0 ? locations.length + '件キャッシュ済み' : '未取得';
  }

  // --- ZXing 遅延読み込み ---
  function loadZXing() {
    return new Promise((resolve, reject) => {
      if (typeof ZXing !== 'undefined') { resolve(); return; }
      const s = document.createElement('script');
      s.src = 'https://unpkg.com/@zxing/library@0.21.0/umd/index.min.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('バーコードライブラリの読み込みに失敗しました'));
      document.head.appendChild(s);
    });
  }

  // --- スキャン ---
  function startScan() {
    if (scanning) return;

    loadZXing()
      .then(() => {
        if (!codeReader) {
          codeReader = new ZXing.BrowserMultiFormatReader();
        }
        return codeReader.listVideoInputDevices();
      })
      .then(startScanWithDevices)
      .catch(err => {
        console.error('Camera/ZXing error:', err);
        scanning = false;
        goToManual(true);
      });
  }

  function startScanWithDevices(devices) {
    if (devices.length === 0) {
      throw new Error('カメラが見つかりません');
    }
    const backCam = devices.find(d => /back|rear|environment/i.test(d.label)) || devices[0];
    const videoEl = document.getElementById('scan-video');

    scanning = true;
    codeReader.decodeFromVideoDevice(
      backCam.deviceId,
      videoEl,
      (result, err) => {
        if (result) {
          const code = result.getText();
          stopScan();
          lookupItem(code);
        }
        if (err && !(err instanceof ZXing.NotFoundException)) {
          console.error('Scan error:', err);
        }
      }
    );
  }

  function stopScan() {
    if (codeReader && scanning) {
      codeReader.reset();
      scanning = false;
    }
  }

  // --- 手入力検索 ---
  function searchManual() {
    const input = document.getElementById('input-barcode').value.trim();
    if (!input) return;
    lookupItem(input);
  }

  // --- API 呼び出し ---
  async function lookupItem(barcode) {
    if (searching) return;

    if (!isApiConfigured()) {
      showError('API未設定', '設定画面から Web App URL を入力してください。', barcode);
      return;
    }

    searching = true;
    showScreen('screen-loading');

    try {
      const url = getApiUrl() + '?action=findItemByBarcode&barcode=' + encodeURIComponent(barcode);
      const res = await fetch(url, { method: 'GET', redirect: 'follow' });
      const json = await res.json();

      if (!json.success) {
        throw new Error(json.error || '不明なエラー');
      }

      if (json.data) {
        showFound(json.data);
      } else {
        showNotFound(barcode);
      }
    } catch (err) {
      showError('通信エラー', err.message, barcode);
    } finally {
      searching = false;
    }
  }

  // --- 結果表示: 見つかった ---
  function showFound(item) {
    const fields = [
      { label: '品目ID', key: '品目ID' },
      { label: '品名', key: '品名' },
      { label: 'バーコード', key: 'バーコード' },
      { label: '大カテゴリ', key: '大カテゴリ' },
      { label: '中カテゴリ', key: '中カテゴリ' },
      { label: '単位', key: '単位' },
      { label: '標準単価', key: '標準単価', format: v => '\u00A5' + Number(v).toLocaleString() },
      { label: '税率', key: '税率', format: v => v + '%' },
      { label: '主場所', key: '主場所ID' },
      { label: 'ロット管理', key: 'ロット管理', format: v => v ? 'あり' : 'なし' },
      { label: '賞味期限管理', key: '賞味期限管理', format: v => v ? 'あり' : 'なし' },
    ];

    const card = el('div', { className: 'result-card' },
      el('div', { className: 'result-header found' }, '\u2705 見つかりました')
    );

    for (const f of fields) {
      const val = item[f.key];
      if (val === undefined || val === null || val === '') continue;
      const display = f.format ? f.format(val) : String(val);
      card.appendChild(
        el('div', { className: 'result-row' },
          el('span', { className: 'result-label' }, f.label),
          el('span', { className: 'result-value' }, display)
        )
      );
    }

    clearAndAppend(document.getElementById('result-content'), card);
    clearAndAppend(document.getElementById('result-actions'),
      el('button', { className: 'btn btn-primary', onClick: goToScan }, 'もう一度スキャン'),
      el('button', { className: 'btn btn-secondary', onClick: () => goToManual(false) }, '手入力で再検索')
    );
    showScreen('screen-result');
  }

  // --- 結果表示: 未登録 ---
  function showNotFound(barcode) {
    const card = el('div', { className: 'result-card' },
      el('div', { className: 'result-header not-found' }, '\u274C 未登録'),
      el('p', { className: 'result-message' }, '読み取ったコード:'),
      el('div', { className: 'result-code' }, barcode),
      el('p', { className: 'result-message' }, 'このコードは品目マスターに登録されていません。')
    );

    clearAndAppend(document.getElementById('result-content'), card);
    clearAndAppend(document.getElementById('result-actions'),
      el('button', { className: 'btn btn-primary', onClick: goToScan }, 'もう一度スキャン'),
      el('button', { className: 'btn btn-secondary', onClick: () => goToManual(false) }, '手入力で再検索')
    );
    showScreen('screen-result');
  }

  // --- 結果表示: エラー ---
  function showError(title, message, barcode) {
    const card = el('div', { className: 'result-card' },
      el('div', { className: 'result-header error' }, '\u26A0 ' + title),
      el('p', { className: 'result-message' }, 'サーバーに接続できません。'),
      el('div', { className: 'error-detail' }, message)
    );

    clearAndAppend(document.getElementById('result-content'), card);
    clearAndAppend(document.getElementById('result-actions'),
      el('button', { className: 'btn btn-primary', onClick: () => lookupItem(barcode) }, '再試行'),
      el('button', { className: 'btn btn-secondary', onClick: () => goToManual(false) }, '手入力で続行')
    );
    showScreen('screen-result');
  }

  // --- 起動 ---
  init();

  return {
    goToTop,
    goToScan,
    goToManual,
    goToSettings,
    searchManual,
    lookupItem,
    saveApiUrl,
    saveGmail,
    reloadLocations,
    startOp,
    goToOpScan,
    goToOpManual,
    searchOpManual,
    goToOpInput,
    goToOpConfirm,
    recordOp,
  };
})();
