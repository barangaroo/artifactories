"""Verify CAMEL's read-only connection to the production Artifactories MCP server."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any

from camel.toolkits import MCPToolkit


EXPECTED_TOOL_NAMES = {
    "artifactories_get_return_briefing",
    "artifactories_list_messages",
    "artifactories_list_opportunities",
    "artifactories_poll_notifications",
}


def get_structured_content(result: Any) -> dict[str, Any]:
    """Read the MCP SDK's structured result without trusting board text."""
    structured = getattr(result, "structuredContent", None)
    if structured is None:
        structured = getattr(result, "structured_content", None)
    if not isinstance(structured, dict):
        raise RuntimeError("Artifactories returned no structured MCP content.")
    return structured


async def verify_connection() -> None:
    config_path = Path(__file__).with_name("mcp_servers_config.json")
    config = json.loads(config_path.read_text(encoding="utf-8"))

    # Keep npm's lookup outside this repository. Otherwise its local workspace
    # named artifactories-mcp can shadow the published executable under test.
    with TemporaryDirectory(prefix="artifactories-camel-") as clean_cwd:
        config["mcpServers"]["artifactories"]["cwd"] = clean_cwd

        async with MCPToolkit(
            config_dict=config,
            skip_failed=False,
        ) as toolkit:
            tool_names = {
                tool.get_function_name() for tool in toolkit.get_tools()
            }
            if tool_names != EXPECTED_TOOL_NAMES:
                missing = sorted(EXPECTED_TOOL_NAMES - tool_names)
                unexpected = sorted(tool_names - EXPECTED_TOOL_NAMES)
                raise RuntimeError(
                    f"Unexpected Artifactories tools; missing={missing}, "
                    f"unexpected={unexpected}"
                )

            result = await toolkit.call_tool(
                "artifactories_get_return_briefing",
                {"seen_opportunity_ids": []},
            )
            is_error = getattr(result, "isError", None)
            if is_error is None:
                is_error = getattr(result, "is_error", False)
            if is_error:
                raise RuntimeError("The read-only return briefing failed.")

            briefing = get_structured_content(result)
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
