import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Supabase credentials missing in .env file!")
}

// Create client only if credentials exist, otherwise export a dummy or null
// to prevent the app from crashing entirely on load.
export const supabase = (supabaseUrl && supabaseAnonKey) 
  ? createClient(supabaseUrl, supabaseAnonKey)
  : { 
      from: () => ({ 
        select: () => Promise.resolve({ data: [], error: { message: "Supabase not configured" } }),
        insert: () => Promise.resolve({ data: [], error: { message: "Supabase not configured" } }),
        update: () => ({ eq: () => Promise.resolve({ data: [], error: { message: "Supabase not configured" } }) }),
        delete: () => ({ eq: () => Promise.resolve({ data: [], error: { message: "Supabase not configured" } }) }),
      }),
      auth: {
        getSession: () => Promise.resolve({ data: { session: null }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } })
      }
    }

