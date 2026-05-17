// ============================================================
// Phase 3a 追加: PWA連携用の認証変更 + 新規API
// このコードを GAS エディタの既存コードに追記する
// ============================================================

// ===== 1. Gmail パラメータ認証 =====
// 既存の requireAuth() の代わりに使う簡易認証
// PWA から送られてくる gmail パラメータで M_担当者 を照合する

/**
 * Gmail パラメータで担当者を認証（PWA用簡易認証）
 * @param {string} gmail メールアドレス
 * @returns {Object} 認証結果（authenticate() と同じ形式）
 */
function authenticateByGmail(gmail) {
  if (!gmail) {
    return {
      authenticated: false,
      reason: 'NO_GMAIL',
      message: '担当者メールが未指定です',
    };
  }

  const user = findUserByEmail(gmail);

  if (!user) {
    return {
      authenticated: false,
      reason: 'NOT_REGISTERED',
      message: 'このメールアドレスは担当者マスターに登録されていません',
      email: gmail,
    };
  }

  return {
    authenticated: true,
    email: gmail,
    userId: user['担当者ID'],
    name: user['氏名'],
    role: user['役割'],
    isAdmin: user['役割'] === '管理者',
    isStaff: user['役割'] === '現場',
    isOffice: user['役割'] === '事務',
  };
}

/**
 * Gmail パラメータ必須チェック（PWA用）
 * @param {string} gmail
 * @returns {Object} 認証結果
 * @throws {Error} 認証失敗時
 */
function requireGmailAuth(gmail) {
  const auth = authenticateByGmail(gmail);
  if (!auth.authenticated) {
    throw new Error(auth.message);
  }
  return auth;
}


// ===== 2. 既存関数の変更 =====
// 以下の関数内の requireAuth() を requireGmailAuth(params.gmail) に変更する
//
// ■ recordStockIn (行723付近)
//   変更前: const auth = requireAuth();
//   変更後: const auth = params.gmail ? requireGmailAuth(params.gmail) : requireAuth();
//
// ■ recordStockOut (行757付近)
//   変更前: const auth = requireAuth();
//   変更後: const auth = params.gmail ? requireGmailAuth(params.gmail) : requireAuth();
//
// ■ recordStockMove (行1193付近)
//   変更前: const auth = requireAuth();
//   変更後: const auth = params.gmail ? requireGmailAuth(params.gmail) : requireAuth();
//
// ■ getLocations (行490付近)
//   変更前: requireAuth();
//   変更後: // requireAuth(); を削除（読み取り専用なので認証不要）
//
// ■ registerLot (行1669付近)
//   変更前: const auth = requireAuth();
//   変更後: const auth = params.gmail ? requireGmailAuth(params.gmail) : requireAuth();
//
// ■ recordStockOutWithLot (行1811付近)
//   変更前: const auth = requireAuth();
//   変更後: const auth = params.gmail ? requireGmailAuth(params.gmail) : requireAuth();
//
// ■ discardLot (行1993付近)
//   変更前: const auth = requireAdmin();
//   変更後: const auth = params.gmail ? requireGmailAuth(params.gmail) : requireAdmin();
//
// ■ getActiveLots (行1741付近)
//   変更前: requireAuth();
//   変更後: // requireAuth(); を削除（読み取り専用）
//
// ■ getCurrentStockList (行955付近)
//   変更前: requireAuth(); (getItems内で呼ばれる)
//   → getItems 内の requireAuth() を削除
//
// ■ getCurrentStockByItemId (行941付近)
//   変更前: requireAuth();
//   変更後: // requireAuth(); を削除（内部関数として使われる）


// ===== 3. dispatchAction の変更 =====
// params.gmail を各関数に渡すようにする
//
// 以下の case を修正:
//
// case 'recordStockIn':
//   return recordStockIn({
//     gmail: params.gmail,        // ← 追加
//     品目ID: params.品目ID,
//     数量: Number(params.数量),
//     単価: params.単価 ? Number(params.単価) : undefined,
//     場所ID: params.場所ID,
//     備考: params.備考,
//   });
//
// case 'recordStockOut':
//   return recordStockOut({
//     gmail: params.gmail,        // ← 追加
//     品目ID: params.品目ID,
//     数量: Number(params.数量),
//     場所ID: params.場所ID,
//     備考: params.備考,
//   });
//
// case 'recordStockMove':
//   return recordStockMove({
//     gmail: params.gmail,        // ← 追加
//     品目ID: params.品目ID,
//     数量: Number(params.数量),
//     場所ID: params.場所ID,
//     移動先場所ID: params.移動先場所ID,
//     備考: params.備考,
//   });
//
// case 'registerLot':
//   return registerLot({
//     gmail: params.gmail,        // ← 追加
//     品目ID: params.品目ID,
//     入庫数量: Number(params.入庫数量),
//     ロット番号: params.ロット番号,
//     賞味期限: params.賞味期限,
//     備考: params.備考,
//   });
//
// case 'recordStockOutWithLot':
//   return recordStockOutWithLot({
//     gmail: params.gmail,        // ← 追加
//     品目ID: params.品目ID,
//     数量: Number(params.数量),
//     場所ID: params.場所ID,
//     備考: params.備考,
//   });
//
// case 'discardLot':
//   return discardLot(params.ロットID, params.廃棄理由, params.gmail);  // ← gmail追加


// ===== 4. 新規API: getAllLots (PC管理画面用) =====

/**
 * 全ロット一覧を取得（品名・カテゴリを結合）
 * PC管理画面の「賞味期限」タブで使用
 * @returns {Array<Object>}
 */
function getAllLots() {
  const lots = getSheetData('T_ロット')
    .filter(function(lot) { return lot['ステータス'] === '有効' && Number(lot['残数量']) > 0; });

  // 品目情報をキャッシュして結合
  var itemCache = {};
  var items = getSheetData(SHEETS.M_ITEM);
  items.forEach(function(item) {
    itemCache[item['品目ID']] = item;
  });

  return lots.map(function(lot) {
    var item = itemCache[lot['品目ID']] || {};
    return {
      品目ID: lot['品目ID'],
      品名: item['品名'] || '不明',
      大カテゴリ: item['大カテゴリ'] || '',
      ロットID: lot['ロットID'],
      ロット番号: lot['ロット番号'],
      残数量: Number(lot['残数量']),
      賞味期限: lot['賞味期限'] ? Utilities.formatDate(new Date(lot['賞味期限']), 'Asia/Tokyo', 'yyyy-MM-dd') : '',
      ステータス: lot['ステータス'],
    };
  }).sort(function(a, b) {
    if (!a['賞味期限'] || !b['賞味期限']) return 0;
    return a['賞味期限'] < b['賞味期限'] ? -1 : 1;
  });
}


// ===== 5. 新規API: getTransactionHistory (PC管理画面用) =====

/**
 * 入出庫履歴を取得（品名・場所名を結合）
 * PC管理画面の「入出庫履歴」タブで使用
 * @returns {Array<Object>}
 */
function getTransactionHistory() {
  var data = getSheetData(SHEETS.T_INVENTORY);

  // 品目・場所マスターをキャッシュ
  var itemCache = {};
  getSheetData(SHEETS.M_ITEM).forEach(function(item) {
    itemCache[item['品目ID']] = item;
  });

  var locCache = {};
  getSheetData(SHEETS.M_LOCATION).forEach(function(loc) {
    locCache[loc['場所ID']] = loc;
  });

  // 確定 or 承認済のレコードのみ
  return data
    .filter(function(row) {
      return row['ステータス'] === '確定' || row['ステータス'] === '承認済';
    })
    .map(function(row) {
      var item = itemCache[row['品目ID']] || {};
      var loc = locCache[row['場所ID']] || {};
      return {
        日時: row['日時'] || '',
        区分: row['区分'] || '',
        品目ID: row['品目ID'] || '',
        品名: item['品名'] || '不明',
        大カテゴリ: item['大カテゴリ'] || '',
        数量: Number(row['数量']) || 0,
        場所名: loc['場所名'] || row['場所ID'] || '',
        Gmail: row['Gmail'] || '',
      };
    })
    .sort(function(a, b) {
      // 日時の新しい順
      return a['日時'] > b['日時'] ? -1 : 1;
    });
}


// ===== 6. dispatchAction に新規 case を追加 =====
// 以下を dispatchAction の switch 文に追加:
//
//     // === PC管理画面用 ===
//     case 'getAllLots':
//       return getAllLots();
//     case 'getTransactionHistory':
//       return getTransactionHistory();
