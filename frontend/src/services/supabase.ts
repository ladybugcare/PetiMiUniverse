import { createClient } from "@supabase/supabase-js"

// Create React App requires this file to be inside src/
// This is a duplicate of /frontend/services/supabase.ts for CRA compatibility
export const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.REACT_APP_SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!
)
