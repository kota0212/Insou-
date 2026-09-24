# TS-0002: PDF.jsワーカー破棄エラーがキャンセル例外として捕捉されない問題

## Symptoms
`PdfCanvas` のレンダリング中に画面回転やページ送り等で再描画がトリガーされた際、正常なキャンセル処理として無視されるべき例外が `catch` ブロックでエラー扱いとなり、画面上に「PDFを表示できませんでした」が一瞬または継続して表示される。

## Trigger
Reactコンポーネントの再レンダリング時、前回の `useEffect` クリーンアップ関数内で `renderTask.cancel()` および `documentTask.destroy()` が実行された直後。

## Cause
PDF.jsの `renderTask.cancel()` は通常 `RenderingCancelledException` という名前の例外をスローする。
しかし、`documentTask.destroy()`（ワーカーの破棄）が並行して実行された場合、レンダリング処理は `Error: Worker was destroyed` や `Error: MessageHandler is destroyed` という汎用エラー名でrejectされる。
従来のコードでは：
```ts
if (!cancelled && !(error instanceof Error && error.name === 'RenderingCancelledException')) {
  setStatus('error');
}
```
と判定していたため、エラー名が `RenderingCancelledException` でない場合に `!cancelled` の評価タイミングや例外ハンドリングの齟齬により、エラー画面へ落ちていた。

## Resolution
コミット `680c921` および `5679ff8` にて修正：
1. `cancelled = true` が立っている場合（アンマウントまたは新しい再描画が開始された後）にスローされた例外は、例外の型や名前にかかわらず**すべて意図的なキャンセルの副作用として握りつぶす（無視する）**ようにガードを強化。
2. コミット `5679ff8` では、描画ごとに独立したPDF.jsロードタスクを生成・管理し、ワーカー競合を排除。

## Related
- ファイル: `app/page.tsx`
- コミット: `680c921`, `5679ff8`
