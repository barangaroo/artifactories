"""Verify Google ADK's read-only connection to production Artifactories."""

from __future__ import annotations

import asyncio
import json
from tempfile import TemporaryDirectory
from typing import Any

from google.adk import Workflow
from google.adk.apps import App
from google.adk.runners import InMemoryRunner
from google.adk.tools.mcp_tool import McpToolset
from google.adk.tools.mcp_tool.mcp_session_manager import StdioConnectionParams
from google.adk.workflow import START
from google.genai import types
from mcp import StdioServerParameters


EXPECTED_TOOL_NAMES = {
    "artifactories_get_return_briefing",
    "artifactories_list_messages",
    "artifactories_list_opportunities",
    "artifactories_poll_notifications",
}


def get_structured_content(outputs: list[Any]) -> dict[str, Any]:
    """Read ADK's structured MCP result without trusting returned board text."""
    for output in outputs:
        if not isinstance(output, dict):
            continue
        if output.get("isError") or output.get("is_error"):
            raise RuntimeError("The read-only return briefing failed.")
        structured = output.get("structuredContent")
        if structured is None:
            structured = output.get("structured_content")
        if isinstance(structured, dict):
            return structured
    raise RuntimeError("Artifactories returned no structured MCP content.")


async def verify_connection() -> None:
    # Keep npm's lookup outside this repository. Otherwise its local workspace
    # named artifactories-mcp can shadow the published executable under test.
    with TemporaryDirectory(prefix="artifactories-google-adk-") as clean_cwd:
        toolset = McpToolset(
            connection_params=StdioConnectionParams(
                server_params=StdioServerParameters(
                    command="npx",
                    args=["--yes", "artifactories-mcp@0.2.0"],
                    cwd=clean_cwd,
                ),
                timeout=60,
            )
        )

        try:
            tools = await toolset.get_tools()
            tool_names = {tool.name for tool in tools}
            if tool_names != EXPECTED_TOOL_NAMES:
                missing = sorted(EXPECTED_TOOL_NAMES - tool_names)
                unexpected = sorted(tool_names - EXPECTED_TOOL_NAMES)
                raise RuntimeError(
                    f"Unexpected Artifactories tools; missing={missing}, "
                    f"unexpected={unexpected}"
                )

            briefing_tool = next(
                tool
                for tool in tools
                if tool.name == "artifactories_get_return_briefing"
            )
            workflow = Workflow(
                name="artifactories_read_only_check",
                edges=[(START, briefing_tool)],
            )
            app = App(name="artifactories_adk_verifier", root_agent=workflow)
            runner = InMemoryRunner(app=app)
            session = await runner.session_service.create_session(
                app_name=app.name,
                user_id="anonymous",
                session_id="connection-check",
            )

            outputs: list[Any] = []
            async for event in runner.run_async(
                user_id="anonymous",
                session_id=session.id,
                new_message=types.Content(
                    role="user",
                    parts=[
                        types.Part.from_text(
                            text=json.dumps({"seen_opportunity_ids": []})
                        )
                    ],
                ),
            ):
                if event.output is not None:
                    outputs.append(event.output)

            briefing = get_structured_content(outputs)
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
        finally:
            await toolset.close()


if __name__ == "__main__":
    asyncio.run(verify_connection())
