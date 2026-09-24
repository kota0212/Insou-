# REQUIREMENTS.md — 正式要件定義書

> **Status**: CURRENT  
> **Last Updated**: 2026-09-24  

本書は、現在採用されている**機能要件・非機能要件**を定義します。  
ステータスを **Confirmed（確定・採用中）**, **Pending（検討中・承認待ち）**, **Deprecated（廃止・不採用）** に明確に区分しています。

---

## 1. 店舗認証・端末管理要件

### 1.1 店舗検索・認証コード発行
- [Confirmed] 店舗画面では店舗名による部分一致検索（2文字以上・最大10件）を行い、店舗を選択させる。
- [Confirmed] 候補一覧および画面上に店舗メールアドレス（平文）を一切表示・返却しない（プライバシー保護）。
- [Confirmed] 店舗検索API・OTP要求APIにはIP単位および店舗単位の永続化レート制限を適用する。
- [Confirmed] 「確認コードを送信する」前の確認ダイアログを表示する。
- [Confirmed] ワンタイム認証コード（OTP）は6桁の暗号学的乱数とし、1要求ごとに1つ発行する。
- [Confirmed] OTPの有効期限は15分間、1回限り使用可能とする。
- [Confirmed] サーバーにはOTP平文を保存せず、`HMAC-SHA256(challenge_id + ":" + OTP, secret)` のハッシュのみを保存する。
- [Confirmed] メール送信が失敗した場合は、生成されたchallengeを即時に無効化（invalidated）する。
- [Deprecated] 店舗コード（`KS-01`等）をスタッフに入力・暗記させる運用（店舗名検索へ変更）。
- [Deprecated] 「登録台数分のOTPを一括発行して1通のメールに複数コードを記載する」旧案（1端末1要求1コードへ変更）。

### 1.2 端末セッション & Cookie
- [Confirmed] OTP検証成功時、安全なランダムトークンを生成し、DBにはハッシュ（`token_hash`）のみを保存する。
- [Confirmed] ブラウザには `HttpOnly`, `Secure`, `SameSite=Lax`, 30日間有効のCookie (`insou_store_session`) を付与する。
- [Confirmed] localStorageやIndexedDBにはセッション用秘密トークンを保存しない（XSS耐性）。
- [Confirmed] 店舗端末のブラウザ指紋やIPアドレス固定による識別は行わない（回線変動・端末仕様差異への耐性）。
- [Confirmed] 30日の有効期限が切れた場合は、自動的に再認証（OTP要求）へ遷移する。

### 1.3 端末失効（ログアウト・一括失効）
- [Confirmed] 管理画面から店舗ごとに「全端末をログアウト」を実行可能とする。
- [Confirmed] 管理画面から個別端末の「失効（個別ログアウト）」を実行可能とする。
- [Confirmed] 一括失効は店舗テーブルの `device_session_version` をインクリメント、個別失効はセッションの `revoked_at` を設定することで、次回のサーバー通信時に確実にアクセス拒否する。
- [Confirmed] 失効が確認されたオンライン端末は、直ちにローカルのIndexedDBからPDFキャッシュを削除（パージ）し、ログイン画面へ遷移する。
- [Confirmed] **完全オフライン閲覧は禁止**とする。アプリ起動時およびPDF閲覧開始時にオンラインでセッション有効性をサーバー確認する。オフライン状態ではPDF表示を開始しない。

---

## 2. メニュー配信・閲覧要件

### 2.1 PDF保存 & 差分同期
- [Confirmed] PDF本体はSupabase Private Storage (`menu-pdfs`) にバイナリ形式で保存する。
- [Confirmed] PDFの直接ダウンロードURLやStorageの内部パスはクライアントに露出させない。
- [Confirmed] PDF表示時は、サーバー側で端末セッションと公開割当を検証した上で、有効期限60秒の短時間Signed URLを発行する。
- [Confirmed] 端末側はIndexedDB (`insou-menu-pdf-cache`) にBlobとしてPDFをキャッシュする。
- [Confirmed] 画面表示時はまず軽量メタデータのみを取得し、`menuId` と `pdf_updated_at` をローカルキャッシュと比較する。
  - キャッシュが存在し更新日時が一致する場合：通信を行わず即座にIndexedDBから描画。
  - 更新日時が新しい場合：該当PDFのみをダウンロードしてキャッシュを上書き。
  - 公開終了または自店割当が解除された場合：IndexedDBから当該PDFを自動削除。
- [Deprecated] Base64エンコードによるJSON配信（旧MVP仕様。完全廃止）。
- [Deprecated] Google Drive経由のPDF配信（旧MVP仕様。完全廃止）。

### 2.2 ビューアーUX
- [Confirmed] PDFのみを常時全画面表示し、ページ番号インジケーター（`現在 / 総数`）を画面右上に固定表示する。
- [Confirmed] 本めくりアニメーション（3Dカード回転エフェクト、透過裏面、指追従スワイプ）を提供する。
- [Confirmed] ピンチイン／ピンチアウトによる拡大縮小（最大260%〜400%）および拡大中のパン移動に対応する。
- [Confirmed] 高精細Canvasレンダリング（端末DPRに応じ最大2.5x、最大12MP制限でクラッシュ防止）を維持する。
- [Confirmed] 画面回転（縦・横）やウィンドウリサイズ時にレイアウトが崩れず、適切なピクセル密度で再描画されること。

---

## 3. 管理画面要件

### 3.1 店舗・端末監視
- [Confirmed] 店舗一覧画面で、店舗名、コード、エリア、通知用メールアドレス、登録タブレット数、稼働端末数、未解決アラート件数を表示する。
- [Confirmed] 店舗ごとの「全端末をログアウト」実行時に確認ダイアログを表示し、失効理由を入力させる。
- [Confirmed] 店舗の固定パスワードを表示・変更するUIは一切設置しない。
- [Pending] 店舗ごとの登録タブレット数（`registered_tablet_count`）の正式入力（端末調達完了後に実施）。

### 3.2 管理者アカウント統制
- [Confirmed] 管理者認証はSupabase Auth (Email / Password) を使用する。
- [Confirmed] 管理者追加は「招待メール（Supabase Auth invite）」経由で行い、初期パスワードの管理者間共有を禁止する。
- [Confirmed] パスワード再設定は公式の再設定メール送信機能を使用する。
- [Confirmed] 自分自身のアカウント削除、およびシステム内に最後の1人となった管理者の削除をAPI・UI双方で禁止する（Lockout保護）。

### 3.3 監査ログ・セキュリティアラート
- [Confirmed] 管理APIおよび店舗認証の重要アクション（ログイン、失効、設定変更、OTP要求・検証失敗等）を `audit_logs` に記録する。
- [Confirmed] 操作ログにはパスワード、OTP平文、認証トークンなどの秘密情報を絶対に含めない。
- [Confirmed] 有効端末数が登録台数を超過した場合、自動的に `security_alerts` （重要度: warningまたはcritical）を起票する。
- [Confirmed] 登録台数がNULL（未設定）の店舗では、アラートを誤検知させず自動解決状態を維持する。

---

## 4. 非機能要件

- **セキュリティ**:
  - 全テーブルおよびStorageバケットでRLS (Row Level Security) を有効化。
  - クライアントにはSupabase anon keyのみを配布し、`service_role` キーはVercelサーバー環境でのみ使用。
  - OWASP Top 10基準の入力検証（UUIDバリデーション、文字列長制限、SQLインジェクション防止）。
- **可用性・耐障害性**:
  - レート制限カウンターおよびセッション管理はVercelサーバーレス間で共有可能なPostgreSQLテーブル（またはRPCアトミック処理）で永続化。
- **パフォーマンス**:
  - 2回目以降のメニュー閲覧開始速度（キャッシュヒット時）：0.5秒以内。
  - PDFメモリ消費量：iPad Safari / Android Chrome でクラッシュしないようCanvas上限（12MP）を制限。
