
import {
  supabase,
  generateRegistrationToken,
  hashRegistrationToken,
} from "../database/supabase.js";

/**
 * Creates a consistent database error without exposing internal database
 * details to users of the bot.
 *
 * The original error remains available in `cause` for debugging.
 */
function createDatabaseError(operation, originalError) {
  const error = new Error(
    `Database operation failed while ${operation}.`
  );

  error.code = "DATABASE_ERROR";
  error.cause = originalError;

  return error;
}

/**
 * Creates an application error with a stable error code.
 */
function createRegistrationError(code, message) {
  const error = new Error(message);
  error.code = code;

  return error;
}

/**
 * Service for managing private registration sessions and deep-link tokens.
 *
 * IMPORTANT:
 * Session creation and registration completion require Migration 002.
 * There are deliberately NO non-atomic database fallbacks.
 */
export const registrationService = {

  /**
   * Creates a single active pending registration session for a user.
   *
   * The database RPC:
   * - Expires the user's previous pending sessions.
   * - Creates the new session.
   * - Uses a transaction-level advisory lock to prevent concurrent
   *   session creation races.
   *
   * @param {number} telegramUserId
   * @param {number} groupId
   * @param {number} [expirySeconds=1800]
   * @returns {Promise<{rawToken: string, expiresAt: string}>}
   */
  async createPendingSession(
    telegramUserId,
    groupId,
    expirySeconds = 1800
  ) {
    const rawToken = generateRegistrationToken();
    const tokenHash = hashRegistrationToken(rawToken);

    const { data: rpcData, error: rpcError } = await supabase.rpc(
      "bd_ping_create_registration_session",
      {
        p_token_hash: tokenHash,
        p_telegram_user_id: telegramUserId,
        p_group_id: groupId,
        p_expiry_seconds: expirySeconds,
      }
    );

    // Never silently fall back to separate database operations.
    if (rpcError) {
      throw createDatabaseError(
        "creating a registration session",
        rpcError
      );
    }

    if (!rpcData || typeof rpcData !== "object") {
      throw createRegistrationError(
        "INVALID_RPC_RESPONSE",
        "The registration session service returned an invalid response."
      );
    }

    if (rpcData.success !== true) {
      if (rpcData.error === "GROUP_NOT_FOUND") {
        throw createRegistrationError(
          "GROUP_NOT_FOUND",
          "The selected group could not be found."
        );
      }

      throw createRegistrationError(
        rpcData.error || "SESSION_CREATION_FAILED",
        "Could not create your registration session."
      );
    }

    if (!rpcData.expires_at) {
      throw createRegistrationError(
        "INVALID_RPC_RESPONSE",
        "The registration session response is missing its expiration time."
      );
    }

    return {
      rawToken,
      expiresAt: rpcData.expires_at,
    };
  },


  /**
   * Retrieves and verifies an active session using its raw deep-link token.
   *
   * The raw token is never stored in the database.
   * Only its SHA-256 hash is used for lookup.
   *
   * @param {string} rawToken
   * @param {number} telegramUserId
   * @returns {Promise<{valid: boolean, session?: object, error?: string}>}
   */
  async verifySessionByToken(rawToken, telegramUserId) {
    if (!rawToken || typeof rawToken !== "string") {
      return {
        valid: false,
        error: "INVALID_TOKEN",
      };
    }

    if (telegramUserId === null || telegramUserId === undefined) {
      return {
        valid: false,
        error: "UNAUTHORIZED_USER",
      };
    }

    const tokenHash = hashRegistrationToken(rawToken);

    const { data: session, error } = await supabase
      .from("registration_sessions")
      .select(
        "id, token_hash, telegram_user_id, group_id, status, expires_at"
      )
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (error) {
      throw createDatabaseError(
        "verifying a registration session",
        error
      );
    }

    if (!session) {
      return {
        valid: false,
        error: "SESSION_NOT_FOUND",
      };
    }

    // Verify ownership before revealing the session's status.
    if (
      String(session.telegram_user_id) !== String(telegramUserId)
    ) {
      return {
        valid: false,
        error: "UNAUTHORIZED_USER",
      };
    }

    if (session.status !== "pending") {
      return {
        valid: false,
        error: "SESSION_ALREADY_USED",
      };
    }

    if (new Date(session.expires_at) <= new Date()) {
      const { error: updateError } = await supabase
        .from("registration_sessions")
        .update({
          status: "expired",
          updated_at: new Date().toISOString(),
        })
        .eq("id", session.id)
        .eq("status", "pending");

      if (updateError) {
        throw createDatabaseError(
          "expiring an outdated registration session",
          updateError
        );
      }

      return {
        valid: false,
        error: "SESSION_EXPIRED",
      };
    }

    return {
      valid: true,
      session,
    };
  },


  /**
   * Finds the currently active pending registration session for a user.
   *
   * A user can have only one pending session across all groups.
   * The database unique partial index enforces this rule.
   *
   * @param {number} telegramUserId
   * @returns {Promise<{
   *   id: string,
   *   token_hash: string,
   *   group_id: number,
   *   group_title: string
   * } | null>}
   */
  async getActivePendingSessionForUser(telegramUserId) {
    const nowIso = new Date().toISOString();

    const { data, error } = await supabase
      .from("registration_sessions")
      .select(
        "id, token_hash, group_id, expires_at, groups (title)"
      )
      .eq("telegram_user_id", telegramUserId)
      .eq("status", "pending")
      .gt("expires_at", nowIso)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw createDatabaseError(
        "retrieving the active registration session",
        error
      );
    }

    if (!data) {
      return null;
    }

    return {
      id: data.id,
      token_hash: data.token_hash,
      group_id: data.group_id,
      group_title: data.groups?.title || `Group ${data.group_id}`,
    };
  },


  /**
   * Atomically completes a private birthday registration.
   *
   * The database RPC:
   * - Locks the registration session.
   * - Verifies token ownership and expiration.
   * - Inserts the birthday record.
   * - Never overwrites an existing birthday.
   * - Handles concurrent registration attempts.
   * - Marks the session completed in the same transaction.
   *
   * Migration 002 must be installed before using this method.
   *
   * @param {object} params
   * @param {string} params.tokenHash
   * @param {number} params.telegramUserId
   * @param {string} params.name
   * @param {string} [params.username]
   * @param {number} params.birthMonth
   * @param {number} params.birthDay
   *
   * @returns {Promise<{
   *   success: boolean,
   *   birthdayId?: string,
   *   groupId?: number,
   *   groupTitle?: string,
   *   error?: string,
   *   existingMonth?: number,
   *   existingDay?: number
   * }>}
   */
  async completeRegistration({
    tokenHash,
    telegramUserId,
    name,
    username,
    birthMonth,
    birthDay,
  }) {
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      "bd_ping_complete_registration",
      {
        p_token_hash: tokenHash,
        p_telegram_user_id: telegramUserId,
        p_name: name,
        p_username: username || null,
        p_birth_month: birthMonth,
        p_birth_day: birthDay,
      }
    );

    // Atomic registration is mandatory.
    // If the RPC fails, do not attempt sequential inserts and updates.
    if (rpcError) {
      throw createDatabaseError(
        "completing birthday registration",
        rpcError
      );
    }

    if (
      !rpcData ||
      typeof rpcData !== "object" ||
      typeof rpcData.success !== "boolean"
    ) {
      throw createRegistrationError(
        "INVALID_RPC_RESPONSE",
        "The registration service returned an invalid response."
      );
    }

    // Preserve the database RPC's result using the existing JS interface.
    return {
      success: rpcData.success,
      birthdayId: rpcData.birthday_id,
      groupId: rpcData.group_id,
      groupTitle: rpcData.group_title,
      error: rpcData.error,
      existingMonth: rpcData.existing_month,
      existingDay: rpcData.existing_day,
    };
  },

};
