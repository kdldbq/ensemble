ALTER TABLE mutations ENABLE ROW LEVEL SECURITY;
ALTER TABLE mutations FORCE ROW LEVEL SECURITY;

CREATE POLICY mutations_tenant_isolation ON mutations
  USING (workbook_id IN (SELECT id FROM workbooks WHERE tenant_id::text = current_setting('app.tenant_id', true)))
  WITH CHECK (workbook_id IN (SELECT id FROM workbooks WHERE tenant_id::text = current_setting('app.tenant_id', true)));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    GRANT SELECT, INSERT ON mutations TO app_user;
    GRANT USAGE ON SEQUENCE mutations_id_seq TO app_user;
  END IF;
END $$;
