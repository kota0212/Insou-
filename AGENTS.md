# AGENTS.md — AIエージェント開発運用ルール

このリポジトリは、複数のAI（ChatGPT, Codex, Antigravity）および人間の開発者が共同作業を行います。
各AI間ではチャット履歴や記憶（Memory）を直接共有できないため、**本リポジトリ（GitHub）を唯一の「共通記憶・正式な情報源（Single Source of Truth）」** とします。

---

## 1. 作業開始時の必須手順

作業を開始するAIは、必ず以下の順序でリポジトリを確認してください：

1. **[`docs/CONTEXT.md`](./docs/CONTEXT.md) を読む**
   - プロジェクト概要、現在のPhase、主要課題、各作業別の参照先マップを把握する。
2. **[`docs/CURRENT_STATE.md`](./docs/CURRENT_STATE.md) を読む**
   - 現在の環境状況（Production / Verification）、実装完了／未完了／一時停止中の状態、最新コミットを把握する。
3. **[`docs/handoff/CURRENT.md`](./docs/handoff/CURRENT.md) を読む**
   - 直前のAIが何を実施し、何が成功／失敗し、次に何が推奨されているかを確認する。
4. **必要な専門ドキュメントのみを追加で読む**
   - 毎回すべてのドキュメントを読む必要はありません。作業内容に応じて `docs/CONTEXT.md` のルーターに従って必要な仕様書・ADRのみを読み込みます。
5. **関連コード・migrationを確認する**
   - ドキュメントと実際のコード・migrationが矛盾する場合、**コード・実環境の状態を優先確認**し、「仕様と実装の不一致」を把握する。
   - 勝手に仕様をコードに合わせたり、コードを勝手に消してはならない。

---

## 2. 情報の優先順位（Single Source of Truth ルール）

現在状態および仕様の判断は、以下の優先順位に従います：

```
1. 実際のコード / migration / environment確認結果（物理的事実）
2. docs/CURRENT_STATE.md（現在の事実まとめ）
3. 正式仕様書（docs/REQUIREMENTS.md, ARCHITECTURE.md, DATABASE.md, SECURITY.md）
4. 意思決定記録（docs/decisions/ADR-*.md）
5. 直近引き継ぎ（docs/handoff/CURRENT.md）
6. 過去履歴・トラブルシュート（docs/history/, docs/troubleshooting/）
7. （優先度最低・非公式）AIのチャット履歴・外部Memory
```

> **注意**:
> - 会話やチャットの中だけで重要仕様を確定してはならない。GitHubへ反映されて初めて正式決定となる。
> - コードとドキュメントの重大な乖離を見つけた場合、独断で片方を正解とせず、作業前または作業報告で不一致を明示する。

---

## 3. 実装時の絶対厳守ルール

- **スコープ外変更を避ける**: 指示されたタスクに無関係なファイルやリファクタリングを行わない。
- **秘密情報（Secrets）の保護**:
  - `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SECRET_KEY`, `OTP_HMAC_SECRET`, `RESEND_API_KEY`, signed URL, 平文パスワード, 平文OTPコードを絶対にgit commitやログ出力しない。
  - `NEXT_PUBLIC_*` に秘密情報を配置しない。
- **Production環境の保護**:
  - 明示的な指示・許可がない限り、**Production Supabase (`yzvencvfkltxehcjpgol`) および Production Vercel (`insou-menu-system.vercel.app`) を変更しない**。
  - すべての開発・検証作業は Verification環境 (`cqlddcxvanwoxpaouzow` / `insou-menu-verification.vercel.app`) で行う。
- **破壊的変更の禁止**:
  - 適用済みの既存DB migrationファイル（`202609100001`〜`202609110006`）を書き換えない。変更が必要な場合は必ず新しい番号のmigrationを追加する。
  - Production deployやmainブランチへのマージを勝手に実行しない。
- **非推奨（Deprecated）仕様の復活禁止**:
  - 旧MVPのGAS/Spreadsheet連携、旧店舗固定パスワード運用、Base64 JSON配信などを現在仕様として復活させない。
- **推測でのTODO完了扱いの禁止**:
  - テストや実環境検証を行っていない項目を推測で完了扱いにしない。

---

## 4. 作業終了時の必須手順（ドキュメント更新まで含めてDone）

コード変更だけでは作業完了とは認められません。作業内容に応じて、以下のドキュメントを必ず同期・更新してください：

| 変更内容 | 更新対象ドキュメント |
|---|---|
| 要件・機能仕様の確定・変更 | [`docs/REQUIREMENTS.md`](./docs/REQUIREMENTS.md) |
| システム構造・通信構成の変更 | [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) |
| テーブル・RPC・RLSの変更 | [`docs/DATABASE.md`](./docs/DATABASE.md) |
| 認証・認可・暗号化・セキュリティの変更 | [`docs/SECURITY.md`](./docs/SECURITY.md) |
| 新たな重要な設計判断の成立 | [`docs/decisions/`](./docs/decisions/) にADRを追加 |
| 現在の実装状況・Phase進捗の変化 | [`docs/CURRENT_STATE.md`](./docs/CURRENT_STATE.md) |
| 再発可能性のあるエラーの解決・学び | [`docs/troubleshooting/`](./docs/troubleshooting/) に追加 |
| 意味のある作業単位の完了 | [`docs/history/`](./docs/history/) に記録 |
| **直近の作業引き継ぎ（毎回必須）** | **[`docs/handoff/CURRENT.md`](./docs/handoff/CURRENT.md)** |

---

## 5. 作業終了報告フォーマット

作業完了時の報告には、以下の項目を必ず含めてください：

1. **実施内容（目的と変更の要約）**
2. **変更ファイル一覧**
3. **テスト実行結果（型検査、ビルド、自動テスト）**
4. **成功した項目（検証済み事実）**
5. **未完了・保留事項**
6. **既知の問題・リスク**
7. **ドキュメント更新一覧**
8. **次のAI / 開発者が行うべき推奨作業**
