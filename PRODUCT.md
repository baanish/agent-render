# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Developers and AI-agent users who need to share generated markdown, code, diffs, CSV, or JSON in chat surfaces that do not render those artifacts well.

## Product Purpose

agent-render turns an artifact into a readable, shareable browser view without requiring the core static deployment to store it. Success means a user can create a link locally, open it across chat surfaces, inspect the artifact, and copy or download it without changing the underlying content.

## Positioning

Artifact payloads travel in the URL fragment and decode in the browser, so the static host does not receive artifact content in the initial page request. The product is open source, statically hostable, and self-hostable.

## Operating Context

Users create fragment links in the browser, paste them into chat or documentation, and open them in a viewer-first shell. Links can still surface in browser history, copied messages, screenshots, extensions, and other client-side contexts.

## Capabilities and Constraints

- The core app is a static-export-friendly client shell with no required backend, database, or authentication.
- Supported artifacts are markdown, code, diff, CSV, and JSON.
- Payload codecs and fragment formats are a public compatibility contract and must remain backward-decodable.
- Renderer modules, codec modules, sample data, and heavy dependencies stay dynamically loaded to protect the initial bundle.
- Payloads are untrusted input; markdown sanitization, size validation, and clear failure states are required.
- The optional self-hosted UUID mode stores payloads server-side and is a separate deployment contract.

## Brand Commitments

The product name is `agent-render`. Product claims must describe zero retention at the static-host boundary precisely, never absolute secrecy. The replacement interface follows the owner-specified “Bench Instrument x Carbon Transfer” world.

## Evidence on Hand

The shipped product contract and current behavior are documented in `AGENTS.md`, `README.md`, `docs/architecture.md`, `docs/payload-format.md`, and the implementation under `src/`.

## Product Principles

- Keep artifact sharing static, linkable, and locally generated.
- Put the artifact and the user’s operation ahead of marketing copy.
- Preserve protocol compatibility and renderer behavior across visual changes.
- State the host-retention boundary honestly and keep unsafe assumptions visible.
- Prefer compact, readable controls that work across desktop and mobile chat workflows.
