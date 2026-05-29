# セッションレポート #4 — 現状監査と孤立シナリオの整理

## 概要

本セッションでは、ディレクター視点での全体監査を行い、(1) ビルド健全性の確認、
(2) シナリオファイルの到達可能性分析と孤立コンテンツの削除、
(3) ドキュメント（SPEC.md / README.md）の現状同期、
(4) QA・回収すべき残課題の洗い出しを実施した。

---

## 1. ビルド健全性（すべてグリーン）

| 項目 | 結果 |
|---|---|
| `pnpm install` | OK |
| `pnpm typecheck` | OK |
| `pnpm test` | **72 passed**（8ファイル） |
| `pnpm build` | OK |
| 未マージ PR | なし |

---

## 2. シナリオ到達可能性分析

### 手法

ゲームプレイ上の「起点」を以下から収集し、`next` / `jump` チェーンを幅優先探索で辿って
到達可能なシナリオ集合を算出した。

- 起点1: `public/data/stages/*.json` の `preScenario` / `postScenario` / `rewardScenario`
- 起点2: `SceneManager.ts` 内の `mountNovelSceneWithCallback('...')` リテラル
  （`ch01〜05_final_flashback`, `epilogue_true` 等）
- チェーン: 各シナリオ JSON 内の `choice[].next` および `jump`

> 重要な発見: 開始フローは `NEW GAME → ch00_tutorial（preScenario=prologue_main）→ jump:intro_main`。
> `intro_main` は `next` ではなく **`jump`** で接続されているため、`jump` を辿らないと
> 誤って孤立判定される。

### 結果

全 110 ファイル中、**到達不能 31 ファイル**を検出。これらは「1章=5ステージ」だった
旧設計の名残・分岐命名の不統一・章末処理の置換に由来する。

#### A群（旧5ステージ設計の残骸・24件）→ 本セッションで**削除済み**

```
ch01_s04_pre, ch01_s04_post, ch01_s05_pre, ch01_s05_post, ch01_s05_pre_A, ch01_s05_pre_B
ch02_s04_pre, ch02_s04_post, ch02_s05_pre, ch02_s05_pre_A, ch02_s05_pre_B, ch02_s03_puzzle
ch03_s04_pre, ch03_s04_post, ch03_s05_pre, ch03_s06_pre, ch03_s03_pre_A, ch03_s03_pre_B
ch04_s04_pre, ch04_s04_post, ch04_s05_pre, ch04_s06_pre, ch04_s03_pre_A, ch04_s03_pre_B
```

- `chXX_s04/s05/s06_*`: 現行は各章3ステージ構成のため対応ステージが存在せず到達不能。
- `chXX_s03_pre_A/_B`（ch03/ch04）: ch03/ch04 の `s03_pre` は選択肢で **`s05_pre_A/_B`** へ
  分岐する実装になっており、`s03_pre_A/_B` は未使用（章ごとに分岐先の命名が不統一）。
- `ch02_s03_puzzle`: どこからも参照されない孤立ファイル。

削除に伴い、`SceneManager.ts` のデバッグパネル定義（`ALL_SCENARIOS` / `SCENARIO_AFTER`）
からも該当エントリを除去した（到達可能な `chXX_s05_pre_A/_B` は保持）。

#### B群（章末post・6件）→ テキスト照合の上、**4件削除・2件は再配線で復活**

テキスト照合（本文行の完全一致）の結果、B群・C群とも end / intro_main との
**文章の重複はゼロ行**。重複していたのは「ナラティブ上の役割」であった。

- **削除（4件）**: `ch01_s03_post`, `ch02_s03_post`, `ch03_s03_post`, `ch04_s03_post`
  - いずれも「折り返しよ」「次が最後の試練」「次の閃き用意してある」等、
    **後続ステージがある前提**の中間シーン。現行3ステージ構成（stage03 直後に `chXX_end`）
    と矛盾するため削除。
- **再配線で復活（2件）**: `ch00_tutorial_post`, `ch00_tutorial2_post`
  - 重複ではなく、ゆかりの「番人」「封印」説明を含む canon 整合コンテンツ。
    特に `tutorial2_post` 末尾は「塔の第1層…赤い光」で 1 章への橋渡しになっている。
  - 配線漏れと判断し、`ch00_tutorial.json` / `ch00_tutorial2.json` に
    `postScenario` を設定して本来のフローへ復活させた。

#### C群（置換済み導入・1件）→ **削除**

```
tutorial_intro
```

- 案内役が無名の「声」で主人公を「旅人よ」と呼ぶ汎用版。現行 canon
  （`intro_main`＝ゆかり登場・七瀬真白の過去）と設定が矛盾する旧オープニング draft のため削除。

---

## 3. ドキュメント同期

- `SPEC.md`: §3 ステージ一覧・§6.3 シナリオ数・§10 既知問題を現状に合わせて更新。
  既に解消済みの項目（タイトル背景欠落・パズルBGM 404・resizeリスナーリーク・
  `playTimeLow` 未配線・シナリオSEのファイル再生）を「解消済み」として整理し、
  reward/ギャラリー・S ランク・LOG/SAVE/SKIP/FF/AUTO UI の存在を追記。
- `README.md`: テスト数を 72 に更新。

---

## 4. 回収すべき残課題（次セッション向け）

### 解決済み（本セッション）
- B群・C群の扱いを確定（4件削除・2件再配線・1件削除）。詳細は §2 参照。

### コンテンツ整合
3. **分岐命名の不統一**: ch01/ch02 は `s03_pre_A/_B`、ch03/ch04 は `s05_pre_A/_B` を
   分岐先に使用。今後の保守性のため命名規則の統一を検討。
4. **デバッグ専用の dangling 参照**: `SCENARIO_AFTER` に `ch05_s05_pre_A/_B`（実体なし）が
   残存。デバッグ専用で実害はないが、整理余地あり。

### バランス・QA
5. **`ch04_stage03` の制限時間 480 秒**: 他章末（55〜120秒）比で突出。意図確認。
6. **通しQA**: TRUE / BAD 両ルートの最後までの通し、S ランク→ご褒美→ギャラリー登録、
   スマホ実機での操作性。

---

## ブランチ

- 作業ブランチ: `claude/vigilant-shannon-ao3cN`
