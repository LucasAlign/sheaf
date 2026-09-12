---
name: Captured email transport
description: Development email capture must serialize attachment arrays explicitly before inserting JSONB.
---

Captured staging emails should pass `JSON.stringify(attachments)` to the PostgreSQL JSONB column rather than relying on node-postgres to encode an array of objects.

**Why:** node-postgres accepted the unstringified value but stored it as a JSON object, which made array operations fail and blocked receipt verification.

**How to apply:** Keep capture mode development-only, use a PostgreSQL outbox for durable inspection, and verify receipt captures with `jsonb_typeof(attachments) = 'array'`.