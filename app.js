// Asagiri Inventory - Phase 2: バーコードスキャン + 品目検索

const App = (() => {
  let codeReader = null;
  let scanning = false;
  let searching = false;

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

    document.getElementById('input-barcode').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') searchManual();
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

  // --- 画面遷移 ---
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
  }

  function goToTop() {
    stopScan();
    showScreen('screen-top');
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
  }

  // --- スキャン ---
  function startScan() {
    if (scanning) return;

    if (!codeReader) {
      codeReader = new ZXing.BrowserMultiFormatReader();
    }

    const videoEl = document.getElementById('scan-video');

    codeReader.listVideoInputDevices()
      .then(devices => {
        if (devices.length === 0) {
          throw new Error('カメラが見つかりません');
        }
        const backCam = devices.find(d => /back|rear|environment/i.test(d.label)) || devices[0];

        scanning = true;
        return codeReader.decodeFromVideoDevice(
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
      })
      .catch(err => {
        console.error('Camera error:', err);
        scanning = false;
        goToManual(true);
      });
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
  };
})();
