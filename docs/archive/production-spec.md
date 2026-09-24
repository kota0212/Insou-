# INSOU メニュー閲覧システム 本番仕様

## 1. 正式構成

- Frontend / Hosting: Next.js / Vercel
- Backend: Supabase Database / Auth / Private Storage / RLS
- Device cache: IndexedDB
- Viewer: PDF.js / Canvas

GAS PDF配信、Spreadsheetの業務DB利用、Google Drive PDF保存、Base64 JSON配信は旧MVP限定の暫定構成とし、本番では廃止する。

## 2. データモデル

- `stores`: 店舗コード、店舗名、エリア、パスワード更新日、最終ログイン。
- `user_profiles`: Supabase Authユーザーの `admin/store` ロールと店舗の紐付け。
- `menus`: タイトル、元ファイル名、Private Storage path、公開状態、一般更新日 `updated_at`、PDF本体更新日 `pdf_updated_at`。
- `menu_store_assignments`: PDFと公開店舗の多対多関係。

UUIDを主キーとし、店舗割当て検索用索引を持つ。閲覧ログ、管理者、月次パスワード運用、100店舗以上へ拡張できる。

## 3. 認証とRLS

Supabase Authで認証し、`user_profiles` からロールと店舗を確定する。店舗は自店舗の行と、自店舗に公開中のメニューのみ参照できる。管理者のみが店舗、メニュー、割当、Storage objectを更新できる。

RLSはDatabaseと `storage.objects` の両方で強制する。`service_role` キーをブラウザと `NEXT_PUBLIC_*` に公開しない。

## 4. PDF保存と配信

PDFはPrivate bucket `menu-pdfs` へバイナリのまま保存する。Base64変換と巨大JSON応答は使用しない。認証セッション付きのStorage downloadまたは短時間のSigned URLを使用し、URLをUIへ表示しない。

## 5. PDF差分同期

ログイン後はDBから軽量メタデータのみ取得し、`menuId + updatedAt` をIndexedDBと比較する。

- キャッシュなし：必要なPDFを取得し「最新のメニューを準備しています」を表示する。
- 変更なし：Storage通信を行わずIndexedDBから即表示する。
- PDF差し替え：`pdf_updated_at` が変わったPDFだけ取得して置換する。
- 新規公開：対象PDFを追加する。
- 公開終了：対象PDFをIndexedDBから削除する。

パスワード変更日とPDF更新日は分離し、月次パスワード変更だけでPDFを再同期しない。

## 6. ログイン速度

Supabase Authセッションを保持する。認証後は店舗情報とPDFメタデータを並列取得し、差分がなければPDF本体を取得しない。

## 7. ビューアーと端末保存

PDFはIndexedDBにBlobとして保存し、FilesアプリやDownloadsに保存しない。PDF.jsの全ページ先読みとCanvas切り替えを維持する。ダウンロード、共有、直接URLのUIは設置しない。完全なDRMは要件外とする。

## 8. 後続フェーズ

月次パスワード生成・Auth更新・Gmail通知、閲覧ログ、PWA / Service Worker、完全オフライン、監視、バックアップ、復旧手順は後続実装とする。パスワード本体はDBとログに平文保存しない。
