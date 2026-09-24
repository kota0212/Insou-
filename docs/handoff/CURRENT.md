# Current Handoff — 直近の作業引き継ぎ書

> **Updated**: 2026-09-24  
> **Actor**: Antigravity  
> **Branch**: `migrate/vexum-canonical`  
> **Preceding Commit**: `5586fa0` (docs: mark TODO 3 completed after purging Prototype env vars from Production Vercel)  

本書は、**次のAI / 開発者が作業を開始する直前に必ず確認する最新の引き継ぎメモ**です。

---

## 1. Goal（今回の目的）
INSOUメニュー閲覧システムのリポジトリを、ChatGPT / Codex / Antigravity / 人間が共通して参照できる「正式な情報源（Single Source of Truth）」として機能する構成へ整理・再編すること。また、Phase 2先行検証に向けたProduction公開前ゲート（TODO 1〜4）を完了させる。

---

## 2. Completed（実施内容）
1. **リポジトリ調査**:
   - 実コード（`app/`, `lib/`, `components/`）、マイグレーション（`202609100001`〜`202609110006`）、テストコード、既存計画書を全精査。
   - 既存ドキュメント（`docs/production-spec.md`, `TODO.md`等）に残っていた旧固定パスワード記述やGAS時代の完了チェックの陳腐化を洗い出し。
2. **新ドキュメント基盤の確立**:
   - `AGENTS.md`: AI間の共通作業ルール、優先順位、完了基準。
   - `docs/CONTEXT.md`: AIが数分で把握できる概要と作業別ルーター。
   - `docs/CURRENT_STATE.md`: 各環境・機能の客観的事実のみを記録。
   - `docs/PRODUCT.md` & `REQUIREMENTS.md`: 業務背景、ユーザー体験、確定要件（Confirmed/Pending/Deprecated区分）。
   - `docs/ARCHITECTURE.md`, `DATABASE.md`, `SECURITY.md`, `DEVELOPMENT.md`: 最新の技術設計書。
   - `docs/decisions/` (ADR-0001 〜 ADR-0006): 過去の重要判断の背景・理由。
   - `docs/troubleshooting/` (TS-0001 〜 TS-0003): 再発防止用のトラブル記録。
   - `docs/history/2026-09.md`: 9月の主要な歩み。
3. **既存ファイルの整理**:
   - `TODO.md`: 過去の完了チェックを全排除し、Phase 2〜5の現在未完了TODOへ再構成。
   - 旧ファイル（`システム完成計画.txt`, `店舗ログイン認証仕様.txt`, `docs/mvp-spec.md`, `docs/production-spec.md`, `変更したい点.txt`）を `docs/archive/` へ移動し、DEPRECATED警告を付与。
   - `README.md`: 人間とAIのポータルとして刷新。
4. **動的Git情報の分離方針の確立**:
   - コミットのたびに自己矛盾を招く「現在のHEAD SHA」のMarkdown内固定保存を廃止。
   - Git/GitHubを動的情報の正本とし、ドキュメントには継続的な運用方針のみを記載するルールを `AGENTS.md` へ追加。
5. **ユーザー承認・説明責任ルール（Informed Approval）の制定**:
   - `AGENTS.md` にセクション「4. ユーザー承認・説明責任ルール（Informed Approval）」を新設。
   - 専門用語の平易な解説を義務化し、承認前必須9項目を定義。
6. **TODO 1. Production Supabase migration履歴の整合完了**:
   - ユーザーへ9項目の平易な説明を行い承認を獲得。
   - Session Mode Pooler経由で Production Supabase (`yzvencvfkltxehcjpgol`) に安全に接続し、`supabase migration repair 202609100001 --status applied` を実行。
   - `supabase migration list` にて `202609100001` が remote に `applied` として整合されたことを確認。`TODO.md` の TODO 1 を `DONE` に更新。
7. **TODO 2. Production Auth Site URLの本番化完了**:
   - ユーザーへ9項目の平易な説明を行い承認を獲得。
   - ユーザーに配置いただいたアクセストークンを用いて、Supabase Management API経由で Production Supabase (`yzvencvfkltxehcjpgol`) の Site URL を `https://insou-menu-system.vercel.app` に、Redirect URLs を `https://insou-menu-system.vercel.app/**` に更新完了。GET検証で永続化を確認。`TODO.md` の TODO 2 を `DONE` に更新。
8. **TODO 3. Production Vercel旧Prototype環境変数の整理完了**:
   - ユーザーへ9項目の平易な説明を行い承認を獲得。
   - Vercel本番環境から初期試作用の `NEXT_PUBLIC_PROTOTYPE_*` 5変数の削除を完了。テスト用固定コード・暗証番号の露出リスクを排除。`TODO.md` の TODO 3 を `DONE` に更新。
9. **TODO 4. Development環境の接続方針確定完了**:
   - ユーザーへ9項目の平易な説明を行い承認を獲得。
   - ローカル開発（.env.local）からProduction DBへの接続禁止ルールを明文化。.env.example から旧プロトタイプ設定を削除し接続先方針を反映。docs/DEVELOPMENT.md に接続先ルールを追記。`TODO.md` の TODO 4 を `DONE` に更新。Phase 2公開前ゲート（TODO 1〜4）を全完了。
10. **Phase 2 Step 1. Production DB残マイグレーション（202609110002〜0006）の適用完了**:
   - ユーザーへInformed Approval（納得に基づく承認）の9項目を平易に説明し承認を獲得。
   - Session Mode Pooler経由で Production Supabase (`yzvencvfkltxehcjpgol`) に `npx supabase db push --db-url "..." --include-all` を実行。
   - `supabase migration list` にて `202609100001` から `202609110006` までの計6件がすべて remote に `applied` 済みであることを確認。
   - テーブル `stores`, `store_device_sessions`, `audit_logs`, `store_auth_rate_limits`, `security_alerts`, `store_otp_challenges` および対応関数・トリガーがProductionに展開されたことを検証。
11. **Phase 2 Step 2. システム検証店舗（TEST-VERIFY）および実メニューPDFの本番登録完了**:
   - ユーザー承認のもと、システム検証店舗レコード（コード: `TEST-VERIFY`、名前: 「システム検証店舗」）をProduction Supabaseの `stores` テーブルに登録。
   - ユーザーからご提供いただいた実メニューPDF（ワイン・シャンパンメニュー、2ページ、約505KB）をProduction Storageの `menu-pdfs` プライベートバケットに安全に配置。
   - `menus` および `menu_store_assignments` に登録し、配信割り当てを完了。
12. **Phase 2 Step 3. 本番検証用端末セッション発行・認可URL・失効サイクルの検証完了**:
   - 外部メール送信を行わず、システム検証店舗限定でOTP認証成功後と同等の30日端末セッションCookie（`insou_store_device_session`）を発行。
   - 本番プライベートストレージからの60秒認可付きURL生成（`createSignedUrl`）および実PDFダウンロード（HTTP 200, 505KB）が正常に成立することを確認。
   - 端末失効（セッション無効化）処理を実行し、失効後は即座にアクセス遮断（フェイルクローズ）されることを検証。Phase 2の全機能検証を完了。

---

## 3. Files Changed（変更ファイル）
- **新規作成**:
  - `AGENTS.md`
  - `docs/CONTEXT.md`, `docs/CURRENT_STATE.md`, `docs/PRODUCT.md`, `docs/REQUIREMENTS.md`, `docs/ARCHITECTURE.md`, `docs/DATABASE.md`, `docs/SECURITY.md`, `docs/DEVELOPMENT.md`
  - `docs/decisions/README.md`, `ADR-0001` 〜 `ADR-0006`
  - `docs/troubleshooting/README.md`, `TS-0001` 〜 `TS-0003`
  - `docs/history/README.md`, `docs/history/2026-09.md`
  - `docs/handoff/CURRENT.md`
- **更新**:
  - `README.md`
  - `TODO.md`
- **アーカイブ移動**:
  - `docs/archive/システム完成計画.txt`
  - `docs/archive/店舗ログイン認証仕様.txt`
  - `docs/archive/mvp-spec.md`
  - `docs/archive/production-spec.md`
  - `docs/archive/変更したい点.txt`

---

## 4. Verification（検証結果）
- `npx tsc --noEmit` → **エラー 0 件 (クリーン)**
- `npm run build` → **ビルド成功**
- `npm run test:store-auth` → **41 Passed / 0 Failed**
- `npm run test:admin-api` → **全テスト PASS**
- `git diff --check` → **クリーン**

---

## 5. Current Working State（現在正常に動作するもの）
- Verification環境でのメールOTP発行・送信・検証・30日端末セッションCookie。
13. **Production VercelデプロイおよびメールOTP本番連携の完了**:
    - ユーザーのInformed Approvalに基づき、Vercel Production環境変数を設定（`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SECRET_KEY`, `OTP_HMAC_SECRET`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`）。
    - 最新コードをビルド・本番URL（`https://insou-menu-system.vercel.app`）へ割り当て。
    - システム検証店舗（`TEST-VERIFY`）の `notification_email` をユーザーアドレス（`k.nishida@vexum-ai.com`）に設定。
    - 本番環境でのOTP発行リクエスト（`POST /api/store-auth/request-otp/`）を実行し、Resend経由での実メール送信および `challengeId` 発行に成功（HTTP 200）。実店舗への誤送信リスクゼロの安全な状態で、本番の全認証・閲覧フローが稼働。

---

## 5. What Works（動作確認済み事実）
- Production Supabase 全マイグレーション適用・健全稼働。
- Production Vercel 最新コード稼働（新UI・新API群）。
- 店舗名検索API（`GET /api/store-auth/stores/?q=検証`）。
- メールOTP発行・Resend実メール送信（`POST /api/store-auth/request-otp/`）。
- 認可付き短時間Signed URLによるSupabase Private Storage PDF取得。
- IndexedDB差分同期とキャッシュパージ。
- PDF.js Canvas DPR 2.5x 高精細レンダリングと3Dページ送りUX。
- 管理者招待、削除ガード、店舗全端末一括ログアウト、操作ログ。

---

## 6. Remaining / Blocked（残課題・未解決事項）
- **実店舗メール運用のINSOU本部承認**: 実店舗（`stores`テーブル）へのメール配信は、INSOU本部の承認および公式ドメイン設定後に順次解禁する方針。現在は検証店舗（ユーザー宛）のみメール送信中。
- 管理APIレート制限のDB永続化（Phase 3）。

---

## 7. Next Recommended Action（次に推奨される作業）
1. **本番URLでのブラウザE2E動作確認**:
   - `https://insou-menu-system.vercel.app` をブラウザで開き、「システム検証店舗」でOTPログインをテスト。
   - メール（`k.nishida@vexum-ai.com`）に届いた6桁コードを入力し、実メニューPDF（ワイン・シャンパンメニュー）が閲覧できることを確認。
2. **管理APIレート制限のDB永続化（Phase 3）の実施**。

---

## 8. Required Reading（次のAIが最初に読むべきファイル）
1. [`AGENTS.md`](../../AGENTS.md)
2. [`docs/CONTEXT.md`](../CONTEXT.md)
3. [`docs/CURRENT_STATE.md`](../CURRENT_STATE.md)
4. [`TODO.md`](../../TODO.md)
