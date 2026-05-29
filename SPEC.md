# Color Tiles Romance 仕様書

本書は `/home/user/yukawayuami/color-tiles-romance` のソースコード・データを実コードベースから読み取って整理したものです。

---

## 1. ゲーム概要

- ジャンル: 「上海／Color Tiles」風の **空マスクリック型マッチパズル × ノベル ADV**
- 実装: TypeScript + Vite, Canvas 2D。`/src/main.ts` がエントリ。
- 進行: 「色彩の塔」を上っていく構成。プロローグ → 第1〜5章 → エピローグ。
- 各ステージは「パズル前ノベル → パズル本編 → パズル後ノベル」のサンドイッチ構造。
- セーブは `localStorage`（キー `color-tiles-romance-save`、`version:1`）。

---

## 2. ゲームフロー

`SceneManager`（`src/scenes/SceneManager.ts`）が以下のシーンを切替えて管理する。

```
title → (NEW GAME)  → puzzle(ch00_tutorial)
                                    ↓ preScenario あり
                              novel(intro_main 等) → puzzle 本体
                                    ↓ clear
                              novel(postScenario) → result → 次ステージ
                                    ↓ gameover
                                    result（リトライ／タイトル）
title → (CONTINUE)  → 最初に未クリアのステージへ
title → (STAGE SELECT) → stageSelect（1ステージ以上クリアで解放）
```

### シーン種別 (`SceneType`)
`title | novel | stageSelect | puzzle | result`

### 線形進行配列 `LINEAR_STAGES`
```
ch00_tutorial, ch00_tutorial2,
ch01_stage01..03,
ch02_stage01..03,
ch03_stage01..03,
ch04_stage01..03,
ch05_stage01..07
```
全21ステージ（プロローグ・デモを除く）。

### 章ごとの特別フロー
- ch01_stage03 / ch02_stage03 / ch03_stage03 / ch04_stage03 クリア後: それぞれ `chXX_final_flashback` を挿入してから次ステージへ。
- **ch05_stage07** クリア後: `ch05_final_flashback` → `epilogue_true` → `EndRollScene` → タイトル。
- preScenario 中に `route_bad` フラグが立つと、その時点でタイトルに戻る（BAD ルート）。
- preScenario は `progressStore.readLines` に `pre:<stageId>` で既読管理され、2 度目以降は自動でスキップされる（インメモリのみ。リロードで消える）。

---

## 3. ステージ一覧

データは `public/data/stages/*.json`（実体は `StageDefinition`）。`time` は秒、`miss` は誤クリックペナルティ秒、`hint` はヒント回数。

| ID | タイトル | 章 | 盤面 | 時間 | miss | hint | block解除 | 特殊イベント | BGM |
|---|---|---|---|---|---|---|---|---|---|
| ch00_prologue | プロローグ：色彩の塔の招待 | 0 | 6x4 | 90 | 0 | 3 | never | – | – |
| ch00_tutorial | チュートリアル1：横に消してみよう | 0 | 6x4 | 300 | 0 | 3 | never | – | 妖精の小径.mp3 |
| ch00_tutorial2 | チュートリアル2：縦にも消してみよう | 0 | 6x6 | 300 | 0 | 3 | never | – | 妖精の小径.mp3 |
| ch01_stage01 | 第1章 ステージ1：はじめての壁 | 1 | 6x5 | 40 | 30 | 3 | – | – | 緋色のあかり.mp3 |
| ch01_stage02 | 第1章 ステージ2：広がる空間 | 1 | 7x6 | 47 | 30 | 3 | – | – | 緋色のあかり.mp3 |
| ch01_stage03 | 第1章 ステージ3：交差する思い | 1 | 8x7 | 55 | 30 | 2 | – | – | 緋色のあかり_last.mp3 |
| ch02_stage01 | 第2章 ステージ1：氷タイルの洗礼 | 2 | 9x6 | 60 | 0 | 3 | – | – | 氷鈴の世界.mp3 |
| ch02_stage02 | 第2章 ステージ2：氷の深み | 2 | 9x8 | 85 | 30 | 2 | – | – | 氷鈴の世界.mp3 |
| ch02_stage03 | 第2章 ステージ3：氷の迷宮 | 2 | 9x9 | 95 | 30 | 1 | – | afterIceCleared(1) → addIceTiles×3, cutIn=mio「ここにいて・・・」 | 氷鈴の世界_last.mp3 |
| ch03_ice_demo | ギミックデモ：氷・時間・障害ブロック | 3 | 8x6 | 150 | 30 | 3 | afterPairs(3) | – | 翠葉の迷宮.mp3 |
| ch03_stage01 | 第3章 ステージ1：障害の壁 | 3 | 10x8 | 110 | 30 | 2 | afterPairs(12) | – | 翠葉の迷宮.mp3 |
| ch03_stage02 | 第3章 ステージ2：氷と岩 | 3 | 10x9 | 100 | 30 | 2 | afterPairs(12) | – | 翠葉の迷宮.mp3 |
| ch03_stage03 | 第3章 ステージ3：岩盤の彼方 | 3 | 10x10 | 105 | 30 | 1 | afterPairs(10) | whenBlocksHalfway → restoreBlocks(newReleaseCount=14), cutIn=suzu「なぜ休んでくれないのですか」 | 翠葉の迷宮.mp3 |
| ch04_stage01 | 第4章 ステージ1：時間との戦い | 4 | 10x8 | 100 | 30 | 2 | – | – | オレンジ宮殿.mp3 |
| ch04_stage02 | 第4章 ステージ2：氷の連鎖 | 4 | 10x9 | 90 | 30 | 2 | – | – | オレンジ宮殿.mp3 |
| ch04_stage03 | 第4章 ステージ3：ひまりの爆発 | 4 | 10x10 | 480 | 30 | 1 | – | afterPairs(4) → transformToBomb×12, cutIn=himari「芸術は爆発だ！💣」 | Crown of Ashes.mp3 |
| ch05_stage01 | 第5章 ステージ1：全てのギミック | 5 | 10x9 | 70 | 30 | 1 | afterPairs(15) | – | 黒階段の誓い.mp3 |
| ch05_stage02 | 第5章 ステージ2：混沌の嵐 | 5 | 12x10 | 80 | 30 | 1 | afterPairs(20) | – | 黒階段の誓い.mp3 |
| ch05_stage03 | 第5章 ステージ3：彼女の真心 | 5 | 13x11 | 95 | 30 | 1 | afterPairs(10) | – | 黒階段の誓い.mp3 |
| ch05_stage04 | 第5章 ステージ4：記憶の奔流 | 5 | 14x12 | 105 | 30 | 1 | afterPairs(12) | – | 黒階段の誓い.mp3 |
| ch05_stage05 | 第5章 ステージ5：封印された真実 | 5 | 15x12 | 110 | 30 | 1 | afterPairs(14) | – | 黒階段の誓い.mp3 |
| ch05_stage06 | 第5章 ステージ6：最後の儀式 | 5 | 16x12 | 115 | 30 | 1 | afterPairs(18) | – | 黒階段の誓い.mp3 |
| ch05_stage07 | 第5章 最終決戦：黒を塗りつぶせ | 5 | 16x14 | 120 | 30 | 0 | afterPairs(15) | – | 黒階段の誓い.mp3 |

> ch01_stage01〜03 以降の章は `generationParams`（seed + targetPairs）で実行時にレイアウト生成、ch00 系と一部のデモは `tilesLayout` の手書き定義。

---

## 4. パズルシステム

### 4.1 ルール概要（LineChecker）
- **空マスをクリック**すると、その点を通る水平/垂直直線上で両側にある「最寄りの同色タイル」同士が消える。
- マッチ種別:
  - `horizontal`: 左右の最寄り同色 (`L`,`R`)
  - `vertical`: 上下の最寄り同色 (`U`,`D`)
  - `corner`: L 字（クリックセルを角として `U+L / U+R / D+L / D+R`）
- 1 回のクリックで複数マッチが同時成立する場合は「交点同時消し（最大 4 タイル）」または T 字消し（3 タイル）として処理される（`applyMultiRemoval`）。
- `findAnyValidPair()` でヒント／詰み判定。`findAllValidPairs()` で全候補列挙（StageValidator が利用）。

### 4.2 タイル種別（`TileType`）

| type | 仕様 |
|---|---|
| `normal` | 通常タイル。直線/L字でマッチ消去 |
| `ice` | 同色マッチを 2 回受ける必要がある。1 回目は `state=cracked` に変化のみ。`normal` 状態の氷は `canPair` で除外され、直接マッチ不可。隣接タイル消去でも `cracked` 化する（`checkAdjacentIce`） |
| `time` | 消去で +10 秒（`bonusSec += 10`） |
| `bomb` | 1 秒ごとに `countdown` が減る。0 になると盤上には残ったまま `bombPenaltySec`（既定 20 秒）を減算し、`countdown` がリセット。初期値 `bombCountdown`（既定 15 秒） |
| `linked` | 同 `linkGroupId` の連結グループ。マッチ成立で同グループ全タイルを一括消去（`handleLinkedChainRemoval`）。**Phase 0 では型予約のみ・データ上未使用** |
| `shadow` | 色マスク（"?"表示）。ホバー時のみ 3000ms 色を一時公開（`shadowReveals`）。**Phase 0 では未実装、データ上未使用** |
| `paired` | ペア固定（同じ `pairId` 同士のみマッチ可能）。**Phase 0 では未実装、データ上未使用** |
| `block` | 障害ブロック。色なし(`color:null`)で消去対象外。クリア判定からも除外 |

### 4.3 マッチ判定詳細

- `canPair`:
  - 両方非 null、別タイル、同色（null は不可）
  - `normal` 状態の氷は不可
  - `paired` 同士は `pairId` 一致必須
- L 字マッチも `findAnyValidPair / findAllValidPairs` の対象。
- 交点では `horizontal + vertical` 両方ヒットで 2 件返り、`applyMultiRemoval` がタイルを位置キーで重複排除して同時消去。

### 4.4 スコアシステム（`PuzzleEngine`）

- ペア消去: `+100`
- コンボ（最後の消去から 3000ms 以内）: `combo >= 2` のとき `+combo × 50`
- 時間タイル消去: `+10 sec`
- クリア時ボーナス:
  - 残時間 × 10
  - ノーヒント: `+1000`
  - ノーミス: `+500`
- レーティング（`SceneManager.calcRating`）: `S ≥ 5000`, `A ≥ 3000`, `B ≥ 1500`, それ未満は `C`
- 誤クリック: コンボリセット、`missCount++`、`missPenaltySec` 秒減算

### 4.5 ブロック解除ルール（`BlockReleaseRule`）

| type | 解除条件 |
|---|---|
| `afterPairs` | n ペア消去で全ブロック消滅 |
| `afterTime` | 開始 n 秒経過で消滅 |
| `onLastTile` | 最後の色付きタイル消去と同時（クリア時に処理される） |
| `never` | 消滅しない（演出のみ） |

- 障害ブロック上に「解除まで残り何ペア必要か」を `blockRemainingCount` として表示（`afterPairs` のみ）。
- 解除時は `blocksReleased` イベント。

### 4.6 特殊イベント（`SpecialEventDef`）

`stage.specialEvent` で 1 ステージ 1 個まで定義。発火は 1 度のみ（`specialEventFired`）。

- **トリガー**
  - `afterPairs { count }`: 累計ペア消去数
  - `afterIceCleared { count }`: 累計氷消去数
  - `whenIceRemaining { count }`: 盤上の氷タイル数 ≤ count
  - `whenBlocksHalfway`: `blockReleaseRule.afterPairs` の半分到達（`Math.floor(count/2)`）
- **エフェクト**
  - `transformToBomb { count }`: ランダムな `normal` タイルを爆弾化（`transformTilesToBombs`）
  - `addIceTiles { count }`: 隣接マッチ可能・同色 2 枚以上ある normal タイルを 1 枚ずつ氷化（`cracked` でなく `normal`）。条件不足なら不発（`addIceTiles`）
  - `restoreBlocks { newReleaseCount? }`: 初期ブロック位置を空マスに復活、必要なら `blockRule` を `afterPairs(newReleaseCount)` に差し替え（`restoreBlocksSpecial`）
- **カットイン**: 発火時タイマー停止 → `se_cutin.mp3` 再生 → 1700ms 演出（500ms スライド → 900ms ホールド → 300ms フェード）→ エフェクト適用 → タイマー再開。キャラ画像は `assets/chara/{character}_angry.png`。

### 4.7 詰み・シャッフル
- `isStuck()`：有効ペアが 0 になりかつ未クリア。`shuffle()` で残タイル位置の色だけランダム入れ替え（ブロックは固定）。最大 5 回まで再シャッフル。

### 4.8 チュートリアル（`TutorialStep`）
- `explain`: テキスト＋「次へ ▶」ボタン。タイマー停止。
- `force_match`: `allowedCells` のみクリック受付。タイマー稼働。
- `praise`: 称賛文＋自動進行 (`autoAdvanceMs`)。タイマー停止。
- `highlightCells` で対象タイルをパルス枠で強調。

---

## 5. タイマーシステム（`TimerSystem`）

- `start(sec)` で開始。`setInterval(1000)` で `onTick` 通知。
- `add(sec)` / `subtract(sec)`: ボーナス・ペナルティ。`subtract` で 0 到達なら `notifyTimeUp`。
- `pause` / `resume`: チュートリアル説明中・カットイン中で利用。
- `freeze(durationMs)`: 「みおスキル：静寂の凍結」用に一定時間停止 → 自動再開（実ゲーム呼び出しは未確認）。
- `stop()`: クリア・ゲームオーバーで完全停止。
- `onTimeUp` で `engine.emit({type:'gameOver'})` → 1500ms 遅延後ゲームオーバー（詰み時も同様）。
- HUD タイマーは残 10 秒以下で `.warn` クラスを付与。SoundEngine の `playTimeLow` は実装されているがエンジンからの自動発火コードは見当たらない（未配線）。

---

## 6. シナリオシステム

### 6.1 コマンド（`ScenarioStep` の union）

JSON 配列形式。各要素は以下のいずれか（フィールド名で識別）。

| キー | 内容 |
|---|---|
| `bg: string\|null` | 背景画像。`assets/bg/{key}.png` を試し、404 なら `.jpg` にフォールバック。`null` で初期色 `#1a1a2e` |
| `bgm: string\|null` | BGM。`bgm_map.json` のキーを優先、なければ生ファイル名として `assets/bgm/{name}` を再生 (loop, volume 0.5)。`null` で停止 |
| `chara: { id, expr, pos, show?, hide?, scale? }` | キャラ表示。画像は `assets/chara/{id}_{expr}.png`。`pos`: `left/center/right`。`hide:true` でその id を消す |
| `text: { name, body }` + 任意 `id` | テキスト 1 行。タイプライタ 30ms/文字。`id` が `readLines` に存在すれば即全文表示 |
| `choice: [{ label, flag?, value?, next? }]` | 選択肢。クリックで `flags[flag] += value(=1)`。`next` 指定時は `assets/data/scenarios/{next}.json` をフェッチして差し替え |
| `se: { src, loop? }` | `SeManager.playSe(src)`（Web Audio合成）。`src` が `SE_GENERATORS` に無ければ無音。`loop` は未参照 |
| `effect: { type, duration }` | `duration` ms 経過後に自動進行（タイプは現状参照されない） |

操作:
- 左クリック / Space / Enter: 次へ進む or タイプライタを全文表示
- 選択肢は中央寄せのボタン群（フォントサイズ自動縮小）
- 名前プレートは現在表示中キャラの色を流用、なければ紫系デフォルト

### 6.2 キャラクター一覧と色 (`CHARA_COLORS`)

| ID | 名前 | ScenarioPlayer 色 | PuzzleScene カットイン色 | チュートリアル話者色 |
|---|---|---|---|---|
| akari | あかり | `#ff8fb1`（ピンク） | `#ff8fb1` | `#ff8fb1` |
| mio | みお | `#4a90e2`（青） | `#4a90e2` | `#4a90e2` |
| suzu | すず | `#5ec76a`（緑） | `#5ec76a` | `#5ec76a` |
| himari | ひまり | `#ffaa33`（オレンジ） | `#ffaa33` | `#ffaa33` |
| yukari | ゆかり | `#9c6bd8`（紫） | `#9c6bd8` | `#9c6bd8` |
| default | – | `#ffd234` | – | – |
| 主人公 | 主人公 | – | – | `#b0b8cc` |

立ち絵表情は 7 種類: `normal / smile / angry / sad / shy / blush / surprise`。シナリオ内では `phone:ringing` のようにオブジェクト系のキャラも `chara` で扱われる（該当画像はリポジトリには無く、画像未ロード時はプレースホルダ矩形）。

### 6.3 シナリオファイル一覧（`public/data/scenarios/` 全 86 ファイル）

> 旧「1章=5ステージ」設計の残骸（`chXX_s04/s05/s06_*` 等）24 ファイルを
> session #4 で削除済み。到達可能性分析の詳細は `docs/session-report-4.md` を参照。

主要グループ:
- `intro_main.json`: 導入（電話／日常の朝）
- `tutorial_intro.json`, `ch00_tutorial_post.json`, `ch00_tutorial2_post.json`, `prologue_post.json`
- 各章 `chXX_sYY_pre/_post.json` と分岐 `_A/_B` バリアント
- フラッシュバック: `ch01_final_flashback.json` 〜 `ch05_final_flashback.json`
- 章エンディング: `ch01_end.json` 〜 `ch05_end.json`
- 5 章分岐: `ch05_route_BAD.json`, `ch05_route_TRUE.json`
- 最終エピローグ: `epilogue_true.json`

> 末尾 `_pre_end`、`ch02_s03_puzzle.json` のような未参照ファイルあり（後述）。

---

## 7. BGM・SE

### 7.1 BGM キーマップ（`public/data/bgm_map.json`）

| key | file |
|---|---|
| bgm_prologue | op_色彩の塔へ.mp3 |
| bgm_mysterious_wind | The_Unfolding_Hour.mp3 |
| bgm_cold_wind | 氷鈴の世界.mp3 |
| bgm_forest_ambient | 翠葉の迷宮.mp3 |
| bgm_clockwork | オレンジ宮殿.mp3 |
| bgm_chapter_clear | Golden_Spires_Rising.mp3 |
| bgm_tension | Steel_and_Shadows.mp3 |
| bgm_tension_high | Tooth_And_Lever.mp3 |
| bgm_epic_climax | Vow_Of_The_Gilded_Hall.mp3 |
| bgm_climax_tension | The_Dissolving_Spire.mp3 |
| bgm_vocal_ending | ed_色彩の塔.mp3 |
| bgm_piano_gentle_morning | エンディング_穏やか_bgm_春の約束.mp3 |
| bgm_piano_sad_loop | 君のいない色彩.mp3 |
| bgm_tutorial | amaotonomeiro.mp3 |
| bgm_tower_entrance | **Vesper of Ash.mp3** |
| bgm_ch05 | **Vesper of Ash.mp3** |
| bgm_flashback | AfterSchoolLibrary.mp3 |
| 緋色のあかり | 緋色のあかり.mp3 |
| 色彩の再起 | 色彩の再起.mp3 |

### 7.2 物理 BGM ファイル（`public/assets/bgm/`、計 31 ファイル）

```
夢の跡を照らす.mp3 / scenario.mp3 / 妖精の小径.mp3 / 妖精の小径_v2.mp3 /
The_Unfolding_Hour.mp3 / amaotonomeiro.mp3 / 氷鈴の世界.mp3 /
Threshold_of_the_Map.mp3 / Golden_Spires_Rising.mp3 / The_Keeper_s_Garden.mp3 /
title.mp3 / The_Pendulum_s_Grace.mp3 / 君のいない色彩.mp3 /
エンディング_穏やか_bgm_春の約束.mp3 / bgm_game.mp3 / The_Dissolving_Spire.mp3 /
オレンジ宮殿.mp3 / AfterSchoolLibrary.mp3 / ed_色彩の塔.mp3 /
紫塔の終章.mp3 / 翠葉の迷宮.mp3 / Hollow Underfloor.mp3 / op_色彩の塔へ.mp3 /
Steel_and_Shadows.mp3 / Tooth_And_Lever.mp3 / puzzle.mp3 /
The_Frost_Bound_Spire.mp3 / Beneath_the_Permafrost.mp3 /
The_Sunken_Clearing.mp3 / Vow_Of_The_Gilded_Hall.mp3
```

### 7.3 SE

- `SoundEngine`（Web Audio 合成・ファイル不要）
  - `playClick` / `playMatch` / `playMiss` / `playIceCrack` / `playClear` / `playGameOver` / `playTimeLow`
- `SeManager`
  - `playSe(seId)`: 合成 SE。登録は `se_glass_shatter` のみ（`playGlassShatter`）
  - `playSeFile(filename)`: `public/assets/se/<filename>` を `HTMLAudio` で再生
- 物理 SE ファイル: `public/assets/se/se_cutin.mp3` のみ
- ScenarioPlayer の `se` ステップは `playSe(src)` を呼ぶ（実体登録は se_glass_shatter のみなので、他の名前を指定しても無音）

---

## 8. アセット一覧

### 8.1 背景画像 (`public/assets/bg/`)

塔 1F〜5F の状態違い・特殊背景・章用：

```
bg_tower_entrance.jpg
bg_tower_floor1_gray.jpg / floor1_red_bright / floor1_red_dim
bg_tower_floor2_blue_bright / blue_dim / blue_ice
bg_tower_floor3_green_bright / green_dim / green_forest
bg_tower_floor4_yellow_bright / yellow_dim / yellow_clock
bg_tower_floor5_purple_dark / purple_dim / purple_final / rainbow
bg_atelier_morning.jpg / bg_ch01_crimson.jpg
home.jpg / office.jpg
stage0_open.jpg / stage0_close.jpg / stage1_bef.png / stage1_after.png
stage2.jpg / stage3.jpg / stage4.jpg / stage5.jpg
```
（タイトル背景は `assets/bg/title_bg.jpg` を期待するが、リポジトリには **未存在**。フォールバックの暗背景になる）

### 8.2 キャラクター立ち絵 (`public/assets/chara/`)

5 キャラ × 7 表情 = 35 枚:

```
akari / himari / mio / suzu / yukari
  × normal / smile / angry / sad / shy / blush / surprise
```

PuzzleScene のカットインは強制的に `{id}_angry.png` を利用。

### 8.3 SE

`public/assets/se/se_cutin.mp3` のみ。

---

## 9. セーブデータ仕様

### `SaveStore`（`localStorage["color-tiles-romance-save"]`）

```ts
SaveData = {
  version: 1,
  currentChapter: number,           // 既定 0
  currentStage:   number,           // 既定 0（チャプター内インデックス）
  stageRecords: Record<stageId, {
    bestScore: number,
    bestRating: 'S'|'A'|'B'|'C'|null,
    cleared: boolean,
  }>,
  settings: {
    bgmVolume: 0..1,                // 既定 0.8
    seVolume:  0..1,                // 既定 0.8
    textSpeed: 'slow'|'normal'|'fast', // 既定 'normal'
    autoSave:  boolean,             // 既定 true
  }
}
```

- `setRecord` でベストスコア・最良レーティングを保持マージ。`autoSave:true` のとき即保存。
- `version !== 1` ならデフォルトへリセット。
- `reset()`: NEW GAME 時に呼ばれる。

### `ProgressStore`（揮発インメモリ）

- `currentSceneType`, `currentStageId`, `currentChapter`, `currentStageIndex`
- `scenarioContext`:
  - `flags: Record<string, number>`（選択肢で増減）
  - `readLines: Set<string>`（テキスト ID / `pre:<stageId>` 等で既読管理）
- 「同 preScenario を 2 周目以降スキップ」の判定に利用。

---

## 10. 既知の問題・修正予定

コードを読み込んで気付いた点を記録する。

> **更新メモ（session #4）**: 本書初版以降の実装で、以下は既に**解消済み**。
> - #1 タイトル背景画像（`title_bg.jpg` / `title_bg_phone.jpg` 追加済み）
> - #2 パズル BGM 404（`Crown of Ashes.mp3` 等を含め実ファイル配置済み）
> - #13 `playTimeLow` 未配線（`PuzzleScene` から呼び出し済み）
> - #16 `ScenarioPlayer` の resize リスナーリーク（`boundResize` で正しく解除）
> - #12 シナリオ `se` ステップ（`playSeFile` + `playSe` 併用に変更済み）
>
> また本書未記載の追加システムとして、**S ランクご褒美シナリオ＋ギャラリー**、
> **3スロット手動セーブ/ロード**、**LOG / SKIP / 早送り(▶▶) / AUTO UI**、
> **BAD/TRUE ルート分岐**が実装済み。以下のリストは初版時点の記録として残す。

### 仕様上の不整合・データ欠落
1. **タイトル背景画像なし**: `TitleScene.loadBgImage` は `assets/bg/title_bg.jpg` を期待するが当該ファイルがリポジトリに存在しない。フォールバックの黒系グラデで表示される。
2. **存在しない BGM 参照**（`puzzleBgm` 指定だが `public/assets/bgm/` に同名ファイルが無い）:
   - `緋色のあかり_last.mp3` （ch01_stage03）
   - `氷鈴の世界_last.mp3` （ch02_stage03）
   - `Crown of Ashes.mp3` （ch04_stage03）
   - `黒階段の誓い.mp3` （ch05_stage01〜07）
   - PuzzleScene 既定 fallback の `Steel_and_Shadows.mp3` も `BgmManager` が encodeURIComponent で取り扱うため、空白 1 文字違いでも 404 になる。
3. **bgm_map.json が `Vesper of Ash.mp3` を参照しているがアセットに該当ファイルなし**（`bgm_tower_entrance`, `bgm_ch05`）。
4. **シナリオ内 BGM `Hollow Underfloor.mp3` を直指定**しているシナリオがあるが（key 化されていない）、ファイルは存在する（OK）。
5. **bgm 直指定で `緋色のあかり` のように key が日本語まま**: bgm_map.json に登録があるためマップヒットするが、ローカル fonts/エンコード問題のリスクあり。
6. **TitleScene の BGM**: コード上 `BgmManager.stop()` を呼んだ直後に独自 `new Audio('妖精の小径.mp3')` を生成しており、`BgmManager` を経由しない（destroy 時に手動停止）。BGM 一元管理の方針と若干食い違う。
7. **ch04_stage03 の `timeLimitSec: 480`**: 他の章末ステージ（55〜120）に比べて極端に大きい。テスト用の置き忘れに見える可能性。
8. **`ch04_stage03` の `targetPairs: 36`** で `boardWidth*Height = 100`、生成時に 72 枚以上配置されるが、追加で +12 タイル爆弾変換が起きる構造。難易度のバランスは要検証。
9. **未参照 / 孤立シナリオファイル**: `ch02_s03_puzzle.json`, `ch01_s03_pre_end.json`, `chXX_s04_pre.json` / `chXX_s05_pre.json` / `chXX_s06_pre.json` 等、ステージ JSON から参照されていないものが多い（A/B 分岐や旧版の残骸と推測）。
10. **ステージ JSON にない preScenario の参照ファイル**: 各 `_post.json` は SceneManager が `postScenario` を読み込むだけなので OK だが、`ch01_s04_pre.json` のようにステージ ID（s04 以降）がそもそも存在しない章もある。
11. **`linked` / `shadow` / `paired` タイル型は型定義のみ、データには未使用**。PuzzleEngine / PuzzleScene には実装が一部入っているが、まだ実戦投入されていない。
12. **`ScenarioStep` の `se` step**: `playSe` は内部生成器マップ（`se_glass_shatter` のみ登録）。シナリオが他の SE 名を指定しても無音化する。`playSeFile` への切替えがない。
13. **`SoundEngine.playTimeLow` は実装済みだが呼び出し箇所が無い**: 残 10 秒のチクタク音は描画上の警告クラスのみで音は鳴らない。
14. **`ResultScene` がチャプター最終 `chXX_final_flashback` を 1〜4 章でしか挟まない**: ch05_stage07 だけ別経路（`ch05_final_flashback → epilogue_true → EndRoll`）。ch02_stage03 / ch03_stage03 / ch04_stage03 の `postScenario`（`chXX_end.json`）はクリア直後に再生される一方、`final_flashback` はリザルト後に再生されるため、章末は「post → result → final_flashback → 次章」と 2 段重ねの構造。意図的ならよいが整理余地あり。
15. **`ProgressStore` のチャプター進行状態が `localStorage` に保存されない**: `SaveStore.currentChapter` は存在するが、`SceneManager` 側で更新するコードが見当たらない（`setCurrentChapter` の呼出しなし）。タイトル CONTINUE は `stageRecords` の未クリア検索で代用しているが、`hasSave` の判定で `currentChapter > 0` を見ているのは死コード気味。
16. **`ScenarioPlayer.destroy()` の resize リスナー解除が無効**: `addEventListener('resize', () => this.resizeCanvas())` と `removeEventListener('resize', () => this.resizeCanvas())` で別関数オブジェクトを使っているため、実際にはリスナーが残る。シーン破棄後も `resizeCanvas()` が呼ばれ続けるリーク。
17. **`BgmManager.play` の同一ファイル判定**: `currentKey === filename` だが key 解決前の `keyOrFile` が key 名のとき、初回再生では `filename` で記録され 2 回目以降は一致するため OK。ただし `play(file)` と `play(key)` 混在で同じ実体を再起動する可能性は残る。
18. **`TimerSystem.onTick`**: リスナー登録時に「running または tickInterval !== null」のとき即時通知するが、`pause()` 直後（`running=false`/`tickInterval !=null`）に登録すると意図せず通知される。HUD 初期化タイミング次第で不自然な値が一瞬出る恐れ。
19. **チュートリアル `force_match`**: `allowedCells` を満たすクリックでも `engine.onCellClick` がマッチ不成立の場合、`miss` 扱いとなりタイマー減算が発生する。チュートリアルでは想定外。
20. **`PuzzleEngine.handleLinkedChainRemoval` の時間ボーナス**: コメント上「グループ内 time タイルを考慮」と書かれているが実コードは常に `bonusSec=0`。未実装。
21. **`StageValidator.hasSolution` を 24 枚以下のみ呼ぶ**: 自動生成ステージは大半 24 枚を超えるため事実上未検証。生成アルゴリズム自体で詰みを避けるロジック（コリドークリア保証ペア配置法）に依存している。
22. **BAD ルート**: `route_bad` フラグ判定はパズル起動直前のみ。preScenario 中で立てる必要があるが、該当シナリオ（`ch05_route_BAD.json`）はステージから参照されていないため、現状ゲーム本編からは到達できない可能性が高い。
23. **`mountResultScene` 内 EndRollScene 型キャスト**: `as unknown as NovelScene` でキャストしており、`ManagedScene` インターフェース化が望ましい。
24. **`shuffle()` の再シャッフル**: 5 回失敗時はそのまま続行され詰みが残る（プレイヤーは強制ゲームオーバーまで待つ）。救済として残時間オフセットなどがない。
25. **`SE` の `playSeFile` が `import.meta.env.BASE_URL` の取得を冗長に if 分岐**: ScenarioPlayer / TitleScene と統一されておらず、ビルド設定依存。
26. **`StageGenerator` の生成色**: `colors` 未指定時は `DEFAULT_COLORS=5色`。各章の難易度上昇は色数増ではなくサイズと氷/爆弾比率で表現されているが、stage JSON で `colors` を 6 色まで増やしているのは ch04_stage03 のみ。
