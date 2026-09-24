# TS-0001: ResizeObserver再描画ループによる「PDFを表示できませんでした」エラー

## Symptoms
Verification固定URL（`https://insou-menu-verification.vercel.app`）でPDFを開いた際、画面右上に総ページ数（`1 / 2`）は取得・表示されているにもかかわらず、画面中央に「PDFを表示できませんでした」と表示され、PDF本文が表示されない。

## Trigger
コミット `81b51de`（高精細レンダリング対応）にて、画面回転・リサイズ追従のために `PdfCanvas` 内に `ResizeObserver` を導入した直後に発生。

## Cause
1. `ResizeObserver` が `containerRef.current`（Canvas要素を `appendChild` する対象の `<div>`）を直接監視していた。
2. 初回マウント時、`container` の高さは `0px` である。
3. `useEffect` がPDFのロードと1ページ目の描画を開始する（`await loadingTask.promise`, `await pdf.getPage()` などの非同期待機）。
4. 1ページ目のCanvasが生成されて `container.appendChild(canvas)` されると、コンテナの高さが急激に拡張される。
5. この高さ変更を `ResizeObserver` が検知し、180msのデバウンスタイマー経由で `setRenderRevision(v => v + 1)` を発行。
6. `renderRevision` の変化によって直前の描画 `useEffect` のクリーンアップが走り、進行中の描画タスクがキャンセルされ、`documentTask.destroy()` が呼ばれてPDF workerが破棄される。
7. 2回目の描画ループでも同様にCanvasが挿入されて再発火し、無限キャンセルループまたはワーカー破棄エラーにより `setStatus('error')` となっていた。

## Investigation
- ページ番号インジケーター（`1 / 2`）が表示されていることから、PDF取得API（Signed URL）およびPDF.jsのメタデータパース（`loadingTask.promise`）は正常完了していることを確認。
- レンダリングライフサイクルを追跡し、CanvasのDOM追加と `ResizeObserver` コールバックが相互にトリガーし合っている事実を特定。

## Resolution
コミット `680c921`（および `5679ff8`, `f811579`, `42c4ddb`）にて修正：
1. **監視対象の変更**:
   - `containerRef.current` ではなく、CSSで固定サイズが指定されている親要素（`container?.parentElement ?? container`、`.book-turn-viewport` 等）を監視するように変更。Canvas追加による自己伸縮で発火しないようにした。
2. **微小変化の無視（8px閾値）**:
   - リサイズ幅・高さの変化が 8px 未満の場合は再描画をスキップするガードを導入。
3. **イベントリスナーの参照固定**:
   - `window.addEventListener` / `removeEventListener` に名前付き関数参照を渡し、クリーンアップ時のリスナー解除漏れを防止。

## Prevention
Canvasなどの動的要素を動的に追加・削除するコンテナ自身を `ResizeObserver` で監視してはならない。常に親の安定したビューポート要素を監視すること。

## Related
- ファイル: `app/page.tsx` (`PdfCanvas`)
- コミット: `680c921`, `5679ff8`, `f811579`, `42c4ddb`
