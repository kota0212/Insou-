# TS-0003: 管理者削除時のSelf-DeleteおよびLast-Admin保護漏れ

## Symptoms
管理画面で管理者アカウントを削除する際、ログイン中の自分自身を誤って削除してしまったり、システム内に存在する最後の1人の管理者を削除して誰も管理画面に入れなくなる（Lockout）リスクが存在した。

## Trigger
Phase 3で管理者招待・削除ワークフローを実装した際、フロントエンドのUIでボタンを非活性化するだけでは、curl等のAPI直接呼び出しで自己削除や全滅が可能だった。

## Cause
初期の管理者削除API (`app/api/admin/users/route.ts`) では、呼び出し元ユーザーID (`auth.uid()`) と対象ユーザーIDの比較チェック、および `user_profiles` テーブル内の残り `role = 'admin'` 件数カウントがAPI側に実装されていなかった。

## Resolution
コミット `c25f11c` および `4fca63e` にて修正：
1. **API層での保護**:
   - `DELETE /api/admin/users`:
     - 自分自身のIDと一致する場合は `400`（「自分自身のアカウントは削除できません」）。
     - 残り管理者数が1名の場合は `400`（「最後の管理者アカウントは削除できません」）。
2. **自動テストの追加**:
   - `scripts/test-admin-api.mjs` に自己削除拒否テストおよびラスト管理者保護テストを組み込み、リグレッションを常時防止。

## Related
- ファイル: `app/api/admin/users/route.ts`, `scripts/test-admin-api.mjs`
- コミット: `c25f11c`, `4fca63e`
