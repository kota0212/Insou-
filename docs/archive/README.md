# アーカイブ資料（Archive / Deprecated）

> **Status**: ARCHIVED / DEPRECATED  
> **Last Updated**: 2026-09-24  

本ディレクトリには、開発初期や旧フェーズで作成された**過去の仕様書、計画書、メモ**を歴史的経緯の参照用として保存しています。

**重要**:
本ディレクトリ内のファイルは**現在仕様ではありません**。
AIエージェントおよび開発者は、本ディレクトリ内の古い仕様（GAS連携、Base64 JSON配信、固定パスワード運用など）を現在の実装や仕様として誤認・復活させないでください。

---

## アーカイブされたファイル一覧

| ファイル | 旧作成日 / 役割 | 現在の正式な後継先 |
|---|---|---|
| `mvp-spec.md` | 旧MVP〜初期検証仕様 | [`docs/REQUIREMENTS.md`](../REQUIREMENTS.md), [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) |
| `production-spec.md` | 旧本番仕様書（固定PW等の記述あり） | [`docs/REQUIREMENTS.md`](../REQUIREMENTS.md), [`docs/SECURITY.md`](../SECURITY.md) |
| `システム完成計画.txt` | 旧完成計画（仕様・進捗・TODOが混在） | [`docs/CURRENT_STATE.md`](../CURRENT_STATE.md), [`TODO.md`](../../TODO.md), [`docs/history/`](../history/) |
| `店舗ログイン認証仕様.txt` | 旧OTP認証初期検討メモ | [`docs/SECURITY.md`](../SECURITY.md), [`docs/decisions/ADR-0002-store-auth-otp-and-device-session.md`](../decisions/ADR-0002-store-auth-otp-and-device-session.md) |
| `変更したい点.txt` | 旧UI要望メモ | 反映済み（店舗一覧拡張・PDF高精細化） |
