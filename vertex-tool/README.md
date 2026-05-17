# claude-vertex-tool

Vertex AI Workbench (外部通信不可) で Claude を利用するためのオフライン配布キット。
依存ライブラリの wheel を同梱し、エアギャップ環境でも `pip install --no-index` で
セットアップできる CLI + Python ライブラリを提供します。

- **対象環境**: Vertex AI Workbench / Linux x86_64 / Python 3.10
- **同梱**: `anthropic[vertex]` 0.100.0 とその依存（`google-auth` 含む）の wheel 一式
- **認証**: Workbench のサービスアカウント (Application Default Credentials)
- **モデル**: Vertex AI Model Garden で有効化済みの Claude（既定 `claude-sonnet-4-5@20250929`、リージョン `us-east5`）

---

## 1. ディレクトリ構成

```
.
├── claude_vertex_tool/        # 本体パッケージ (CLI + ラッパー)
│   ├── __init__.py
│   ├── client.py              # ClaudeVertexClient
│   └── cli.py                 # `claude-vertex` コマンド
├── wheels/                    # 同梱 wheel (依存 + 本体)
├── scripts/
│   ├── install.sh             # オフライン側で実行する導入スクリプト
│   ├── download_wheels.sh     # オンライン側で wheel を再取得
│   └── verify.sh              # venv 内で動作確認
├── examples/
│   ├── quickstart.py
│   ├── streaming.py
│   └── notebook_quickstart.ipynb
├── pyproject.toml
└── requirements.txt
```

## 2. 持ち込みフロー

### A. オンライン端末（社内ネット可など）
1. このリポジトリを clone
2. wheel が古い・別バージョンを使いたい場合のみ再取得：
   ```bash
   ./scripts/download_wheels.sh
   ```
   既定: Python 3.10 / `manylinux2014_x86_64`。
   変更したい場合は環境変数で：
   ```bash
   PYTHON_VERSION=3.11 PLATFORM=manylinux2014_x86_64 ./scripts/download_wheels.sh
   ```
3. リポジトリ全体（`wheels/` 込み）を zip 化して持込：
   ```bash
   zip -r claude-vertex-bundle.zip . -x ".git/*"
   ```

### B. Vertex AI Workbench（オフライン）
1. zip を Workbench に転送して展開
2. オフラインインストール：
   ```bash
   cd claude-vertex-bundle
   ./scripts/install.sh
   ```
   `pip install --no-index --find-links ./wheels claude-vertex-tool` を実行します。
3. Workbench 既定の Python に入れたくない場合は事前に venv を作って `PYTHON_BIN` を渡します：
   ```bash
   python3 -m venv ~/venvs/claude && source ~/venvs/claude/bin/activate
   PYTHON_BIN=$(which python) ./scripts/install.sh
   ```

## 3. 利用方法

### 環境変数
| 変数 | 必須 | 説明 |
| --- | --- | --- |
| `ANTHROPIC_VERTEX_PROJECT_ID` | ○ | GCP プロジェクト ID |
| `CLOUD_ML_REGION` | - | Vertex リージョン (既定 `us-east5`) |
| `CLAUDE_VERTEX_MODEL` | - | 既定モデル ID |

> Workbench のサービスアカウントに `roles/aiplatform.user` と、Model Garden 上で
> 該当 Claude モデルの利用申請/有効化が必要です。

### CLI
```bash
export ANTHROPIC_VERTEX_PROJECT_ID="your-gcp-project"
export CLOUD_ML_REGION="us-east5"

claude-vertex "日本語で1文だけ自己紹介して"
echo "要約して: ..." | claude-vertex -
claude-vertex --system "簡潔に" --stream "Vertex AI とは？"
claude-vertex --model claude-sonnet-4-5@20250929 --max-tokens 2048 "..."
```

### Python / Notebook
```python
from claude_vertex_tool import ClaudeVertexClient

client = ClaudeVertexClient()  # 環境変数から project / region を取得
print(client.send("hello"))

# システムプロンプト + メッセージ配列
messages = [{"role": "user", "content": "Vertex AI の利点を3つ"}]
print(client.send(messages, system="Reply in Japanese."))

# ストリーミング
for chunk in client.stream("段階的に説明して"):
    print(chunk, end="", flush=True)
```

## 4. 動作確認

オフライン側で:
```bash
./scripts/verify.sh    # venv に入れ直して import + --help を確認
claude-vertex "ping"   # 実 API 呼び出し（プロジェクト/モデル要設定）
```

## 5. アップデート手順

1. オンライン端末で `requirements.txt` のバージョンを更新
2. `wheels/` を一旦削除し `./scripts/download_wheels.sh` を再実行
3. 新しい zip を作って持込 → `./scripts/install.sh` で上書きインストール

## 6. トラブルシューティング

| 症状 | 対処 |
| --- | --- |
| `google.auth.exceptions.DefaultCredentialsError` | Workbench のサービスアカウント設定、または `gcloud auth application-default login` を確認 |
| `404 Publisher Model ... was not found` | リージョンとモデル ID の組み合わせ、Model Garden の有効化状況を確認 |
| `pip` が wheel を解決できない | Python バージョン/プラットフォームが一致するか確認。必要なら `download_wheels.sh` を該当環境向けに再実行 |
| プロキシ越しに導入したい | `pip install --no-index` を使うため通常はプロキシ不要。社内 PyPI を使う場合は `--no-index --find-links` を `--index-url` に置き換え |

## 7. ライセンス
MIT (本ラッパー部分)。同梱 wheel はそれぞれの元プロジェクトのライセンスに従います。
