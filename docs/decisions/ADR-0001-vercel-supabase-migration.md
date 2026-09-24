# ADR-0001: 旧MVP (GAS) から Next.js + Vercel + Supabase への移行

Status: Accepted  
Date: 2026-09-10  

## Context
初期の試作（旧MVP）では、Google Apps Script (GAS)、Google Spreadsheet（データ管理）、Google Drive（PDF保管）、およびPDFのBase64エンコードによるJSON配信を行っていた。
しかし、100店舗以上への本格展開にあたり、以下の問題が致命的となった：
1. GASの実行時間制限（6分）および同時実行制限。
2. PDFをBase64文字列としてJSONで配信するため、データ通信量が約1.33倍になり、モバイル通信でのロード遅延やクラッシュが発生。
3. SpreadsheetをDBとして利用することによる同時書き込み競合・整合性の脆弱さ。
4. 適切な権限管理（RLS）や監査ログの欠如。

## Decision
本番システムとして以下のスタックへ完全移行する：
- **フロントエンド / ホスティング**: Next.js App Router on Vercel
- **データベース / 認証 / ストレージ**: Supabase (PostgreSQL + RLS + Supabase Auth + Private Storage)
- **端末キャッシュ**: IndexedDB（Blob直接保存）
- **PDFレンダリング**: PDF.js + Canvas

## Alternatives
- Firebase (Firestore + Cloud Storage): RLSに相当するSecurity Rulesはあるが、リレーショナルデータ操作や複雑な集計・RPCの柔軟性でPostgreSQL (Supabase) が優位と判断。
- Cloudflare Pages + Workers + D1 + R2: エッジ性能は高いが、当時の開発リソースおよび認証基盤（GoTrue）との親和性からSupabaseを採用。

## Consequences
- **メリット**:
  - PDFをバイナリストリーミングで高速取得可能。
  - PostgreSQLのACIDトランザクションおよびRLSによる厳格なデータ保護。
  - VercelによるグローバルCDNエッジ配信と自動プレビュー環境。
- **デメリット / トレードオフ**:
  - 旧GASコードは完全非推奨（Legacy）となり、運用フローの再設計が必要となった。
