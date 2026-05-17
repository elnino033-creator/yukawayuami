"""Thin wrapper around AnthropicVertex for offline Workbench use.

Authentication uses Google Application Default Credentials (ADC). On Vertex AI
Workbench instances ADC is provided by the attached service account, so no
additional credentials need to be supplied.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any, Iterable, Iterator

from anthropic import AnthropicVertex

DEFAULT_MODEL = "claude-sonnet-4-5@20250929"
DEFAULT_REGION = "us-east5"
DEFAULT_MAX_TOKENS = 1024


@dataclass
class ClaudeVertexConfig:
    project_id: str
    region: str = DEFAULT_REGION
    model: str = DEFAULT_MODEL
    max_tokens: int = DEFAULT_MAX_TOKENS


class ClaudeVertexClient:
    """Wrapper that defaults project/region from env vars and exposes
    a simple `send` / `stream` API on top of AnthropicVertex.

    Environment variables read when arguments are omitted:
        ANTHROPIC_VERTEX_PROJECT_ID  - GCP project id
        CLOUD_ML_REGION              - Vertex region (e.g. us-east5)
        CLAUDE_VERTEX_MODEL          - default model id
    """

    def __init__(
        self,
        project_id: str | None = None,
        region: str | None = None,
        model: str | None = None,
        max_tokens: int = DEFAULT_MAX_TOKENS,
    ) -> None:
        project_id = project_id or os.environ.get("ANTHROPIC_VERTEX_PROJECT_ID")
        if not project_id:
            raise ValueError(
                "GCP project id is required. Pass project_id=... or set "
                "ANTHROPIC_VERTEX_PROJECT_ID."
            )
        self.config = ClaudeVertexConfig(
            project_id=project_id,
            region=region or os.environ.get("CLOUD_ML_REGION", DEFAULT_REGION),
            model=model or os.environ.get("CLAUDE_VERTEX_MODEL", DEFAULT_MODEL),
            max_tokens=max_tokens,
        )
        self._client = AnthropicVertex(
            project_id=self.config.project_id,
            region=self.config.region,
        )

    def send(
        self,
        prompt: str | Iterable[dict[str, Any]],
        *,
        system: str | None = None,
        model: str | None = None,
        max_tokens: int | None = None,
        **kwargs: Any,
    ) -> str:
        """Send a single message and return the assistant text reply."""
        messages = self._normalize(prompt)
        params: dict[str, Any] = {
            "model": model or self.config.model,
            "max_tokens": max_tokens or self.config.max_tokens,
            "messages": messages,
        }
        if system is not None:
            params["system"] = system
        params.update(kwargs)
        response = self._client.messages.create(**params)
        return "".join(
            block.text for block in response.content if getattr(block, "type", None) == "text"
        )

    def stream(
        self,
        prompt: str | Iterable[dict[str, Any]],
        *,
        system: str | None = None,
        model: str | None = None,
        max_tokens: int | None = None,
        **kwargs: Any,
    ) -> Iterator[str]:
        """Stream the assistant reply as text deltas."""
        messages = self._normalize(prompt)
        params: dict[str, Any] = {
            "model": model or self.config.model,
            "max_tokens": max_tokens or self.config.max_tokens,
            "messages": messages,
        }
        if system is not None:
            params["system"] = system
        params.update(kwargs)
        with self._client.messages.stream(**params) as stream:
            for text in stream.text_stream:
                yield text

    @staticmethod
    def _normalize(prompt: str | Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
        if isinstance(prompt, str):
            return [{"role": "user", "content": prompt}]
        return list(prompt)


def send_message(
    prompt: str,
    *,
    project_id: str | None = None,
    region: str | None = None,
    model: str | None = None,
    system: str | None = None,
    max_tokens: int = DEFAULT_MAX_TOKENS,
) -> str:
    """One-shot convenience wrapper."""
    client = ClaudeVertexClient(
        project_id=project_id, region=region, model=model, max_tokens=max_tokens
    )
    return client.send(prompt, system=system)
