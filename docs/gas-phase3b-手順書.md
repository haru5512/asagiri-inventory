# Phase 3b GAS適用手順書

## 1. スプレッドシートに新しいシートを作成

### T_棚卸セッション

1行目（ヘッダー）に以下を入力:

| A | B | C | D | E | F | G |
|---|---|---|---|---|---|---|
| セッションID | 開始日時 | 担当者ID | ステータス | 終了日時 | 承認者ID | 承認日時 |

### T_棚卸明細

1行目（ヘッダー）に以下を入力:

| A | B | C | D | E | F | G |
|---|---|---|---|---|---|---|
| セッションID | 品目ID | 帳簿在庫 | 実数 | 差異 | カウント日時 | 備考 |

## 2. SHEETS定数に追加

GASエディタで既存の `const SHEETS = { ... }` を探し、以下の2行を追加:

```javascript
  T_STOCKTAKE_SESSION: 'T_棚卸セッション',
  T_STOCKTAKE_DETAIL: 'T_棚卸明細',
```

## 3. 棚卸API関数を貼り付け

`docs/gas-phase3b.js` の内容をGASエディタの末尾にコピペ。

関数内ではシート名を文字列リテラル（`'T_棚卸セッション'` 等）で直接参照しているので、
SHEETS定数への追加は他コードとの一貫性のため。

## 4. dispatchAction に case を追加

既存の `dispatchAction` 関数の switch 文内（`default:` の前）に以下を追加:

```javascript
    // === 棚卸 ===
    case 'startStocktake':
      return startStocktake(params);
    case 'recordStocktakeCount':
      return recordStocktakeCount(params);
    case 'getStocktakeSummary':
      return getStocktakeSummary(params);
    case 'endStocktake':
      return endStocktake(params);
    case 'getStocktakeSessions':
      return getStocktakeSessions(params);
    case 'getStocktakeDetail':
      return getStocktakeDetail(params);
    case 'approveStocktake':
      return approveStocktake(params);
```

## 5. 新しいバージョンとしてデプロイ

GASエディタ → デプロイ → デプロイを管理 → 新しいバージョン

**重要:** 「新しいバージョン」を選択してデプロイすること。既存バージョンの上書きでは反映されない。

## 6. 動作確認

ブラウザで以下のURLにアクセスして正常レスポンスを確認:

```
<<GAS_URL>>?action=getStocktakeSessions&gmail=<<EMAIL>>&password=<<PASSWORD>>
```

期待されるレスポンス（まだセッションがない場合）:
```json
{
  "success": true,
  "action": "getStocktakeSessions",
  "data": []
}
```
