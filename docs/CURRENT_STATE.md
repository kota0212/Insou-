# CURRENT_STATE.md — システム現在状態

> **Status**: CURRENT  
> **Last Verified**: 2026-09-24  
> **Source of Truth**: 実コード・DB migrations・Vercel deployment確認結果  

本書は、システムおよび各環境の**「現在の客観的事実」**のみを記録したドキュメントです。過去の推移や歴史は含みません。

---

## 1. 環境とデプロイ状況

| 項目 | Verification (検証環境) | Production (本番環境) |
|---|---|---|
| **URL** | `https://insou-menu-verification.vercel.app` | `https://insou-menu-system.vercel.app` |
| **Vercel Project** | `vexum2/insou-menu-system` (Preview alias) | `vexum2/insou-menu-system` (Production) |
| **デプロイ対象ブランチ** | `migrate/vexum-canonical` (最新プッシュが自動ビルド) | 初期リリース状態のまま固定（変更禁止） |
| **Supabase Project Ref** | `cqlddcxvanwoxpaouzow` | `yzvencvfkltxehcjpgol` |
| **適用済み Migrations** | `202609100001` 〜 `202609110006`（計6件 適用済み） | `202609100001`（CLI履歴テーブル同期完了・applied） |
| **メール送信基盤** | Resend API (`RESEND_API_KEY` 設定済み) | 未設定（実店舗メール未送信） |
| **認証方式（店舗）** | メールOTP + 30日端末Cookieセッション | 旧方式（固定パスワード）のまま停止中 |
| **認証方式（管理者）** | Supabase Auth招待メール + パスワード | Supabase Auth |

---

## 2. Git ブランチとフェーズ情報

- **現在の作業ブランチ**: `migrate/vexum-canonical`
  - 最新HEAD SHA、ahead/behind、working tree等の動的状態は、作業開始時に `git status`, `git log`, `git fetch` または GitHub remote から都度取得してください（ドキュメント内に固定保存しません）。
- **現在の正式な実行Phase**: **Phase 2: Production先行主要機能検証**
  - **重要**: 実装・テスト履歴としては Verification環境において Phase 2 (Store Auth/Device Session), Phase 3 (Admin Operations), Phase 4A (高画質PDF Canvas/ページ送り) 相当の実装と自動テストが先行完了しています。
  - プロジェクト全体の正式な実行フェーズとしては、本番メール基盤（INSOU本部側）の承認待ちの間に、Production環境でOTP以外の主要機能（DB, Storage, Auth, キャッシュ, ビューアー）の健全性を先に検証・完了させる「Phase 2」に位置づけられています。
- **mainブランチとの関係**: `origin/main` から派生後、Verification向け機能実装・セキュリティ強化・PDF品質改善・SSOT整備が進んでいる状態。Production検証完了までmainへのmergeは保留。

---

## 3. 機能別の実装状態

### 3.1 Verification環境での実装・検証完了状況（先行実装済み）

- **PDFビューアー高画質化・ページ送り (Phase 4A相当)**:
  - PDF.js Webpack worker連携 (`pdfjs-dist/webpack.mjs`)。
  - Canvas DPR（最大2.5x、12MP制限）高精細描画。
  - ResizeObserver親要素監視・8px閾値による再描画ループ解消。
  - 本めくり3Dエフェクト（裏面ページ透過、指追従スワイプ、ピンチズーム・パン移動）。
- **店舗端末認証 API & DB (Phase 2相当)**:
  - 店舗名検索API (`GET /api/store-auth/stores?q=`) ※is_active=trueのみ、部分一致、メールアドレス隠蔽、レート制限。
  - OTP発行・HMAC保存 (`POST /api/store-auth/request-otp`) ※challenge_id先行生成、HMAC-SHA256、15分有効。
  - OTPメール送信 (`lib/store-auth/email.ts`) ※Resend連携、送信失敗時のchallenge自動失効。
  - OTP検証・30日端末セッション作成 (`POST /api/store-auth/verify-otp`) ※5回制限、HttpOnly Cookie (`insou_store_session`)。
  - 店舗セッション検証 (`GET /api/store-auth/session`)。
  - 店舗ログアウト (`POST /api/store-auth/logout`) ※Cookie削除、セッション失効。
  - 自店舗公開メニュー取得 (`GET /api/store-auth/menus`) ※自店舗割当かつ公開中のみ。
  - PDF認可・署名付きURL取得 (`GET /api/store-auth/pdf/[id]`) ※60秒有効短縮URL、ストレージパス完全隠蔽。
  - 永続化レート制限 (`store_auth_rate_limits` テーブル & `check_and_increment_rate_limit` RPC)。
  - 自動台数照合・未解決アラート自動解決 (`reconcile_store_tablet_count` RPC)。
- **管理者運用機能 (Phase 3)**:
  - Supabase Auth招待メール連携による管理者追加 (`POST /api/admin/users`)。
  - パスワード再設定メール送信 (`POST /api/admin/users` action=reset_password)。
  - 自分自身および最後の管理者の削除防止ガード (`DELETE /api/admin/users`)。
  - 店舗一覧・登録端末数・未解決アラート件数表示 (`GET /api/admin/stores`)。
  - 店舗ごとの全端末一括失効 (`POST /api/admin/stores/revoke-all`)。
  - 個別端末失効 (`POST /api/admin/devices/revoke`)。
  - セキュリティアラート一覧・解決 (`GET/POST /api/admin/security-alerts`)。
  - 操作ログ（監査ログ）取得 (`GET /api/admin/audit-logs`) ※主要アクションの日本語表記。
- **端末キャッシュ (Phase 1/2)**:
  - IndexedDB (`insou-menu-pdf-cache`) によるPDF Blob保存。
  - `menuId + pdfUpdatedAt` 比較による最小差分同期。
  - 割当解除・公開終了PDFのキャッシュ自動パージ。

### 3.2 部分実装・現在停止中の機能

- **店舗画面のOTPログイン切替**:
  - `components/store-otp-login.tsx` 実装済み。
  - 現行の `app/page.tsx` では、検証用フラグおよびProduction移行フェーズ（Phase 2 Production検証）の計画に合わせて、従来の固定パスワードログイン表示と共存可能な状態。
- **本番メール送信基盤**:
  - VerificationではResendでテスト送信可能。
  - 本番用ドメイン・メールサービス（ResendまたはAmazon SES）はINSOU本部承認待ち。

### 3.3 未実装の機能

- 店舗詳細UI専用タブ画面（店舗一覧モーダル内で対応中）。
- 外部通知Webhook（重大アラート発生時のSlack/メール等への自動プッシュ通知）。
- 完全オフラインPWA（完全オフライン閲覧はセキュリティ方針により**明示的に不採用**）。

---

## 4. 自動テスト・検証状況

- **Store Auth自動テスト**: `npm run test:store-auth` → **41 Passed / 0 Failed** (Zero Leakage, Rate Limit, Revocation, Session)
- **Admin API自動テスト**: `npm run test:admin-api` → **全テスト PASS** (招待・削除ガード・一括ログアウト・監査ログ)
- **型検査**: `npx tsc --noEmit` → **エラー 0 件 (クリーン)**
- **ビルド**: `npm run build` → **成功 (静的/動的ルート正常生成)**

---

## 5. Production公開前ゲート（残TODO）

1. **Production Supabase migration履歴の整合**: 【完了】
   - Production初期スキーマ（`202609100001`）とSupabase CLI履歴テーブル（`supabase_migrations.schema_migrations`）を同期完了（applied）。
2. **Production Supabase Auth Site URLの本番化**:
   - `http://localhost:3000` から `https://insou-menu-system.vercel.app` へ更新。
3. **Production Vercel環境変数の整理**:
   - 旧プロトタイプ変数（`NEXT_PUBLIC_PROTOTYPE_*`）の削除。
4. **管理APIレート制限のDB共有化**:
   - 現在Store Auth APIはDB永続化レート制限を使用しているが、管理API側インメモリMapも共有化する。
5. **本番メール送信サービスの確定**:
   - INSOU本部とドメイン・プロバイダの選定・契約を行う。
