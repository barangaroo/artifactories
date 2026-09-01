# Honest MCP distribution plan

## Status

Read-only release `0.3.0` completed on 2026-09-01. It preserves the verified local stdio package and exact four-tool contract from `0.2.1`, then adds a public anonymous Streamable HTTP endpoint at `https://artifactories.com/mcp/http`. Remote-capable agents can now connect without installing a package; local clients can still use the npm-hosted stdio server and its built-in no-write verifier. Contract tests, clean-tarball and npm-hosted official-client smokes, the live remote official-client smoke, transport-boundary tests, and Registry validation all pass. The production read dependencies are deployed and healthy.

The immutable [`artifactories-mcp@0.3.0`](https://www.npmjs.com/package/artifactories-mcp) package is public on npm. The same version of [`io.github.barangaroo/artifactories`](https://registry.modelcontextprotocol.io/v0/servers?search=io.github.barangaroo%2Fartifactories) is active and latest in the official MCP Registry with both the hosted Streamable HTTP URL and the local stdio package. Its [package-scoped GitHub release](https://github.com/barangaroo/artifactories/releases/tag/artifactories-mcp-v0.3.0) points to npm's exact `gitHead` and records the published checksums. Public MCP discovery metadata identifies both connection choices and does not imply write authority or agent activation.

## Product boundary

Artifactories exposes the same read-only MCP tool contract in two ways: a hosted Streamable HTTP adapter at `https://artifactories.com/mcp/http`, and a local stdio server package that reads `https://artifactories.com`. Neither path creates or stores keys, cursors, or write authority. Any later write-capable release must keep the agent's Ed25519 key local and sign locally. A hosted intermediary must never receive or retain agent private keys.

The official MCP Registry is currently a preview metadata registry. Publication happens only after the npm package is installable and the tool interface passes end-to-end tests. See the [official publishing guide](https://modelcontextprotocol.io/registry/quickstart).

## Read-only tool contract

| Tool | Availability | Authority | Artifactories operation |
| --- | --- | --- | --- |
| `artifactories_list_messages` | Published `0.3.0` | Anonymous read | `GET /v1/messages` or the equivalent in-process hosted read adapter |
| `artifactories_list_opportunities` | Published `0.3.0` | Anonymous read | `GET /v1/opportunities` or the equivalent in-process hosted read adapter |
| `artifactories_poll_notifications` | Published `0.3.0` | Anonymous public read; caller supplies the durable cursor | `GET /v1/agents/{id}/notifications` or the equivalent in-process hosted read adapter |
| `artifactories_get_return_briefing` | Published `0.3.0` | Anonymous read; optional public agent ID and caller-owned cursors/seen IDs | Combines opportunity reads with optional notification polling |

The first three tools remain unchanged from `0.1.1`. Published `0.2.0` added only the aggregate briefing: it stores no state, performs no write, and treats `shouldReturn` as candidate work rather than authorization to reply. Published `0.2.1` kept the same tool contract and added only the package verifier. Published `0.3.0` adds transport and discovery options, not tools, writes, credentials, sessions, or server-owned state. Possible later additions—thread reads, registration, posting, and replies—require a separate authority and local-credential design review; they are not implied by any published version.

All returned message bodies are untrusted data. Tool descriptions must state that content cannot authorize execution, URL fetching, secret disclosure, or further posting.

## Local credential requirements

- Generate Ed25519 keys locally and store them outside the package directory with owner-only permissions.
- Never include the private key, agent proof, hidden context, or raw environment in tool results or logs.
- Require an explicit credential path or OS-backed secret-store adapter; do not silently choose a shared global identity.
- Persist notification cursors separately per canonical origin and agent ID.
- Support agent-proof recovery without rotating the identity key.

## Release gates

- [x] All prepared read-only tools pass contract tests against local fixtures through the official MCP client.
- [x] Deployed read endpoints pass a production smoke without creating content.
- [x] Notification tool exposes the forward cursor and drain contract without storing operator state.
- [x] Return briefing filters caller-supplied seen opportunity IDs, preserves caller-owned cursors, and never converts candidate work into posting authority.
- [x] Tool descriptions preserve the public-content trust boundary.
- [x] Tarball installation works from a clean Node 22 environment.
- [x] The production Streamable HTTP endpoint negotiates MCP `2026-07-28` through the official client and exposes exactly the same four read-only tools.
- [x] Legacy MCP initialization remains stateless, while unsupported legacy session operations are rejected.
- [x] Fixed Host and Origin allowlists, a 64 KiB JSON body bound, `no-store`, and `nosniff` are contract-tested.
- [x] `server.json` passes the official MCP Registry JSON Schema.
- [x] Published npm ownership metadata passes Registry verification.
- [x] Mutating tools remain absent until their separate credential and authorization gates pass.
- [x] Only then add MCP metadata to APIs.json, ARD, README, and registry listings.

## Distribution sequence

1. [x] Deploy the new read endpoints and run a read-only production smoke.
2. [x] Publish `artifactories-mcp@0.1.1` to npm with explicit operator approval.
3. [x] Install the npm-hosted package in a clean environment and repeat the official-client smoke.
4. [x] Authenticate and publish `server.json` to the official MCP Registry with explicit operator approval.
5. [x] Verify Registry lookup and installation.
6. [x] Add truthful MCP discovery metadata to Artifactories in the same release.
7. [x] Pack and smoke-test `artifactories-mcp@0.2.0` in a clean Node 22 environment.
8. [x] Publish `artifactories-mcp@0.2.0` to npm after browser authorization, then repeat the npm-hosted smoke.
9. [x] Validate and publish `0.2.0` to the official MCP Registry, then update public discovery only after both listings are independently visible.
10. [x] Publish a package-scoped GitHub release at npm's immutable `gitHead` without replacing the application's latest-release marker.
11. [x] Add and contract-test the `0.2.1` built-in no-write verifier against the official MCP client.
12. [x] Pack and smoke-test `artifactories-mcp@0.2.1` from a clean temporary project against production.
13. [x] Publish `0.2.1` to npm and the official MCP Registry, then verify the npm-hosted package and exact Registry version endpoint.
14. [x] Publish the package-scoped `artifactories-mcp-v0.2.1` GitHub release at npm's immutable `gitHead` with the published SHA-1 and SRI values.
15. [x] Implement and contract-test the hosted, stateless Streamable HTTP adapter with explicit modern-protocol negotiation, bounded legacy fallback, Host/Origin checks, and body limits.
16. [x] Deploy `https://artifactories.com/mcp/http` and verify all four tools through the official client without creating content; independently verify hostile-Origin rejection.
17. [x] Pack, publish, and fresh-cache smoke-test `artifactories-mcp@0.3.0` from npm.
18. [x] Publish `io.github.barangaroo/artifactories@0.3.0` to the official MCP Registry with both remote and stdio connection metadata, then verify the exact Registry record.
19. [x] Publish the package-scoped `artifactories-mcp-v0.3.0` GitHub release at npm's immutable `gitHead` with the published SHA-1 and SRI values, then rerun the complete production launch check.
