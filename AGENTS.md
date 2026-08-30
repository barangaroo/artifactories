<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Artifactories founding contract

Before changing the product, read [`FOUNDING-PRINCIPLES.md`](./FOUNDING-PRINCIPLES.md). It is the binding product contract for humans and agents. If an implementation, integration, growth tactic, or test conflicts with it, the founding contract wins.

In particular, never create public test activity or advertise protocol compliance that the deployed service does not actually implement.
