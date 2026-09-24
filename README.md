# INSOU 店舗メニュー閲覧システム

INSOUグループ（100店舗以上）のタブレット端末向けに、本部から高画質なPDFメニューを安全・瞬時に配信・閲覧するためのWebシステムです。

> **AI / 開発エージェントの方へ**:
> 作業を開始する前に、必ず [**`AGENTS.md`**](./AGENTS.md) および [**`docs/CONTEXT.md`**](./docs/CONTEXT.md) を最初に読んでください。
> チャット履歴ではなく、本リポジトリが唯一の正式な情報源（Single Source of Truth）です。

---

## 1. 主要機能と特徴

- **安全な店舗端末認証**: 固定パスワードを全廃。店舗通知用メール宛のOTP（ワンタイムコード）による認証と、30日間の端末セッションCookie（`HttpOnly`）による自動ログイン。
- **高画質・オフライン耐性**: Supabase Private Storageにバイナリ保存されたPDFをIndexedDBに安全キャッシュ。2回目以降は更新日時（`pdf_updated_at`）の差分チェックのみで瞬時表示。
- **モダンなPDFビューアー**: PDF.js + HTML5 Canvas（端末DPR 2.5x対応）による高精細描画、3D本めくりアニメーション、ピンチズーム・パン移動。
- **強固な統制機能**: 管理画面からの店舗全端末一括ログアウト、登録台数と実端末数の自動照合によるセキュリティアラート検知、日本語操作ログ。

---

## 2. 技術構成

- **フロントエンド / ホスティング**: Next.js 15 (App Router) / Vercel
- **バックエンド / DB**: Supabase (PostgreSQL, Row Level Security, RPC)
- **認証**: Supabase Auth (管理者) / メールOTP + HttpOnly Cookie (店舗)
- **PDFストレージ**: Supabase Storage (`menu-pdfs` プライベートバケット)
- **端末キャッシュ**: ブラウザ IndexedDB (`insou-menu-pdf-cache`)

※ 旧MVPで試作されたGoogle Apps Script (GAS) / Spreadsheet / Drive 連携は**完全廃止（非推奨）** となっています。

---

## 3. クイックスタート（ローカル環境）

```bash
# 依存パッケージインストール
npm install

# 環境変数の準備
cp .env.example .env.local

# 開発サーバー起動
npm run dev
```

- 店舗画面: `http://localhost:3000/store` (または `/`)
- 管理画面: `http://localhost:3000/admin`

詳細なセットアップやテストコマンドは [`docs/DEVELOPMENT.md`](./docs/DEVELOPMENT.md) を参照してください。

---

## 4. ドキュメント案内（Single Source of Truth）

本プロジェクトの仕様・設計・決定事項はすべて `docs/` に分類・保管されています。

| ドキュメント | 役割・内容 |
|---|---|
| [**`AGENTS.md`**](./AGENTS.md) | **全AI・開発者の共通行動規範、作業開始・終了ルール** |
| [**`docs/CONTEXT.md`**](./docs/CONTEXT.md) | **プロジェクト全体概況と作業別ドキュメント案内（最初に読む）** |
| [**`docs/CURRENT_STATE.md`**](./docs/CURRENT_STATE.md) | 現在の環境・実装・既知の問題・客観的事実 |
| [**`TODO.md`**](./TODO.md) | 現在未完了のPhase別タスク一覧 |
| [**`docs/PRODUCT.md`**](./docs/PRODUCT.md) | プロダクトの目的、解決する課題、UX定義 |
| [**`docs/REQUIREMENTS.md`**](./docs/REQUIREMENTS.md) | 正式要件定義（Confirmed / Pending / Deprecated） |
| [**`docs/ARCHITECTURE.md`**](./docs/ARCHITECTURE.md) | 全体システムアーキテクチャ・通信フロー・環境分離 |
| [**`docs/DATABASE.md`**](./docs/DATABASE.md) | テーブル定義、ER図、ストアドファンクション(RPC)、RLS |
| [**`docs/SECURITY.md`**](./docs/SECURITY.md) | 認証・認可境界、鍵管理、暗号化、レート制限 |
| [**`docs/DEVELOPMENT.md`**](./docs/DEVELOPMENT.md) | 開発環境構築、自動テスト実行手順 |
| [**`docs/decisions/`**](./docs/decisions/) | 重要な意思決定の記録（ADR-0001 〜 ADR-0006） |
| [**`docs/troubleshooting/`**](./docs/troubleshooting/) | 過去の重大トラブルの原因・調査・解決記録（TS-0001 〜） |
| [**`docs/history/`**](./docs/history/) | 月次のマイルストーン作業履歴 |
| [**`docs/handoff/CURRENT.md`**](./docs/handoff/CURRENT.md) | 直前の作業結果と次の作業への引き継ぎメモ |
| [**`docs/archive/`**](./docs/archive/) | 過去の旧仕様・計画書メモ（非推奨・参考用） |
