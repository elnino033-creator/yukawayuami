"""Minimal example: send one prompt to Claude on Vertex AI.

Prereqs (on Workbench):
    export ANTHROPIC_VERTEX_PROJECT_ID="your-gcp-project"
    export CLOUD_ML_REGION="us-east5"   # or any region where the model is enabled
"""
from claude_vertex_tool import ClaudeVertexClient


def main() -> None:
    client = ClaudeVertexClient()
    reply = client.send(
        "日本語で1文だけ自己紹介してください。",
        system="You are a friendly assistant. Reply in Japanese.",
    )
    print(reply)


if __name__ == "__main__":
    main()
