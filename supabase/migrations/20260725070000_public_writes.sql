-- Revert to public write access
DROP POLICY IF EXISTS "insert_own_scenarios" ON planner_scenarios;
DROP POLICY IF EXISTS "update_own_scenarios" ON planner_scenarios;
DROP POLICY IF EXISTS "delete_own_scenarios" ON planner_scenarios;

CREATE POLICY "anon_insert_scenarios" ON planner_scenarios FOR INSERT
  TO anon, authenticated WITH CHECK (true);

CREATE POLICY "anon_update_scenarios" ON planner_scenarios FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "anon_delete_scenarios" ON planner_scenarios FOR DELETE
  TO anon, authenticated USING (true);
