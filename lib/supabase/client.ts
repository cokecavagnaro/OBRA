import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/[^\x20-\x7E]/g, '')
  const key = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').replace(/[^\x20-\x7E]/g, '')
  return createBrowserClient(url, key)
}
