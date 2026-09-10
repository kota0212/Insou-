# Supabase 検証環境セットアップ

1. Supabaseで検証用プロジェクトを作成する。
2. SQL Editorで `migrations/202609100001_initial_schema.sql` を実行する。
3. Storageの `menu-pdfs` がPrivateで作成されたことを確認する。
4. `.env.example` を `.env.local` にコピーし、Project URLとanon keyを設定する。

## Authユーザー

店舗は店舗コードを小文字にした `ks-01@stores.insou.internal` 形式でAuthユーザーを作成する。管理者は実在メールで作成する。

```sql
insert into public.stores (code, name, area)
values ('KS-01', '北新地A店', '大阪') returning id;

insert into public.user_profiles (user_id, role, store_id)
values ('<AuthユーザーUUID>', 'store', '<stores.id>');

insert into public.user_profiles (user_id, role)
values ('<管理者のAuthユーザーUUID>', 'admin');
```

`service_role` キーはブラウザと `NEXT_PUBLIC_*` に設定しない。

## RLS確認

- 未認証でDBとStorageを取得できない。
- 店舗Aで店舗Bのメニュー行とPDFを取得できない。
- 店舗ユーザーがStorageへupload/deleteできない。
- 管理者のみがメニュー登録、割当、PDF差し替えを行える。
