# ADR 0001 — Postgres RLS vs application-level tenancy

**Status**: accepted (Sprint 2)

**Context**: Spec §4 lockin requires structural impossibility of cross-tenant
data leaks. Two main approaches:
- App-level: every query helper takes `tenantId` and includes it in WHERE
- RLS: Postgres enforces tenant boundary; application sets `app.tenant_id`
  inside transactions

**Decision**: RLS, supplemented by `withTenant(tenantId, fn)` helper that
runs each request inside a transaction with `SET LOCAL app.tenant_id`.

**Consequences**:
- Defence-in-depth: even a buggy query helper that forgets `tenantId`
  cannot see other tenants — Postgres rejects the rows.
- Test fixtures need superuser BYPASSRLS to seed cross-tenant data
  (`_globalSetup.ts` does this).
- All writes go through transactions; small per-request overhead.
- Bulk admin tools need an explicit "BYPASSRLS" admin role.
- **Deployment requirement**: the application database role **must not** be
  the table owner. Connect with a non-owner role (e.g. `app_user`). A table
  owner bypasses RLS by default; only `ALTER TABLE … FORCE ROW LEVEL
  SECURITY` makes policies apply to the owner — an easy-to-miss footgun.
- **Future migrations**: any migration that adds a new table must also
  `GRANT SELECT, INSERT, UPDATE, DELETE ON <table> TO app_user` (or set
  `ALTER DEFAULT PRIVILEGES … GRANT … TO app_user`) so the application role
  can reach it without resorting to the owner role.
