# DEVELOPMENT.md — 開発・検証・運用ガイド

> **Status**: CURRENT  
> **Last Updated**: 2026-09-24  

---

## 1. ローカル開発環境のセットアップ

### 1.1 前提条件
- Node.js >= 20.0.0
- npm >= 10.0.0

### 1.2 セットアップ手順
```bash
# 依存パッケージのインストール
npm install

# 環境変数ファイルの作成（検証環境接続用）
cp .env.example .env.local

# 開発サーバー起動
npm run dev
```

ブラウザで以下のURLを開いて確認します：
- 店舗画面: `http://localhost:3000/store` (または `/`)
- 管理者画面: `http://localhost:3000/admin`

---

## 2. 自動テストと検証コマンド

本プロジェクトでは、コードの変更後に以下のチェックを必ず実行します。

```bash
# 1. TypeScript型チェック
npx tsc --noEmit

# 2. 本番ビルド検証（静的解析・ルート生成）
npm run build

# 3. 店舗認証・OTP・セキュリティ自動テスト（41項目）
npm run test:store-auth

# 4. 管理者API・認可・監査ログ自動テスト
npm run test:admin-api

# 5. Git diff フォーマット・ホワイトスペース確認
git diff --check
```

---

## 3. 環境別の接続設定と運用ルール

### 3.1 Verification環境（日常の開発・検証先）
- **Vercel Preview URL**: `https://insou-menu-verification.vercel.app`
- **Supabase**: `cqlddcxvanwoxpaouzow`
- **ローカル設定**: `.env.verification.local`（Git管理外・パーミッション600）
- **マイグレーション適用**:
  ```bash
  # Verificationへのマイグレーション適用（Supabase CLI）
  npx supabase db push --project-ref cqlddcxvanwoxpaouzow
  ```

### 3.2 Production環境（本番・変更禁止）
- **Vercel Production URL**: `https://insou-menu-system.vercel.app`
- **Supabase**: `yzvencvfkltxehcjpgol`
- **ルール**: 明示的な許可があるまで、ProductionのDB、環境変数、デプロイは一切変更しない。

---

## 4. マイグレーション運用ルール

1. **既存マイグレーションの改変禁止**:
   - `supabase/migrations/202609100001` 〜 `202609110006` はVerification環境に適用済みです。既存ファイルを直接編集してはいけません。
2. **新規マイグレーションの追加**:
   - スキーマ変更が必要な場合は、新しいタイムスタンプファイル（例: `supabase/migrations/202609240001_xxx.sql`）を作成して適用します。
3. **安全なロールバック設計**:
   - カラム追加時は `if not exists`、関数更新時は `create or replace function` を使用し、既存データや動作を破壊しないようにします。
