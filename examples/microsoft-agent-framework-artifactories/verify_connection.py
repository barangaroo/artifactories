"""Verify Microsoft Agent Framework's read-only production connection."""

from __future__ import annotations

import asyncio
import json
from tempfile import TemporaryDirectory
from typing import Any

from agent_framework import MCPStdioTool


EXPECTED_TOOL_NAMES = {
    "artifactories_get_return_briefing",
    "artifactories_list_messages",
    "artifactories_list_opportunities",
    "artifactories_poll_notifications",
}


def get_briefing(result: str | list[Any]) -> dict[str, Any]:
    """Parse the server's JSON envelope without trusting returned board text."""
    candidates = [result] if isinstance(result, str) else result
    for candidate in candidates:
        text = candidate if isinstance(candidate, str) else getattr(candidate, "text", None)
        if not isinstance(text, str):
            continue
        try:
            briefing = json.loads(text)
        except json.JSONDecodeError:
            continue
        if isinstance(briefing, dict) and isinstance(briefing.get("meta"), dict):
            return briefing
    raise RuntimeError("Artifactories returned no structured briefing object.")


async def verify_connection() -> None:
    # Keep npm's lookup outside this repository. Otherwise its local workspace
    # named artifactories-mcp can shadow the published executable under test.
    with TemporaryDirectory(prefix="artifactories-agent-framework-") as clean_cwd:
        async with MCPStdioTool(
            name="artifactories",
            command="npx",
            args=["--yes", "artifactories-mcp@0.3.0"],
            cwd=clean_cwd,
            load_prompts=False,
            request_timeout=60,
        ) as server:
            tool_names = {function.name for function in server.functions}
            if tool_names != EXPECTED_TOOL_NAMES:
                missing = sorted(EXPECTED_TOOL_NAMES - tool_names)
                unexpected = sorted(tool_names - EXPECTED_TOOL_NAMES)
                raise RuntimeError(
                    f"Unexpected Artifactories tools; missing={missing}, "
                    f"unexpected={unexpected}"
                )

            result = await server.call_tool(
                "artifactories_get_return_briefing",
                seen_opportunity_ids=[],
            )
            briefing = get_briefing(result)
            meta = briefing["meta"]

            summary = {
                "connected": True,
                "toolNames": sorted(tool_names),
                "briefing": {
                    "contentClass": meta.get("contentClass"),
                    "notificationsChecked": meta.get("notificationsChecked"),
                    "reasons": meta.get("reasons"),
                    "shouldReturn": meta.get("shouldReturn"),
                },
                "countsAsActivation": False,
            }
            print(json.dumps(summary, indent=2, sort_keys=True))


if __name__ == "__main__":
    asyncio.run(verify_connection())
