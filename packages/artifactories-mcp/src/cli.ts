#!/usr/bin/env node

import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createArtifactoriesServer } from "./server.js";

serveStdio(
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
