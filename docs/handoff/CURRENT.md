# Current Handoff — 直近の作業引き継ぎ書

> **Updated**: 2026-09-24  
> **Actor**: Antigravity  
> **Branch**: `migrate/vexum-canonical`  
> **Preceding Commit**: `fefd93f` (docs: mark TODO 2 completed after updating Production Auth Site URL)  

本書は、**次のAI / 開発者が作業を開始する直前に必ず確認する最新の引き継ぎメモ**です。

---

## 1. Goal（今回の目的）
INSOUメニュー閲覧システムのリポジトリを、ChatGPT / Codex / Antigravity / 人間が共通して参照できる「正式な情報源（Single Source of Truth）」として機能する構成へ整理・再編すること。また、Phase 2先行検証に向けたProduction環境前準備を進める。

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
- 認可付き短時間Signed URLによるSupabase Private Storage PDF取得。
- IndexedDB差分同期とキャッシュパージ。
- PDF.js Canvas DPR 2.5x 高精細レンダリングと3Dページ送りUX。
- 管理者招待、削除ガード、店舗全端末一括ログアウト、操作ログ。

---

## 6. Remaining / Blocked（残課題・未解決事項）
- **本番メール送信基盤の確定**: INSOU本部のドメイン・プロバイダ承認待ち。
- **Production公開前ゲート（残TODO）**:
  1. ~~Production Supabase migration履歴整合~~（**完了**）
  2. ~~Production Auth Site URLの本番化~~（**完了**）
  3. ~~Production旧Prototype環境変数の削除~~（**完了**）
  4. Development環境の接続方針確定（TODO 4）
  5. 管理APIレート制限のDB永続化

---

## 7. Next Recommended Action（次に推奨される作業）
1. **TODO 4. Development環境の接続方針確定**:
   - ローカル開発から誤ってProduction DBへ接続させない安全運用の確立（`.env.example` の整理、開発用環境変数分離ルール）。
2. **Phase 2 Production先行検証の準備と実施**:
   - システム検証店舗限定の本番検証用ログインの準備と疎通確認。

---

## 8. Required Reading（次のAIが最初に読むべきファイル）
1. [`AGENTS.md`](../../AGENTS.md)
2. [`docs/CONTEXT.md`](../CONTEXT.md)
3. [`docs/CURRENT_STATE.md`](../CURRENT_STATE.md)
4. [`TODO.md`](../../TODO.md)
