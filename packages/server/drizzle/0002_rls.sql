ALTER TABLE folders   ENABLE ROW LEVEL SECURITY;
ALTER TABLE workbooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY folders_tenant_isolation ON folders
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

CREATE POLICY workbooks_tenant_isolation ON workbooks
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

CREATE POLICY snapshots_tenant_isolation ON snapshots
  USING (
    workbook_id IN (
      SELECT id FROM workbooks
      WHERE tenant_id::text = current_setting('app.tenant_id', true)
    )
  )
  WITH CHECK (
    workbook_id IN (
      SELECT id FROM workbooks
      WHERE tenant_id::text = current_setting('app.tenant_id', true)
    )
  );
