// ============================================================
// Phase 3b 追加: 棚卸機能 API
// このコードを GAS エディタの既存コードに追記する
// ============================================================

// ===== SHEETS定数に追加 =====
// 既存の const SHEETS = { ... } に以下を追加:
//   T_STOCKTAKE_SESSION: 'T_棚卸セッション',
//   T_STOCKTAKE_DETAIL: 'T_棚卸明細',


// ===== 1. 棚卸セッションID生成 =====

function generateStocktakeSessionId() {
  var today = formatDate().replace(/-/g, '');
  var prefix = ID_PREFIX.STOCKTAKE + today + '-';
  var sheet = getSheet('T_棚卸セッション');
  var data = sheet.getDataRange().getValues();
  var maxNum = 0;
  for (var i = 1; i < data.length; i++) {
    var id = String(data[i][0] || '');
    if (id.indexOf(prefix) === 0) {
      var num = parseInt(id.substring(prefix.length), 10);
      if (!isNaN(num) && num > maxNum) maxNum = num;
    }
  }
  return prefix + String(maxNum + 1).padStart(3, '0');
}


// ===== 2. 棚卸開始 =====

function startStocktake(params) {
  var auth = requireGmailAuth(params.gmail, params.password);

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('他の処理が実行中です');

  try {
    var sessionId = generateStocktakeSessionId();
    var now = formatDateTime();

    var sheet = getSheet('T_棚卸セッション');
    // 列順: セッションID / 開始日時 / 担当者ID / ステータス / 終了日時 / 承認者ID / 承認日時
    sheet.appendRow([sessionId, now, auth.userId, '進行中', '', '', '']);

    return { sessionId: sessionId, startTime: now };
  } finally {
    lock.releaseLock();
  }
}


// ===== 3. 棚卸カウント記録 =====

function recordStocktakeCount(params) {
  var auth = requireGmailAuth(params.gmail, params.password);

  if (!params.sessionId) throw new Error('セッションIDが必要です');
  if (!params.品目ID) throw new Error('品目IDが必要です');
  if (params.実数 === undefined || params.実数 === '') throw new Error('実数が必要です');

  var jitsusu = Number(params.実数);
  if (isNaN(jitsusu) || jitsusu < 0) throw new Error('実数は0以上の数値を入力してください');

  // セッション存在・進行中チェック
  var sessions = getSheetData('T_棚卸セッション');
  var session = sessions.find(function(s) { return s['セッションID'] === params.sessionId; });
  if (!session) throw new Error('セッションが見つかりません');
  if (session['ステータス'] !== '進行中') throw new Error('このセッションは既に終了しています');

  // 品目情報取得
  var item = getItemById(params.品目ID);
  if (!item) throw new Error('品目ID ' + params.品目ID + ' が見つかりません');

  // 帳簿在庫取得
  var bookStock = getCurrentStockByItemId(params.品目ID);
  var diff = jitsusu - bookStock;
  var now = formatDateTime();

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('他の処理が実行中です');

  try {
    var sheet = getSheet('T_棚卸明細');
    var data = sheet.getDataRange().getValues();
    var headers = data[0];
    var sessionIdCol = headers.indexOf('セッションID');
    var itemIdCol = headers.indexOf('品目ID');

    // 同セッション・同品目の既存行を探す（上書き用）
    var existingRow = -1;
    for (var i = 1; i < data.length; i++) {
      if (data[i][sessionIdCol] === params.sessionId && data[i][itemIdCol] === params.品目ID) {
        existingRow = i + 1; // 1-indexed
        break;
      }
    }

    // T_棚卸明細列順: セッションID / 品目ID / 帳簿在庫 / 実数 / 差異 / カウント日時 / 備考
    var row = [params.sessionId, params.品目ID, bookStock, jitsusu, diff, now, ''];

    if (existingRow > 0) {
      sheet.getRange(existingRow, 1, 1, row.length).setValues([row]);
    } else {
      sheet.appendRow(row);
    }

    return {
      品名: item['品名'],
      帳簿在庫: bookStock,
      実数: jitsusu,
      差異: diff,
    };
  } finally {
    lock.releaseLock();
  }
}


// ===== 4. 棚卸サマリー取得 =====

function getStocktakeSummary(params) {
  requireGmailAuth(params.gmail, params.password);

  if (!params.sessionId) throw new Error('セッションIDが必要です');

  var details = getSheetData('T_棚卸明細')
    .filter(function(d) { return d['セッションID'] === params.sessionId; });

  var counted = details.filter(function(d) { return d['備考'] !== '未カウント'; }).length;
  var withDifference = details.filter(function(d) {
    return d['備考'] !== '未カウント' && Number(d['差異']) !== 0;
  }).length;

  // 帳簿在庫>0の全品目数から、カウント済み品目を引く
  var items = getItems();
  var countedItemIds = {};
  details.forEach(function(d) { countedItemIds[d['品目ID']] = true; });
  var uncounted = items.filter(function(item) {
    return getCurrentStockByItemId(item['品目ID']) > 0 && !countedItemIds[item['品目ID']];
  }).length;

  return { counted: counted, withDifference: withDifference, uncounted: uncounted };
}


// ===== 5. 棚卸終了 =====

function endStocktake(params) {
  var auth = requireGmailAuth(params.gmail, params.password);

  if (!params.sessionId) throw new Error('セッションIDが必要です');

  // セッション進行中チェック
  var sessionSheet = getSheet('T_棚卸セッション');
  var sessionData = sessionSheet.getDataRange().getValues();
  var sessionHeaders = sessionData[0];
  var sessionIdCol = sessionHeaders.indexOf('セッションID');
  var statusCol = sessionHeaders.indexOf('ステータス');
  var endTimeCol = sessionHeaders.indexOf('終了日時');

  var sessionRow = -1;
  for (var i = 1; i < sessionData.length; i++) {
    if (sessionData[i][sessionIdCol] === params.sessionId) {
      if (sessionData[i][statusCol] !== '進行中') throw new Error('このセッションは既に終了しています');
      sessionRow = i + 1;
      break;
    }
  }
  if (sessionRow < 0) throw new Error('セッションが見つかりません');

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('他の処理が実行中です');

  try {
    var now = formatDateTime();

    // 未カウント品目を差異ありとして追加
    var details = getSheetData('T_棚卸明細')
      .filter(function(d) { return d['セッションID'] === params.sessionId; });
    var countedItemIds = {};
    details.forEach(function(d) { countedItemIds[d['品目ID']] = true; });

    var items = getItems();
    var detailSheet = getSheet('T_棚卸明細');
    var uncountedItems = [];

    items.forEach(function(item) {
      if (countedItemIds[item['品目ID']]) return;
      var stock = getCurrentStockByItemId(item['品目ID']);
      if (stock <= 0) return;

      // T_棚卸明細列順: セッションID / 品目ID / 帳簿在庫 / 実数 / 差異 / カウント日時 / 備考
      detailSheet.appendRow([params.sessionId, item['品目ID'], stock, '', '', now, '未カウント']);
      uncountedItems.push({ 品目ID: item['品目ID'], 品名: item['品名'], 帳簿在庫: stock });
    });

    // セッションステータスを「完了待ち」に更新
    sessionSheet.getRange(sessionRow, statusCol + 1).setValue('完了待ち');
    sessionSheet.getRange(sessionRow, endTimeCol + 1).setValue(now);

    return { success: true, uncountedItems: uncountedItems };
  } finally {
    lock.releaseLock();
  }
}


// ===== 6. 棚卸セッション一覧取得（PC管理画面用）=====

function getStocktakeSessions(params) {
  requireGmailAuth(params.gmail, params.password);

  var sessions = getSheetData('T_棚卸セッション');
  var details = getSheetData('T_棚卸明細');
  var users = getSheetData('M_担当者');

  var userCache = {};
  users.forEach(function(u) { userCache[u['担当者ID']] = u['氏名'] || u['担当者ID']; });

  return sessions.map(function(s) {
    var sid = s['セッションID'];
    var sessionDetails = details.filter(function(d) { return d['セッションID'] === sid; });
    var counted = sessionDetails.filter(function(d) { return d['備考'] !== '未カウント'; }).length;
    var withDiff = sessionDetails.filter(function(d) {
      return d['備考'] !== '未カウント' && Number(d['差異']) !== 0;
    }).length;
    var uncounted = sessionDetails.filter(function(d) { return d['備考'] === '未カウント'; }).length;

    return {
      セッションID: sid,
      開始日時: s['開始日時'] || '',
      担当者名: userCache[s['担当者ID']] || s['担当者ID'] || '',
      ステータス: s['ステータス'] || '',
      終了日時: s['終了日時'] || '',
      承認者名: s['承認者ID'] ? (userCache[s['承認者ID']] || s['承認者ID']) : '',
      承認日時: s['承認日時'] || '',
      カウント数: counted,
      差異あり数: withDiff,
      未カウント数: uncounted,
    };
  }).reverse();
}


// ===== 7. 棚卸明細取得（PC管理画面用）=====

function getStocktakeDetail(params) {
  requireGmailAuth(params.gmail, params.password);

  if (!params.sessionId) throw new Error('セッションIDが必要です');

  var details = getSheetData('T_棚卸明細')
    .filter(function(d) { return d['セッションID'] === params.sessionId; });
  var items = getItems();
  var itemCache = {};
  items.forEach(function(i) { itemCache[i['品目ID']] = i; });

  return details.map(function(d) {
    var item = itemCache[d['品目ID']] || {};
    return {
      品目ID: d['品目ID'],
      品名: item['品名'] || d['品目ID'],
      帳簿在庫: d['帳簿在庫'],
      実数: d['実数'],
      差異: d['差異'],
      カウント日時: d['カウント日時'],
      備考: d['備考'] || '',
    };
  });
}


// ===== 8. 棚卸承認（在庫調整確定）=====

function approveStocktake(params) {
  var auth = requireGmailAuth(params.gmail, params.password);

  if (!params.sessionId) throw new Error('セッションIDが必要です');

  // セッション「完了待ち」チェック
  var sessionSheet = getSheet('T_棚卸セッション');
  var sessionData = sessionSheet.getDataRange().getValues();
  var sessionHeaders = sessionData[0];
  var sessionIdCol = sessionHeaders.indexOf('セッションID');
  var statusCol = sessionHeaders.indexOf('ステータス');
  var approverCol = sessionHeaders.indexOf('承認者ID');
  var approveTimeCol = sessionHeaders.indexOf('承認日時');

  var sessionRow = -1;
  for (var i = 1; i < sessionData.length; i++) {
    if (sessionData[i][sessionIdCol] === params.sessionId) {
      if (sessionData[i][statusCol] !== '完了待ち') throw new Error('承認できるのは「完了待ち」のセッションのみです');
      sessionRow = i + 1;
      break;
    }
  }
  if (sessionRow < 0) throw new Error('セッションが見つかりません');

  // 差異があるレコードを取得（未カウントは除く: 実数が不明なため調整不可）
  var details = getSheetData('T_棚卸明細')
    .filter(function(d) { return d['セッションID'] === params.sessionId; })
    .filter(function(d) {
      return d['備考'] !== '未カウント' && Number(d['差異']) !== 0;
    });

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('他の処理が実行中です');

  try {
    var now = formatDateTime();
    var adjustedCount = 0;

    // 差異ありレコードごとにT_入出庫に「棚卸調整」追加
    details.forEach(function(d) {
      appendInventoryRecord({
        区分: '棚卸調整',
        品目ID: d['品目ID'],
        数量: Number(d['差異']), // 正=増、負=減（符号付き）
        備考: '棚卸セッション ' + params.sessionId,
        ステータス: '確定',
      }, auth);
      adjustedCount++;
    });

    // セッションステータスを「確定」に更新
    sessionSheet.getRange(sessionRow, statusCol + 1).setValue('確定');
    sessionSheet.getRange(sessionRow, approverCol + 1).setValue(auth.userId);
    sessionSheet.getRange(sessionRow, approveTimeCol + 1).setValue(now);

    return { adjustedCount: adjustedCount };
  } finally {
    lock.releaseLock();
  }
}


// ===== dispatchAction に追加する case 文 =====
// 以下を既存の dispatchAction の switch 文内（default: の前）に追加:
//
//     // === 棚卸 ===
//     case 'startStocktake':
//       return startStocktake(params);
//     case 'recordStocktakeCount':
//       return recordStocktakeCount(params);
//     case 'getStocktakeSummary':
//       return getStocktakeSummary(params);
//     case 'endStocktake':
//       return endStocktake(params);
//     case 'getStocktakeSessions':
//       return getStocktakeSessions(params);
//     case 'getStocktakeDetail':
//       return getStocktakeDetail(params);
//     case 'approveStocktake':
//       return approveStocktake(params);
