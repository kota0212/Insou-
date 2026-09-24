# ADR-0005: 本番・検証環境のインフラレベル完全分離

Status: Accepted  
Date: 2026-09-11  

## Context
本システムでは、開発・テスト中の誤操作によって実店舗へ誤ったメニューが配信されたり、検証用のテストメールが実在店舗の店長へ誤送信されたり、本番データが開発作業中に破壊・上書きされるリスクを完全に排除する必要があった。

## Decision
VercelホスティングおよびSupabaseプロジェクトをインフラレベルで完全に分離する。

1. **Supabaseプロジェクトの分離**:
   - Production: `yzvencvfkltxehcjpgol`（本番専用）
   - Verification: `cqlddcxvanwoxpaouzow`（検証専用）
2. **Vercelデプロイ環境の分離**:
   - Production環境（`insou-menu-system.vercel.app`）はProduction Supabaseのみを参照。
   - Preview環境（`insou-menu-verification.vercel.app`）はVerification Supabaseのみを参照。
3. **ローカル開発の接続先**:
   - 原則ローカルまたはVerification環境のみに接続し、Production環境へローカルから直接接続することは禁止。
4. **マイグレーション先行適用**:
   - スキーマ変更は必ずVerification環境でCLI適用・テストを完了させてから、本番公開ゲートでProductionへ適用する。

## Consequences
- **メリット**:
  - 検証作業中のバグや大量テストメール送信が本番店舗へ一切波及しない。
  - RLSやポリシーの実験を安全に行える。
- **デメリット / トレードオフ**:
  - 2つのSupabaseプロジェクトのスキーマ同期・マイグレーション適用管理が必要。
