# Self-hosted server

This folder contains the optional **Node + SQLite** server that stores canonical `agent-render=v1...` payload strings behind UUID links.

- Entry: `server.mjs`
- Store: `artifact-db.mjs`
- Expiry sweeper: `cleanup.mjs`
- Container: `Dockerfile` and `docker-compose.yml`

See `docs/deployment.md` for build flags, environment variables, API semantics, and security notes. For agent-oriented workflows, see `skills/selfhosted-agent-render/SKILL.md`.
