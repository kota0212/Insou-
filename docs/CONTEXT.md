# CONTEXT.md — プロジェクト全体概況とドキュメントルーター

> **Status**: CURRENT  
> **Last Updated**: 2026-09-24  
> **Target Audience**: AI Agents (ChatGPT / Codex / Antigravity), Developers  

本書は、リポジトリにアクセスしたAIが**最初（数分以内）に読む全体サマリーとルーティングガイド**です。

---

## 1. プロジェクト概要

- **プロダクト名**: INSOU 店舗メニュー閲覧システム
- **目的**: 100店舗以上のナイトレジャー飲食店（INSOUグループ）のタブレット端末において、本部から配信されたPDFメニューを安全・高画質・オフライン耐性（差分キャッシュ）を持って閲覧できるWebシステム。
- **解決する課題**:
  - 旧来の店舗固定パスワード共有による退職者からの不正閲覧リスク排除（OTPメール認証＋30日端末セッションへの移行）。
  - 旧MVP（Google Apps Script / Spreadsheet / Google Drive / Base64 JSON）のパフォーマンス・容量・セキュリティ制限の解消。

---

## 2. 現在のPhaseと主要ステータス

- **現在の正式な実行Phase**: **Phase 2: Production先行主要機能検証**
  - （※Verification環境では先行してPhase 2/3/4A相当の実装・テストが完了済み。現在は本番メール承認待ちの間にProductionで主要機能を先行確認するPhase 2を実施中）
- **作業ブランチ**: `migrate/vexum-canonical` (最新 HEAD: `25a5a756ece514c55e020388d6a5b2c89b725adf`)
- **稼働環境**:
  - **Verification環境 (検証)**:
    - URL: `https://insou-menu-verification.vercel.app`
    - Supabase: `cqlddcxvanwoxpaouzow`
    - 状態: Phase 2（Store OTP/Device Session）・Phase 3（Admin Operations）・Phase 4A（高画質PDF Canvas/ページめくりUX）先行実装済み。テスト全通過。
  - **Production環境 (本番)**:
    - URL: `https://insou-menu-system.vercel.app`
    - Supabase: `yzvencvfkltxehcjpgol`
    - 状態: Phase 2先行検証の対象（ユーザー許可を得た作業のみ実施）。初期スキーマ状態を維持。

---

## 3. 現在の技術構成

- **フロントエンド / ホスティング**: Next.js (App Router) / Vercel
- **バックエンド / DB / Auth**: Supabase (PostgreSQL, Supabase Auth, Row Level Security)
- **PDFストレージ**: Supabase Storage (`menu-pdfs` プライベートバケット)
- **端末キャッシュ**: IndexedDB (`insou-menu-pdf-cache`) ※menuId + updatedAtによる差分同期
- **PDFビューアー**: PDF.js (`pdfjs-dist/webpack.mjs`) + HTML Canvas (DPR 2.5x, 高精細レンダリング)
- **店舗端末認証**: メールOTP (6桁) → HMAC-SHA256照合 → 30日間 HttpOnly Cookie端末セッション (`insou_store_session`)
- **管理者認証**: Supabase Auth (Email/Password) + 招待メール + RLS (`admin` ロール)

---

## 4. 現在の最重要方針・注意点

1. **OTP機能はコードを破棄しない**:
   - Verificationで実装・テスト完了済み（41 tests pass）。
   - 本番メール基盤（Resend/SES等）の最終決定前のため、Production展開時にはOTPを一時停止して先行主要機能検証を行う計画があるが、Verification上のコードは完全に維持する。
2. **完全オフライン閲覧は禁止**:
   - 端末起動時およびPDF表示前にオンラインで端末セッション有効性をサーバー確認する（失効端末の即時停止とキャッシュ削除のため）。
3. **Production DBへの直接操作厳禁**:
   - 明示指示があるまでProduction Supabase (`yzvencvfkltxehcjpgol`) には一切手を加えない。

---

## 5. 作業別ドキュメント・ルーター

作業の目的に応じて、以下のドキュメントを参照してください：

| 作業内容 | 参照すべきファイル |
|---|---|
| **現在状態・実装進捗の確認** | [`docs/CURRENT_STATE.md`](./CURRENT_STATE.md) |
| **直前の作業内容・次のTODO** | [`docs/handoff/CURRENT.md`](./handoff/CURRENT.md), [`TODO.md`](../TODO.md) |
| **業務背景・UX・画面要件** | [`docs/PRODUCT.md`](./PRODUCT.md), [`docs/REQUIREMENTS.md`](./REQUIREMENTS.md) |
| **全体システム構成・通信フロー** | [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md) |
| **DB設計・テーブル・RPC・RLS** | [`docs/DATABASE.md`](./DATABASE.md), [`supabase/migrations/`](../supabase/migrations/) |
| **認証・認可・秘密鍵・セキュリティ** | [`docs/SECURITY.md`](./SECURITY.md), [`docs/decisions/ADR-0002-store-auth-otp-and-device-session.md`](./decisions/ADR-0002-store-auth-otp-and-device-session.md) |
| **設計判断の経緯・理由の確認** | [`docs/decisions/README.md`](./decisions/README.md) 配下のADR |
| **過去のバグ・罠・トラブルシュート** | [`docs/troubleshooting/README.md`](./troubleshooting/README.md) |
| **過去の作業履歴（月次）** | [`docs/history/`](./history/) |
| **ローカル開発環境構築** | [`docs/DEVELOPMENT.md`](./DEVELOPMENT.md), [`README.md`](../README.md) |
