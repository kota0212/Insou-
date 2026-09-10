# INSOU 店舗メニュー配信システム

現在のMVPの見た目と操作感を維持しながら、本番と同じNext.js / Vercel / Supabase構成を検証するWebアプリです。

## 構成

- Next.js / React
- Supabase Database / Auth / Private Storage / RLS
- IndexedDB PDF Blobキャッシュ
- PDF.js / Canvasビューアー
- Vercelへのデプロイを前提

GAS / Spreadsheet / Google Drive / Base64 JSONによるPDF配信は旧MVPの暫定実装であり、現在のフロントエンドからは使用しません。`gas/` と `lib/gas-api.ts` は移行元の参考用として残しています。

## ローカル起動

```bash
cp .env.example .env.local
npm install
npm run dev
```

- 店舗：`http://localhost:3000/store/`
- 管理者：`http://localhost:3000/admin/`

Supabaseが未設定の場合は、モック動作にフォールバックせず設定待ちと表示します。セットアップは [`supabase/README.md`](./supabase/README.md)、検証仕様は [`docs/mvp-spec.md`](./docs/mvp-spec.md)、本番仕様は [`docs/production-spec.md`](./docs/production-spec.md) を参照してください。

## PDF同期

認証後に軽量メタデータを取得し、`menuId + updatedAt` とIndexedDBを比較します。変更がなければPDF本体は再取得しません。初回、PDF差し替え、新規公開時のみPrivate Storageから必要なPDFを取得します。
