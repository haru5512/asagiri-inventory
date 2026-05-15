# Asagiri Inventory

あさぎり商社向け在庫管理PWA

## これは何か

スマホのカメラでバーコード/QRコードを読み取り、品目マスターから該当品目の情報を検索・表示するPWAアプリです。

## 動かし方

1. このリポジトリを GitHub Pages で公開する
2. `config.js` の `WEB_APP_URL` を GAS Web App の公開URLに書き換える
3. ブラウザでアクセスし「スキャン開始」または「手入力」で品目を検索

### 必要な環境

- GAS Web App がデプロイ済みであること（Phase 1-E 完了済み）
- HTTPS 環境（GitHub Pages なら自動）

## 構成

| ファイル | 内容 |
|---|---|
| index.html | メイン画面（SPA形式） |
| app.js | アプリロジック |
| style.css | スタイル |
| config.js | 設定（WEB_APP_URL） |
| sw.js | Service Worker |
| manifest.json | PWA マニフェスト |
| icons/ | アプリアイコン |

## 次の Phase

- Phase 3: 入出庫PWA + 棚卸モード + 設定画面 + キャッシュ更新機構
