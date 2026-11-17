import { createClient } from '@supabase/supabase-js';
import { getSupabaseServiceKey, getSupabaseUrl, SupabaseConfigError } from './config';

export function createAdminClient() {
  const url = getSupabaseUrl();
  const isPlaceholder = !url || url.includes('placeholder') || url.includes('your-project-id');
  const serviceKey = getSupabaseServiceKey();

  // With a real project the service key is mandatory. Falling back to the public key would hide the
  // mistake and silently return empty results because row-level security blocks it.
  if (!isPlaceholder && !serviceKey) {
    throw new SupabaseConfigError(
      'SUPABASE_SERVICE_ROLE_KEY is not set on the server. Add it in your hosting settings and redeploy.'
    );
  }

  return createClient(url || 'https://placeholder.supabase.co', serviceKey || 'placeholder-key', {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      fetch: (input, options = {}) => {
        return fetch(input, {
          ...options,
          cache: 'no-store',
        });
      },
    },
  });
}
