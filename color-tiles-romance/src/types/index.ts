/**
 * Color Tiles ゲームの型定義
 * 仕様書 §6.3 に準拠
 */

/** タイルの種類 */
export type TileType =
  | 'normal'  // 通常タイル
  | 'ice'     // 同色マッチ2回で消える（1回目はヒビ状態に変化）
  | 'time'    // 消去で +10秒
  | 'bomb'    // カウントダウンが0になると爆発し時間ペナルティ。消去すれば無効化
  | 'linked'  // 連結タイル（同色チェーン消去）※Phase 0では未実装、型のみ予約
  | 'shadow'  // 色マスク ※Phase 0では未実装
  | 'paired'  // ペア固定 ※Phase 0では未実装
  | 'block';  // 障害ブロック（消去対象外）

/** タイルの状態 */
export type TileState = 'normal' | 'cracked'; // crackedは氷タイル1回目マッチ後

/** タイル */
export interface Tile {
  /** 列インデックス */
  x: number;
  /** 行インデックス */
  y: number;
  /** タイルの色。block時は null */
  color: string | null;
  /** タイルの種類 */
  type: TileType;
  /** タイルの状態 */
  state: TileState;
  /** 爆弾タイルの残りカウントダウン秒数 */
  countdown?: number;
  /** ペア固定タイルの相方ID（typeが'paired'のときのみ意味を持つ） */
  pairId?: string;
  /** 連結タイルのグループID（typeが'linked'のときのみ意味を持つ） */
  linkGroupId?: string;
}

/** ステージのタイルレイアウトのセル */
export type LayoutCell =
  | null               // 空マス
  | string             // 色名のみ（通常タイル）
  | TileSpec;          // 詳細指定

/** タイルの詳細指定 */
export interface TileSpec {
  color: string | null;
  type?: TileType;
  pairId?: string;
  linkGroupId?: string;
}

/** ブロック解除ルール（仕様書 §6.4） */
export type BlockReleaseRule =
  | { type: 'afterPairs'; count: number }   // n ペア消去で全ブロック消滅
  | { type: 'afterTime'; sec: number }      // 開始 n 秒経過で消滅
  | { type: 'onLastTile' }                  // 最後の色付きタイル消去と同時
  | { type: 'never' };                      // 消滅しない（演出のみ）

/** 自動生成パラメータ（StageGeneratorに渡す） */
export interface StageGenerationParams {
  seed: number;
  targetPairs: number;
  colors?: string[];
  iceChance?: number;
  timeTileChance?: number;
  bombChance?: number;
  blockCount?: number;
  /** true のとき端点優先のdense戦略を使用し密度を70〜75%に引き上げる */
  dense?: boolean;
  /**
   * ブロック配置後に保証する最小アクティブクリックポイント数。
   * blockReleaseRule.count と同値にするとちょうど良い。省略時は blockCount と同値。
   */
  minFreePairs?: number;
}

/** ステージ内特殊イベント定義 */
export interface SpecialEventDef {
  /** トリガー条件 */
  trigger:
    | { type: 'afterPairs'; count: number }
    | { type: 'afterIceCleared'; count: number }
    | { type: 'whenIceRemaining'; count: number }
    | { type: 'whenBlocksHalfway' };
  /** 発動エフェクト */
  effect:
    | { type: 'transformToBomb'; count: number }
    | { type: 'addIceTiles'; count: number }
    | { type: 'restoreBlocks'; newReleaseCount?: number };
  /** カットイン演出 */
  cutIn?: {
    /** キャラクターID（assetsのフォルダ名） */
    character: string;
    /** 大きく表示するテキスト */
    text: string;
  };
}

/** チュートリアルステップ */
export interface TutorialStep {
  /** ステップ種別: 説明表示 / 強制操作 / 称賛 */
  type: 'explain' | 'force_match' | 'praise';
  /** 表示テキスト（\n で改行） */
  text: string;
  /** 話者名（ADV風ネームプレートで表示） */
  speaker?: string;
  /** ハイライトするタイルのセル座標 */
  highlightCells?: Array<{ x: number; y: number }>;
  /** force_match のみ：クリックを許可する空マス座標（それ以外はブロック） */
  allowedCells?: Array<{ x: number; y: number }>;
  /** praise のみ：指定 ms 後に自動進行 */
  autoAdvanceMs?: number;
}

/** ステージ定義 */
export interface StageDefinition {
  id: string;
  title: string;
  chapter: number;
  boardWidth: number;
  boardHeight: number;
  timeLimitSec: number;
  /** 誤クリック1回あたりのペナルティ秒数。0なら無効 */
  missPenaltySec: number;
  /** ヒント使用可能回数 */
  hintCount: number;
  /** 2次元タイルレイアウト [y][x]。generationParams がある場合は省略可 */
  tilesLayout?: LayoutCell[][];
  /** 自動生成パラメータ。tilesLayout の代わりに指定する */
  generationParams?: StageGenerationParams;
  /** 障害ブロック解除ルール */
  blockReleaseRule?: BlockReleaseRule;
  /** パズル前シナリオのJSONパス（public/data/scenarios/以下） */
  preScenario?: string;
  /** パズル後シナリオのJSONパス（public/data/scenarios/以下） */
  postScenario?: string;
  /** Sランククリア時に再生するご褒美シナリオのJSONパス（public/data/scenarios/以下） */
  rewardScenario?: string;
  /** チュートリアルステップ（指定時はガイド付きモードで進行） */
  tutorialSteps?: TutorialStep[];
  /** 爆弾タイルの初期カウントダウン秒数（省略時15秒） */
  bombCountdown?: number;
  /** 爆弾タイル爆発時のペナルティ秒数（省略時20秒） */
  bombPenaltySec?: number;
  /** パズル中に再生するBGMファイル名（省略時はデフォルトのpuzzle BGM） */
  puzzleBgm?: string;
  /** ステージ内特殊イベント（カットイン＋タイル変換など） */
  specialEvent?: SpecialEventDef;
}

/** クリック結果 */
export type ClickResult =
  | { type: 'success'; removed: Tile[]; bonusSec?: number }
  | { type: 'miss' }
  | { type: 'noop' }; // 障害ブロック上などのクリック

/** マッチ結果（LineCheckerが返す） */
export interface MatchResult {
  a: Tile;
  b: Tile;
  /** 結ぶ線の種類: 直線(H/V) または L字コーナー */
  direction: 'horizontal' | 'vertical' | 'corner';
}

/** ヒント結果 */
export interface HintResult {
  a: Tile;
  b: Tile;
  /** クリックすべき空マスの座標 */
  clickPoint: { x: number; y: number };
}
