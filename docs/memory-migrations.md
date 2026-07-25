# Memory Migrations

Root Memory has an explicit `schemaVersion`, `migration` metadata, and bounded incremental migration execution. Migrations are registered with monotonically increasing versions and run in order.

Migration contract:

- Migrations must be idempotent.
- Migrations must add fields before removing old forms.
- The initial harness migration is non-destructive.
- Runtime code should support old and new schema forms during rollout.
- Large migrations should consume a bounded budget per tick and resume later.
- Failures record the failed version and message without advancing `schemaVersion`.

Use expand-and-contract:

1. Add new fields and deploy code that understands both shapes.
2. Migrate incrementally and observe runtime health.
3. Remove obsolete fields only in a later release after the new shape has been stable in production.
