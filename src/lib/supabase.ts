import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(url, anonKey);

export interface SavedScenario {
  id?: string;
  name: string;
  type: 'flyover' | 'metro' | 'flood';
  geojson: any;
  notes?: string;
  created_at?: string;
}

export async function saveScenario(s: SavedScenario) {
  const { data, error } = await supabase
    .from('planner_scenarios')
    .insert({ name: s.name, type: s.type, geojson: s.geojson, notes: s.notes })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function listScenarios() {
  const { data, error } = await supabase
    .from('planner_scenarios')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as SavedScenario[];
}

export async function deleteScenario(id: string) {
  const { error } = await supabase.from('planner_scenarios').delete().eq('id', id);
  if (error) throw error;
}

// --- Auth helpers (email/password) ---

export async function signUp(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export function onAuthChange(cb: (session: any) => void) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    // run async to avoid deadlock per Supabase guidance
    (async () => cb(session))();
  });
  return () => data.subscription.unsubscribe();
}
