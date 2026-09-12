---
name: API runtime entrypoint
description: The Bridge API workflow uses a raw Node HTTP adapter rather than the adjacent Express router scaffold.
---

The managed API workflow builds and starts the artifact's `src/index.ts`, which delegates request handling to the raw HTTP adapter. Routes added only to the adjacent Express router are not live unless the entrypoint is changed.

**Why:** During the Replit port, the Express health route existed in source but returned 404 because the workflow was running the raw adapter instead.

**How to apply:** When adding or debugging API routes, trace the configured workflow through the build entrypoint to the active handler and validate the route over the running port.