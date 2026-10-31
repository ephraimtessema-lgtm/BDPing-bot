import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
export { generateRegistrationToken, hashRegistrationToken } from "../utils/crypto.js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  // Warn instead of throwing at import time if running offline/unit tests
  console.warn("Notice: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not defined in current environment.");
}

/**
 * Resilient Supabase client using the backend service_role key.
 * Bypasses RLS to manage multi-tenant Telegram groups and isolated records.
 */
export const supabase = (supabaseUrl && supabaseKey)
  ? createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  : null;

/**
 * Verifies basic connectivity to Supabase.
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function checkDatabaseConnection() {
  if (!supabase) {
    return { ok: false, error: "Supabase client not initialized: missing credentials." };
  }
  try {
    const { error } = await supabase.from("groups").select("id").limit(1);
    if (error && error.code !== "PGRST116") {
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
