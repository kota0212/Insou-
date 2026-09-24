# INSOU メニュー閲覧システム 開発 TODO

> **Status**: CURRENT  
> **Last Updated**: 2026-09-24  
> **Source of Truth**: 本書は「現在未完了の作業」のみを管理します。完了した過去の履歴は [`docs/history/`](./docs/history/) を参照してください。

---

## 1. Phase 2: Production先行主要機能検証（直近最優先）
実店舗メールアドレスや本番メール基盤が確定する前に、Production環境でOTP以外の主要基盤（DB, Storage, Auth, キャッシュ, ビューアー）を先行検証する。

| Priority | Task | Phase | Status | Blocked by |
|---|---|---|---|---|
| **P0** | **TODO 1. Production Supabase migration履歴の整合**<br>手動適用された初期スキーマとCLI履歴テーブルを安全に同期する | Phase 2 Pre | **DONE** | なし |
| **P0** | **TODO 2. Production Auth Site URLの本番化**<br>`http://localhost:3000` から本番URLへ更新 | Phase 2 Pre | **DONE** | なし |
| **P1** | **TODO 3. Production Vercel旧Prototype環境変数の整理**<br>`NEXT_PUBLIC_PROTOTYPE_*` 等の削除 | Phase 2 Pre | **DONE** | なし |
| **P1** | **TODO 4. Development環境の接続方針確定**<br>ローカルからProduction DBへ接続させない運用の徹底 | Phase 2 Pre | **DONE** | なし |
| **P0** | **本番検証用ログインの実装とProduction主要機能検証**<br>OTPを削除せず一時停止し、システム検証店舗限定の本番検証用ログインからOTP成功後と同等の `store_device_session` / HttpOnly Cookieを発行して、OTP以降のProduction経路（Private Storage, IndexedDB差分同期, 高画質ビューアー, 端末管理・一括ログアウト）を検証する | Phase 2 | **DONE** | なし |

---

## 2. Phase 3: 本番メール基盤確定 & OTP本番結合
INSOU側との合意に基づき、本番用メール基盤を確定してOTP認証を本番有効化する。

| Priority | Task | Phase | Status | Blocked by |
|---|---|---|---|---|
| **P0** | **本番メール送信プロバイダの確定・契約・ドメイン設定**<br>Resend または Amazon SES の選定、SPF/DKIM/DMARC設定 | Phase 3 | **TODO** | INSOU本部承認 |
| **P0** | **実店舗の通知用メールアドレス一覧の登録**<br>`stores.notification_email` の本番データ投入 | Phase 3 | **TODO** | INSOU本部情報提供 |
| **P1** | **管理APIレート制限のDB永続化**<br>管理APIのインメモリMapをDB共有レート制限（`store_auth_rate_limits`）へ移行 | Phase 3 | **TODO** | なし |
| **P1** | **漏洩済みVerification旧Secret Keyの完全失効**<br>利用先確認完了後に旧API keyを整理 | Phase 3 | **TODO** | なし |

---

## 3. Phase 4: 本番総合テスト（開発100%完了ゲート）
システム開発を100%完了させ、実店舗へ展開可能な状態を担保する。

| Priority | Task | Phase | Status | Blocked by |
|---|---|---|---|---|
| **P0** | **実機E2E検証（iPad Safari / Android Chrome / 店舗PC）**<br>回転、拡大パン、通信切断時のフェイルクローズ、キャッシュパージ確認 | Phase 4 | **TODO** | Phase 3 |
| **P0** | **障害復旧・ロールバック訓練**<br>DBバックアップ・復元、Vercelロールバック、緊急一括失効の手順確認 | Phase 4 | **TODO** | Phase 3 |
| **P1** | **運用マニュアル・店舗FAQの作成**<br>端末交換手順、コード不達時の電話対応エスカレーションフロー | Phase 4 | **TODO** | Phase 3 |

---

## 4. Phase 5: パイロット運用と段階展開
未完成機能を持ち越さず、完成したシステムを限定店舗で先行運用する。

| Priority | Task | Phase | Status | Blocked by |
|---|---|---|---|---|
| **P0** | **2〜5店舗での先行パイロット運用開始** | Phase 5 | **TODO** | Phase 4完了 |
| **P0** | **店舗ごとの登録タブレット数（`registered_tablet_count`）の確定・投入** | Phase 5 | **TODO** | 端末調達計画 |
| **P1** | **全100店舗以上への段階的ロールアウト** | Phase 5 | **TODO** | パイロット検証完了 |
