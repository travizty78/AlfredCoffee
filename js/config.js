/* Shared login + sync (Supabase). Fill in from Supabase → Project Settings → API.
   The anon / publishable key is meant to be in the app: data is protected by login
   and the row-level security rules in supabase-setup.sql. Never put the service_role key here. */
window.ALFRED_CONFIG = {
  supabaseUrl: 'https://cygsjtvaoqjdeksuevoc.supabase.co',
  supabaseKey: 'sb_publishable_OaI7kjHyTQgxaN4NxPfYlQ_YxfseBo3',
};
