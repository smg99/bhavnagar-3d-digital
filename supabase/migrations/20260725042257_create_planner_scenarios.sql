/*
# Planner scenarios table (single-tenant, no auth)

1. New Tables
- `planner_scenarios`
- `id` (uuid, primary key)
- `name` (text, not null) - name of the saved scenario
- `type` (text, not null) - 'flyover' | 'metro' | 'flood'
- `geojson` (jsonb, not null) - the drawn geometry (lat/lng points + metadata)
- `notes` (text) - planner's notes
- `created_at` (timestamp)
2. Security
- Enable RLS on `planner_scenarios`.
- Allow anon + authenticated CRUD because the data is intentionally shared/public.
*/

CREATE TABLE IF NOT EXISTS planner_scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL,
  geojson jsonb NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE planner_scenarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_scenarios" ON planner_scenarios;
CREATE POLICY "anon_select_scenarios" ON planner_scenarios FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_scenarios" ON planner_scenarios;
CREATE POLICY "anon_insert_scenarios" ON planner_scenarios FOR INSERT
TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_scenarios" ON planner_scenarios;
CREATE POLICY "anon_update_scenarios" ON planner_scenarios FOR UPDATE
TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_scenarios" ON planner_scenarios;
CREATE POLICY "anon_delete_scenarios" ON planner_scenarios FOR DELETE
TO anon, authenticated USING (true);
