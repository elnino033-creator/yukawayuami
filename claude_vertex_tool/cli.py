"""Command-line entry point for claude-vertex.

Usage:
    claude-vertex "your prompt"
    echo "your prompt" | claude-vertex -
    claude-vertex --system "you are concise" --stream "explain X"
    claude-vertex --project my-proj --region us-east5 --model claude-sonnet-4-5@20250929 "hi"
"""
from __future__ import annotations

import argparse
import sys

from .client import DEFAULT_MAX_TOKENS, DEFAULT_MODEL, DEFAULT_REGION, ClaudeVertexClient


def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="claude-vertex",
        description="Send a prompt to Claude on Vertex AI (offline-installable).",
    )
    p.add_argument(
        "prompt",
        nargs="?",
        help="Prompt text. Use '-' to read from stdin. Omit to read stdin.",
    )
    p.add_argument("--project", help="GCP project id (or env ANTHROPIC_VERTEX_PROJECT_ID)")
    p.add_argument("--region", default=None, help=f"Vertex region (default {DEFAULT_REGION})")
    p.add_argument("--model", default=None, help=f"Model id (default {DEFAULT_MODEL})")
    p.add_argument("--system", default=None, help="System prompt")
    p.add_argument(
        "--max-tokens", type=int, default=DEFAULT_MAX_TOKENS, help="Max output tokens"
    )
    p.add_argument("--stream", action="store_true", help="Stream output as it arrives")
    return p


def _read_prompt(arg: str | None) -> str:
    if arg is None or arg == "-":
        return sys.stdin.read()
    return arg


def main(argv: list[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
    prompt = _read_prompt(args.prompt).strip()
    if not prompt:
        print("error: empty prompt", file=sys.stderr)
        return 2
    try:
        client = ClaudeVertexClient(
            project_id=args.project,
            region=args.region,
            model=args.model,
            max_tokens=args.max_tokens,
        )
        if args.stream:
            for chunk in client.stream(prompt, system=args.system):
                sys.stdout.write(chunk)
                sys.stdout.flush()
            sys.stdout.write("\n")
        else:
            print(client.send(prompt, system=args.system))
    except Exception as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
