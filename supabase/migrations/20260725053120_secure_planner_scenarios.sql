/*
# Secure planner_scenarios with owner-scoped writes

1. Why
- The previous write policies (INSERT/UPDATE/DELETE) used `WITH CHECK (true)` / `USING (true)`,
  allowing anyone (anon) to create, modify, or delete any scenario. This bypasses row-level
  security entirely.
- Fix: introduce per-row ownership via `user_id` and restrict writes to the authenticated
  owner. Reads stay public so the digital twin and scenario list remain viewable by everyone.

2. Changes to `planner_scenarios`
- Add `user_id uuid` referencing `auth.users(id)`, defaulting to the authenticated user
  (`auth.uid()`). Made NOT NULL when the table is empty (no existing rows to backfill).
- Backfill safety: if rows already exist, the column is added nullable so existing data is
  preserved (those rows become read-only since no one owns them).

3. Security changes
- DROP the three anon write policies: `anon_insert_scenarios`, `anon_update_scenarios`,
  `anon_delete_scenarios`.
- KEEP `anon_select_scenarios` (SELECT, USING true) — intentional public read of shared
  scenarios; documented here.
- ADD owner-scoped policies for authenticated users:
  - `insert_own_scenarios` (INSERT, WITH CHECK auth.uid() = user_id)
  - `update_own_scenarios` (UPDATE, USING + WITH CHECK auth.uid() = user_id)
  - `delete_own_scenarios` (DELETE, USING auth.uid() = user_id)

4. Notes
- Anonymous visitors can still view all scenarios and use the map, traffic, flood, and
  planner drawing tools. Saving a scenario now requires signing in.
- The frontend adds a sign-in / sign-up flow so users can create an account and reach the
  save feature (per the mandatory auth-flow requirement when adding owner-scoped RLS).
*/

ALTER TABLE planner_scenarios
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE planner_scenarios
  ALTER COLUMN user_id SET DEFAULT auth.uid();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM planner_scenarios) THEN
    ALTER TABLE planner_scenarios ALTER COLUMN user_id SET NOT NULL;
  END IF;
END $$;

-- Drop the overly-permissive anon write policies
DROP POLICY IF EXISTS "anon_insert_scenarios" ON planner_scenarios;
DROP POLICY IF EXISTS "anon_update_scenarios" ON planner_scenarios;
DROP POLICY IF EXISTS "anon_delete_scenarios" ON planner_scenarios;

-- Keep public read (intentional shared data)
DROP POLICY IF EXISTS "anon_select_scenarios" ON planner_scenarios;
CREATE POLICY "anon_select_scenarios" ON planner_scenarios FOR SELECT
  TO anon, authenticated USING (true);

-- Owner-scoped writes (authenticated only)
DROP POLICY IF EXISTS "insert_own_scenarios" ON planner_scenarios;
CREATE POLICY "insert_own_scenarios" ON planner_scenarios FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_scenarios" ON planner_scenarios;
CREATE POLICY "update_own_scenarios" ON planner_scenarios FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_scenarios" ON planner_scenarios;
CREATE POLICY "delete_own_scenarios" ON planner_scenarios FOR DELETE
  TO authenticated USING (auth.uid() = user_id);
