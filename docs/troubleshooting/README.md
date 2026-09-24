# トラブルシューティング & 学び（Lessons Learned）

> **Status**: CURRENT  
> **Last Updated**: 2026-09-24  

本ディレクトリには、開発・運用中に発生し、**原因特定に時間を要した問題、再発リスクが高い問題、環境固有の罠**に関する調査結果と解決策を保存します。

---

## 記録一覧

| 問題 | 発生日 | 主な原因 | 解決策 |
|---|---|---|---|
| [TS-0001: ResizeObserver再描画ループによる「PDFを表示できませんでした」エラー](./TS-0001-pdf-canvas-resize-observer-loop.md) | 2026-09-18 | Canvas追加によるコンテナ伸縮をResizeObserverが検知し無限キャンセル | 監視対象を親ビューポートに変更し8px閾値を設定 |
| [TS-0002: PDF.jsワーカー破棄エラーがキャンセル例外として捕捉されない問題](./TS-0002-pdfjs-worker-destroyed-error.md) | 2026-09-18 | `pdf.destroy()` 時に `Worker was destroyed` が投げられ `RenderingCancelledException` と不一致 | `cancelled` フラグが true の場合はすべての例外を握りつぶすガードを追加 |
| [TS-0003: 管理者削除時のSelf-DeleteおよびLast-Admin保護漏れ](./TS-0003-admin-self-delete-protection.md) | 2026-09-17 | UIでボタンを無効化してもAPI直接呼び出しで最後の管理者が削除可能だった | API Route HandlerおよびDBで自己削除・単一管理者削除を遮断 |

---

## 記録の保存基準
単なる一時的なタイポや構文エラーは記録不要です。以下のいずれかに該当する場合に記録してください：
1. 原因特定に複数ステップの調査を要した。
2. 将来のAIや開発者が同じ実装を試みて再発する可能性が高い。
3. ライブラリ（PDF.js, Next.js, Supabase, Vercel）固有のライフサイクルや仕様の罠である。
