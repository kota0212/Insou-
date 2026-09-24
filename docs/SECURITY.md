# SECURITY.md — セキュリティ設計・運用基準

> **Status**: CURRENT  
> **Last Updated**: 2026-09-24  

本書は、INSOU店舗メニュー閲覧システムにおける**認証・認可・暗号化・秘密情報管理・脅威対策**の正本仕様です。

---

## 1. 認証と認可の境界（Authentication & Authorization）

本システムには、独立した2つの認証・認可境界が存在します。

```
[ 管理者領域 ] ────────── Supabase Auth (Email / Password / JWT) ───► Admin API (/api/admin/*)
[ 店舗端末領域 ] ──────── 店舗メールOTP ───► 30日 HttpOnly Cookie ───► Store API (/api/store-auth/*)
```

1. **店舗端末認証**:
   - メールOTP（6桁）による二要素的認証（店舗専用メールを確認できる者のみ認証可能）。
   - 認証後は30日間の端末セッションCookie（`insou_store_session`）による自動認証。
   - 一般店舗端末から管理者機能への越境アクセスは、JWTのRole検証により完全に遮断。
2. **管理者認証**:
   - Supabase Authによるメール＋パスワード認証。
   - `user_profiles.role = 'admin'` を持つユーザーのみが管理者権限を行使可能。
   - 管理者追加は招待メール経由で本人がパスワードを設定（管理者が平文パスワードを知り得ない設計）。

---

## 2. 秘密情報（Secrets）と鍵の取り扱い

| 秘密情報名 | 設定先環境 | クライアント露出 | 用途 / 備考 |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel (All) / `.env.local` | あり（公開可） | Supabase接続エンドポイント |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel (All) / `.env.local` | あり（公開可） | 公開キー。RLSで保護されたリソースのみアクセス可 |
| `SUPABASE_SECRET_KEY` | Vercel Server-only / `.env.verification.local` | **絶対禁止** | サーバー特権操作用（旧service_roleの代替新形式） |
| `OTP_HMAC_SECRET` | Vercel Server-only / `.env.verification.local` | **絶対禁止** | OTPハッシュ計算用HMACキー。32バイト以上の高エントロピー文字列 |
| `RESEND_API_KEY` | Vercel Server-only / `.env.verification.local` | **絶対禁止** | メール送信プロバイダAPIキー |

### 鍵の安全ルール
- `NEXT_PUBLIC_` プレフィックスを付ける環境変数には、絶対に秘密値を含めない。
- `SUPABASE_SECRET_KEY` は、サーバー側のRoute Handler内でのみ `getSupabaseAdminClient()` 経由で使用する。
- ログ出力（`console.log`, `audit_logs`）に平文OTP、生トークン、Cookie値、Signed URLを含めない（自動テスト `npm run test:store-auth` でゼロリークを常時検証）。

---

## 3. 店舗OTP認証の暗号・堅牢化仕様

1. **OTPコードの生成**:
   - `crypto.randomInt(100000, 1000000)` による暗号学的6桁乱数。
2. **ハッシュ化アルゴリズム**:
   - `HMAC-SHA256(secret, challenge_id + ":" + otp)`。
   - `challenge_id`（UUID）をソルトとして結合することで、レインボーテーブル攻撃およびリプレイ攻撃を防止。
3. **総当たり（Brute Force）攻撃対策**:
   - 入力失敗が5回に達した場合、当該challengeは即時 `locked` 状態となり失効。
   - IP単位レート制限: 1分間に最大15回。
   - challenge単位レート制限: 10分間に最大10回。
4. **配信不能時の自動破棄**:
   - ResendメールAPIがエラーを返した場合、未配信のOTPをDBに残さず即座に `invalidated` 化する。

---

## 4. 端末セッション & Cookie仕様

- **トークン生成**: `crypto.randomBytes(32).toString('base64url')`（256bitエントロピー）。
- **DB保存**: 生トークンは保存せず、`SHA-256(rawToken)` のハッシュのみを `store_device_sessions.token_hash` に保存。
- **Cookie属性**:
  ```http
  Set-Cookie: insou_store_session=<rawToken>; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax
  ```
- **XSS耐性**: `HttpOnly` 属性により、JavaScript（ブラウザのスクリプト）からセッショントークンを読み取り不可。

---

## 5. リモート失効とオフライン制御

### 5.1 個別失効 & 一括失効
- **個別失効**: `store_device_sessions.revoked_at` に失効時刻を記録。
- **店舗一括失効**: `stores.device_session_version` を+1インクリメント。発行時バージョンと不一致の端末は即座に失効扱いとなる。

### 5.2 オフライン閲覧の禁止（セキュリティ境界）
- **IndexedDBキャッシュの制約**:
  - ローカル端末に保存されたPDFは、端末がオフラインの間、遠隔から消去することは物理的に不可能。
- **対策**:
  - **完全オフライン閲覧を明示的に禁止**。
  - アプリ起動時およびPDFを開く前に、必ずサーバーへセッション有効性確認リクエスト（`/api/store-auth/session`）を送信。
  - ネットワーク不達またはセッション失効（401）の場合、PDFビューアーを起動せず、ローカルのIndexedDBからPDF Blobを即座に消去（`removeCachedPdfsExcept([])`）する。

---

## 6. レート制限アーキテクチャ

Vercelのサーバーレス環境（複数インスタンス）でレート制限を回避されないよう、PostgreSQLテーブル `store_auth_rate_limits` とストアドファンクション `check_and_increment_rate_limit` を用いた**DB永続化・原子的レート制限**を採用しています。

- **店舗名検索**: IPあたり 40回 / 60秒
- **OTP発行要求**: IPあたり 10回 / 60秒、店舗あたり 5回 / 600秒
- **OTP検証試行**: IPあたり 15回 / 60秒、challengeあたり 10回 / 600秒
