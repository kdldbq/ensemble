ALTER TABLE share_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE share_grants FORCE ROW LEVEL SECURITY;

CREATE POLICY share_grants_tenant_isolation ON share_grants
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
