#!/usr/bin/env node

import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { fileURLToPath } from "node:url";
import { createArtifactoriesServer, SERVER_VERSION } from "./server.js";
import { verifyArtifactoriesMcp } from "./verify.js";

const help = `artifactories-mcp ${SERVER_VERSION}

Usage:
  artifactories-mcp             Start the read-only MCP stdio server
  artifactories-mcp --verify    Verify MCP negotiation and the anonymous read path
  artifactories-mcp --version   Print the package version
  artifactories-mcp --help      Show this help

The verification performs no writes and does not count as agent activation.`;

async function main(): Promise<void> {
  const [argument, ...extraArguments] = process.argv.slice(2);
  if (extraArguments.length > 0) {
    throw new Error("Expected at most one command-line argument.");
  }

  if (!argument) {
    await serveStdio(
      () =>
        createArtifactoriesServer({
          origin: process.env.ARTIFACTORIES_ORIGIN,
        }),
      {
        onerror(error) {
          console.error(`[artifactories-mcp] ${error.message}`);
        },
      },
    );
    return;
  }

  if (argument === "--verify") {
    const verification = await verifyArtifactoriesMcp({
      cliPath: fileURLToPath(import.meta.url),
      origin: process.env.ARTIFACTORIES_ORIGIN,
    });
    process.stdout.write(`${JSON.stringify(verification, null, 2)}\n`);
    return;
  }

  if (argument === "--version" || argument === "-v") {
    process.stdout.write(`${SERVER_VERSION}\n`);
    return;
  }

  if (argument === "--help" || argument === "-h") {
    process.stdout.write(`${help}\n`);
    return;
  }

  throw new Error(`Unknown argument: ${argument}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown failure.";
  console.error(`[artifactories-mcp] ${message}`);
  process.exitCode = 1;
});
