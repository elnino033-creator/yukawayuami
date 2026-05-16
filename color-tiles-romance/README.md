# 🎀 Color Tiles Romance — Phase 0 Prototype

「直線交点クリック式」色合わせパズル × 美少女シナリオゲームのPhase 0プロトタイプです。
仕様書 `SPEC.md` の §6.3 に準拠したコアロジックと、検証用の1画面（パズル画面）を含みます。

## このプロトタイプの範囲

- ✅ コアロジック：`LineChecker`, `TimerSystem`, `StageValidator`, `PuzzleEngine`
- ✅ Canvas APIによるパズル画面の描画
- ✅ ホバープレビュー（PC）/ タッチプレビュー（モバイル）
- ✅ コンボボーナス、誤クリックペナルティ、ヒント、自動シャッフル
- ✅ 氷タイル・時間タイル・障害ブロックギミック
- ✅ サンプルステージ3つ
- ✅ Vitestによるコアロジックの単体テスト
- ✅ GitHub Pagesへの自動デプロイ

範囲外（Phase 1以降）：
- ❌ ノベルパート / シナリオエンジン
- ❌ タイトル画面 / ステージセレクト画面 / リザルト画面
- ❌ キャラ立ち絵 / CG / BGM / SE
- ❌ ヒロイン固有スキル
- ❌ 連結タイル / 影タイル / ペア固定タイル

## 必要環境

- Node.js 20+
- pnpm 8+ （npm でも動作可）

## セットアップ

```bash
pnpm install
# または: npm install
```

## 開発サーバー起動

```bash
pnpm dev
# ブラウザで http://localhost:5173/ を開く
```

## ビルド

```bash
pnpm build
# 出力先: dist/
```

ローカルプレビュー：

```bash
pnpm preview
```

## テスト

```bash
pnpm test          # 単発
pnpm test:watch    # ウォッチモード
```

## 型チェック / Lint

```bash
pnpm typecheck
pnpm lint
```

## 操作方法

- **クリック / タップ**：盤面の空マスをクリックすると、その点を通る水平または垂直の直線上で、両側の最寄りの同色タイルが消えます。
- **ホバー（PC）**：マウスを空マスに置くと、結ぶ可能性のある直線がプレビューされます。
- **ヒントボタン**：クリック可能な交点を3秒間ハイライト。使うと残り時間が-5秒。
- **リスタートボタン**：現在のステージをやり直し。

## ステージの追加

`public/data/stages/` 配下にJSONを追加し、`src/main.ts` の `stageIds` 配列にIDを追加してください。

ステージJSONの形式は `src/types/index.ts` の `StageDefinition` を参照。

## ディレクトリ構成

```
.
├── public/data/stages/        # ステージ定義（JSON）
├── src/
│   ├── core/                  # コアロジック
│   │   ├── LineChecker.ts     # 直線判定
│   │   ├── TimerSystem.ts     # 制限時間管理
│   │   ├── StageValidator.ts  # 解の存在検証
│   │   └── PuzzleEngine.ts    # パズル全体の状態管理
│   ├── scenes/
│   │   └── PuzzleScene.ts     # Canvas描画と入力
│   ├── types/                 # 型定義
│   ├── main.ts                # エントリポイント
│   └── style.css
├── tests/                     # Vitestテスト
├── .github/workflows/         # GitHub Actions
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## GitHub Pagesへのデプロイ

1. GitHubリポジトリにpush
2. Settings → Pages → Source を「GitHub Actions」に設定
3. mainブランチへのpushで自動デプロイされる

ベースパスはリポジトリ名から自動設定されます（`.github/workflows/deploy.yml`参照）。

## Claude Codeで開発を続ける

このプロトタイプはPhase 0の検証用です。Phase 1（MVP）に進める際の主な追加要素：

1. `src/scenes/TitleScene.ts` — タイトル画面
2. `src/scenes/StageSelectScene.ts` — ステージセレクト
3. `src/scenes/NovelScene.ts` — ノベルパート
4. `src/novel/ScenarioPlayer.ts` — シナリオエンジン
5. `src/store/saveStore.ts` — セーブデータ管理（localStorage）
6. `src/ui/` — 各種UIコンポーネント
7. キャラクター素材・シナリオYAML・BGM/SE

Claude Codeに `SPEC.md` とこのコードベースを渡せば、続きの実装を依頼できます。

## ライセンス

コード：MIT（予定）
仕様書中のキャラクター名・設定はサンプルです。
