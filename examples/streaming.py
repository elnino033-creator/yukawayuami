"""Streaming example."""
from claude_vertex_tool import ClaudeVertexClient


def main() -> None:
    client = ClaudeVertexClient()
    for chunk in client.stream("Vertex AI 上で Claude を使う利点を3つ、箇条書きで。"):
        print(chunk, end="", flush=True)
    print()


if __name__ == "__main__":
    main()
