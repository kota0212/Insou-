# Architecture Decision Records (ADR)

> **Status**: CURRENT  
> **Last Updated**: 2026-09-24  

本ディレクトリには、INSOU店舗メニュー閲覧システムの設計において成立した**重要な技術的意思決定の背景・理由・結果（ADR: Architecture Decision Records）** を保存します。

---

## ADR一覧

| 番号 | タイトル | 決定日 | ステータス | 概要 |
|---|---|---|---|---|
| [ADR-0001](./ADR-0001-vercel-supabase-migration.md) | 旧MVP (GAS) から Next.js + Vercel + Supabase への移行 | 2026-09-10 | **Accepted** | 容量・速度・認証制限の抜本的解消 |
| [ADR-0002](./ADR-0002-store-auth-otp-and-device-session.md) | 店舗固定パスワード全廃とメールOTP＋30日端末セッション採用 | 2026-09-11 | **Accepted** | 退職者不正アクセス排除と運用負荷低減の両立 |
| [ADR-0003](./ADR-0003-no-full-offline-viewing.md) | 完全オフライン閲覧の禁止とセッション起動時検証 | 2026-09-11 | **Accepted** | 端末紛失・一括ログアウト時のキャッシュ消去担保 |
| [ADR-0004](./ADR-0004-device-identification-and-httponly-cookie.md) | 端末識別におけるIP依存排除とHttpOnly Cookie採用 | 2026-09-11 | **Accepted** | XSS対策とモバイル回線変動への耐性 |
| [ADR-0005](./ADR-0005-production-verification-separation.md) | 本番・検証環境のインフラレベル完全分離 | 2026-09-11 | **Accepted** | 誤操作・テストデータ混入・本番メール誤送信の防止 |
| [ADR-0006](./ADR-0006-production-validation-before-otp-rollout.md) | 実店舗メール未確定時の本番先行検証方針 | 2026-09-18 | **Accepted** | OTPコードを維持したまま本番主要機能の早期疎通確認 |

---

## ADRの作成ルール
1. 重要な設計方針の転換、技術スタックの採用／不採用、セキュリティモデルの変更時に必ず作成する。
2. 過去の決定が変更された場合、古いADRを直接書き換えて歴史を消すのではなく、ステータスを `Superseded` に変更し、新しいADRからリンクする。
