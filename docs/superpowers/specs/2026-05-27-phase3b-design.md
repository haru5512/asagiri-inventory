# Phase 3b 設計書

## 概要

Phase 3b は3つの機能を追加する:
1. 棚卸モード（メイン機能）
2. キャッシュ更新機構
3. 設定画面の拡充

---

## 1. 棚卸モード

### 運用フロー

1. 現場担当がスマホで棚卸を開始（セッション自動生成）
2. バーコードスキャンで1品ずつカウント → リアルタイム送信
3. 終了時に未カウント品目を「差異あり」として自動記録
4. 管理者がPC画面で確認・承認 → T_入出庫に棚卸調整レコード追加

### PWA 画面フロー（5画面追加）

```
screen-top（トップメニュー）
  └─ [棚卸開始] ボタン
       │
       v
screen-st-start（棚卸開始画面）
  - 「棚卸を開始しますか？」確認
  - [開始] → GAS startStocktake → セッションID取得
       │
       v
screen-st-scan（棚卸スキャン画面）
  - ヘッダーに「棚卸中 (n品カウント済)」表示
  - バーコードスキャン or 手入力
  - スキャン → 品目情報取得 → screen-st-count へ
       │
       v
screen-st-count（実数入力画面）
  - 品名・帳簿在庫を表示
  - 実数入力欄
  - [送信] → GAS recordStocktakeCount
  - 成功 → screen-st-scan に戻る（続けてスキャン）
  - 通信エラー → エラー表示 + 再送ボタン（送信完了まで次に進めない）
       │
       （終了ボタン押下時）
       v
screen-st-summary（棚卸サマリー画面）
  - GAS getStocktakeSummary でカウント済・差異あり・未カウント数を取得
  - [棚卸を終了] → GAS endStocktake（未カウント品目を差異ありとして自動記録）
       │
       v
screen-st-done（棚卸完了画面）
  - 「棚卸セッション完了。管理者の承認をお待ちください」
  - [トップに戻る]
```

### 同一品目の再スキャン

同セッション・同品目を再スキャンした場合は上書き（最新の実数で更新）。

### GAS 新規API

| API名 | パラメータ | 処理内容 | 戻り値 |
|---|---|---|---|
| startStocktake | gmail, password | T_棚卸セッションに行追加（セッションID自動生成、ステータス=進行中） | `{ sessionId, startTime }` |
| recordStocktakeCount | gmail, password, sessionId, 品目ID, 実数 | T_棚卸明細に記録（帳簿在庫はその時点の値を取得して保存、差異=実数-帳簿在庫）。同セッション・同品目は上書き | `{ 品名, 帳簿在庫, 実数, 差異 }` |
| getStocktakeSummary | gmail, password, sessionId | セッションの集計 | `{ counted, withDifference, uncounted }` |
| endStocktake | gmail, password, sessionId | 帳簿在庫>0の未カウント品目をT_棚卸明細に「未カウント」として追加。セッションステータス=完了待ち | `{ success, uncountedItems }` |

### 新規スプレッドシートのシート

**T_棚卸セッション**

| 列名 | 型 | 説明 |
|---|---|---|
| セッションID | 文字列 | 自動生成（例: ST-20260527-001） |
| 開始日時 | 日時 | セッション開始時刻 |
| 担当者ID | 文字列 | M_担当者の担当者ID |
| ステータス | 文字列 | 進行中 / 完了待ち / 確定 |
| 終了日時 | 日時 | endStocktake 実行時 |
| 承認者ID | 文字列 | approveStocktake 実行時 |
| 承認日時 | 日時 | approveStocktake 実行時 |

**T_棚卸明細**

| 列名 | 型 | 説明 |
|---|---|---|
| セッションID | 文字列 | T_棚卸セッションと紐づけ |
| 品目ID | 文字列 | M_品目の品目ID |
| 帳簿在庫 | 数値 | カウント時点の帳簿上在庫数 |
| 実数 | 数値 | 現場担当の入力値（未カウントの場合は空） |
| 差異 | 数値 | 実数 - 帳簿在庫（未カウントの場合は空） |
| カウント日時 | 日時 | recordStocktakeCount 実行時 |
| 備考 | 文字列 | 未カウント品目の場合「未カウント」 |

---

## 2. PC管理画面の棚卸承認機能

### inventory.html に4つ目のタブ「棚卸」を追加

```
[現在在庫] [賞味期限] [入出庫履歴] [棚卸]
```

### 棚卸タブの内容

- セッション一覧テーブル（日時、担当者名、ステータス、カウント数、差異数）
- ステータスが「完了待ち」のセッションに [詳細] ボタン

### 詳細モーダル

- 棚卸明細テーブル（品目名、帳簿在庫、実数、差異、備考）
- 差異ありの行をハイライト表示
- 未カウント品目は「未カウント」表示
- [承認して在庫調整] ボタン → approveStocktake API
- 承認後、ステータスが「確定」に変わる

### PC管理画面用の追加API

| API名 | パラメータ | 戻り値 |
|---|---|---|
| getStocktakeSessions | gmail, password | セッション一覧（全件） |
| getStocktakeDetail | gmail, password, sessionId | 棚卸明細一覧（品目名付き） |
| approveStocktake | gmail, password, sessionId | 差異ありレコードごとにT_入出庫に「棚卸調整」追加。セッションステータス=確定。`{ adjustedCount }` |

### 棚卸調整レコードの形式（T_入出庫）

- 区分: 「棚卸調整」
- 数量: 差異の値（正=増、負=減）
- 備考: 「棚卸セッション ST-XXXXXXXX-XXX」

---

## 3. キャッシュ更新機構

### 場所データの自動更新

- アプリ起動時に `CACHED_LOCATIONS_TIMESTAMP`（localStorage）をチェック
- 前回取得から24時間以上経過していたら `getLocations` を自動で再取得
- バックグラウンド実行（UIをブロックしない、失敗してもキャッシュで動作）
- 既存の手動再取得ボタンはそのまま残す

### 実装箇所

- `app.js` の初期化処理（DOMContentLoaded）に自動チェックロジックを追加

---

## 4. 設定画面の拡充

### 追加表示項目

| 項目 | 内容 | データソース |
|---|---|---|
| 担当者情報 | 氏名・役割を表示 | 認証成功時にlocalStorage保存 |
| アプリバージョン | CONFIG.APP_VERSION を表示 | config.js |
| 同期状態 | 場所データの最終取得日時 | CACHED_LOCATIONS_TIMESTAMP |

### 担当者情報の取得タイミング

- 設定画面でGmail・パスワード保存時に認証APIを呼び、成功したら氏名・役割をlocalStorageに保存
- 既存の `authenticateByGmail` の戻り値（name, role）を利用

### GAS側の追加API

なし（フロントのみの変更）

---

## ファイル変更一覧

### 新規・変更ファイル（フロント）

| ファイル | 変更内容 |
|---|---|
| index.html | 棚卸5画面追加、トップメニューに棚卸ボタン、設定画面に表示項目追加 |
| app.js | 棚卸フロー全体、キャッシュ自動更新、設定画面拡充 |
| style.css | 棚卸画面のスタイル |
| inventory.html | 棚卸タブ追加、承認モーダル追加 |
| inventory.js | 棚卸タブロジック、セッション一覧・詳細・承認 |
| inventory.css | 棚卸タブ・モーダルのスタイル |
| config.js | APP_VERSION 更新 |

### GAS側（ユーザーが手動で反映）

- 新規API 7本: startStocktake, recordStocktakeCount, getStocktakeSummary, endStocktake, getStocktakeSessions, getStocktakeDetail, approveStocktake
- doGet のルーティングに上記7アクションを追加
- 新規シート2つ: T_棚卸セッション, T_棚卸明細
