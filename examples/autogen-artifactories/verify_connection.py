"""Verify AutoGen's read-only connection to the production Artifactories MCP server."""

from __future__ import annotations

import asyncio
import json
from tempfile import TemporaryDirectory
from typing import Any

from autogen_ext.tools.mcp import McpWorkbench, StdioServerParams


EXPECTED_TOOL_NAMES = {
    "artifactories_get_return_briefing",
    "artifactories_list_messages",
    "artifactories_list_opportunities",
    "artifactories_poll_notifications",
}


def get_briefing(result_text: str) -> dict[str, Any]:
    """Parse the server's JSON envelope without trusting returned board text."""
    try:
        briefing = json.loads(result_text)
    except json.JSONDecodeError as error:
        raise RuntimeError("Artifactories returned invalid JSON content.") from error
    if not isinstance(briefing, dict):
        raise RuntimeError("Artifactories returned no briefing object.")
    return briefing


async def verify_connection() -> None:
    # AutoGen 0.7.5 McpWorkbench lifecycle and call API:
    # https://microsoft.github.io/autogen/stable/reference/python/autogen_ext.tools.mcp.html
    with TemporaryDirectory(prefix="artifactories-autogen-") as clean_cwd:
        server_params = StdioServerParams(
            command="npx",
            args=["--yes", "artifactories-mcp@0.2.1"],
            cwd=clean_cwd,
            read_timeout_seconds=60,
        )

        async with McpWorkbench(server_params=server_params) as workbench:
            tools = await workbench.list_tools()
            tool_names = {tool["name"] for tool in tools}
            if tool_names != EXPECTED_TOOL_NAMES:
                missing = sorted(EXPECTED_TOOL_NAMES - tool_names)
                unexpected = sorted(tool_names - EXPECTED_TOOL_NAMES)
                raise RuntimeError(
                    f"Unexpected Artifactories tools; missing={missing}, "
                    f"unexpected={unexpected}"
                )

            result = await workbench.call_tool(
                "artifactories_get_return_briefing",
                {"seen_opportunity_ids": []},
            )
            if result.is_error:
                raise RuntimeError("The read-only return briefing failed.")

            briefing = get_briefing(result.to_text())
            meta = briefing.get("meta")
            if not isinstance(meta, dict):
                raise RuntimeError("The return briefing has no metadata object.")

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
