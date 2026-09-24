# Current Handoff — 直近の作業引き継ぎ書

> **Updated**: 2026-09-24  
> **Actor**: Antigravity  
> **Branch**: `migrate/vexum-canonical`  
> **Preceding Commit**: `3884b63` (docs: revise production protection rule to obtain user permission and execute)  

本書は、**次のAI / 開発者が作業を開始する直前に必ず確認する最新の引き継ぎメモ**です。

---

## 1. Goal（今回の目的）
INSOUメニュー閲覧システムのリポジトリを、ChatGPT / Codex / Antigravity / 人間が共通して参照できる「正式な情報源（Single Source of Truth）」として機能する構成へ整理・再編すること。機能コードの追加やProductionへの変更は行わない。

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
   - ユーザーは開発・ITの前提知識はあるがインフラ・DB・認証等の専門家ではない前提に立ち、専門用語の平易な解説を義務化。
   - 承認前に説明すべき9項目（内容、理由、現状、変化、不実施時の影響、想定リスク、切り戻し可否、非変更範囲、実行後確認）を定義。
   - Production DB変更、deploy、merge等14の重要操作での明示的説明と納得に基づく承認を必須化。
   - 承認範囲の厳守、不明点がある場合の事前調査・説明ルールを明文化。単なるYes/No取得の禁止。

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
- **Production公開前ゲート**:
  1. Production Supabase migration履歴整合。
  2. Production Auth Site URLの本番化。
  3. Production旧Prototype環境変数の削除。
  4. 管理APIレート制限のDB永続化。

---

## 7. Next Recommended Action（次に推奨される作業）
1. **Phase 2 Production先行検証の準備と実施**:
   - OTPを削除せず一時停止し、システム検証店舗限定の本番検証用ログインからOTP成功後と同等の `store_device_session` / HttpOnly Cookieを発行する処理を準備する。
   - 実店舗メールを使わず、「システム検証店舗」および「テストPDF」を用いて、ユーザーの明示的な許可を得た上でProduction環境（`insou-menu-system.vercel.app`）でOTP以降の主要機能（ストレージ、差分キャッシュ、ビューアー表示、端末管理・一括ログアウト）の疎通確認を計画・実施する。
2. **Production公開前ゲート（TODO 1〜4）の着手準備**。

---

## 8. Required Reading（次のAIが最初に読むべきファイル）
1. [`AGENTS.md`](../../AGENTS.md)
2. [`docs/CONTEXT.md`](../CONTEXT.md)
3. [`docs/CURRENT_STATE.md`](../CURRENT_STATE.md)
4. [`TODO.md`](../../TODO.md)
