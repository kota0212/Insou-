# INSOU メニュー閲覧システム 検証環境仕様

## 1. 目的

現在のMVPの見た目と店舗操作を維持しながら、本番と同じ `Next.js + Vercel + Supabase` 構成を検証する。GAS / Spreadsheet / Google Driveは旧MVPの暫定構成であり、今後のPDF配信経路では使用しない。

## 2. 技術構成

- Webアプリ：Next.js
- 検証・本番ホスティング：Vercel
- DB / Auth / Storage / RLS：Supabase
- PDF Storage：Private bucket `menu-pdfs`
- 端末キャッシュ：IndexedDB
- PDF表示：PDF.js + Canvas

## 3. 基本フロー

```text
管理者 → PDF登録 → Private Storage保存 → 公開店舗を割当
店舗 → Supabase Auth → 軽量メタデータ取得 → IndexedDB差分確認 → PDF表示
```

店舗には運用上1件のメニューを割り当て、ログイン後は一覧を経由せず開く。

### 試作モード

検証環境では `NEXT_PUBLIC_PROTOTYPE_MODE=true` により試作モードを有効化できる。環境変数の店舗コード・PIN（または管理者メール・パスワード）をログイン欄へ初期入力し、ログインボタン1回で通常のSupabase Authを実行する。本番では必ず無効にする。`NEXT_PUBLIC_*` の値はブラウザへ配信されるため、本番認証情報は設定しない。

## 4. PDF保存と同期

PDFはSupabase Private Storageへバイナリのまま保存する。Base64 JSON配信とGoogleの一時URLリダイレクトは使用しない。店舗はDBの `menuId + updatedAt` とIndexedDBを比較する。

### 初回利用

キャッシュがない場合だけ「最新のメニューを準備しています」を表示する。全体件数、完了件数、進捗率を表示し、対象PDFをBlobでIndexedDBへ保存する。

### 通常利用

同じ `menuId + updatedAt` のBlobがあればPDF本体は再取得せず、キャッシュから即表示する。

### PDF差し替え・公開変更

PDF本体専用の `pdf_updated_at` が変わったPDFだけ再取得して旧Blobを置換する。新規公開PDFは追加し、公開終了PDFはIndexedDBから削除する。

## 5. パスワードとPDF更新の分離

月次パスワード変更日とPDFの `updated_at` は別フィールドで管理する。パスワード変更だけでPDFを再同期しない。

## 6. PDFビューアー

PDF.js文書を1回だけ読み込み、全ページを順番にCanvasへ先読みする。カード切替、ピンチ拡大縮小、拡大中のパン、矢印キー、`+` / `-`、`0`、右上ページ番号を維持する。

## 7. セキュリティ

DBとStorageの両方でRLSを強制し、店舗Aは店舗BのメタデータとPDFを取得できない。ブラウザに `service_role` を公開しない。ダウンロード、共有、Storage URLリンクは設置しない。完全なDRMは対象外とする。

## 8. 外部設定待ち

Supabaseプロジェクト、migration、Authユーザー、検証データ、環境変数の設定完了までは外部設定待ちとする。未設定時にモックデータで成功扱いにしない。
