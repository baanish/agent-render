# Security Policy

`agent-render` treats artifact payloads as untrusted input. The default static viewer keeps artifact contents in the URL fragment so the host does not receive the payload during the initial page request, but shared links can still appear in browser history, copied URLs, screenshots, logs from browser extensions, or any client-side telemetry added by a deployer.

## Supported Versions

Security fixes are accepted for the current `main` branch and the latest tagged release.

| Version | Supported |
| --- | --- |
| 0.1.x | Yes |

## Reporting a Vulnerability

Please report suspected vulnerabilities through GitHub private vulnerability reporting:

<https://github.com/baanish/agent-render/security/advisories/new>

If private reporting is unavailable, open a minimal public issue that describes the affected surface without including exploit payloads or private artifact data:

<https://github.com/baanish/agent-render/issues/new>

Useful reports include:

- The affected renderer, codec, or payload path.
- A small sanitized reproduction payload or link.
- The expected impact, such as script execution, payload disclosure, denial of service, or unsafe parsing.
- Browser and deployment details when the behavior depends on runtime environment.

## Security Boundaries

- The static fragment-based viewer is zero-retention by host design, not a general-purpose secret manager.
- The optional self-hosted UUID mode stores payloads server-side and must be protected according to the deployment operator's needs.
- Markdown rendering must remain sanitized; raw HTML support requires explicit security review before shipping.
- Renderer and codec changes should fail clearly on malformed or oversized payloads before mounting expensive UI paths when possible.
