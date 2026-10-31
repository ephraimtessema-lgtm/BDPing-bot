import crypto from "node:crypto";

/**
 * Generates a cryptographically secure random registration token.
 * Output is base64url encoded and strictly fits within Telegram's 64-char limit for deep links.
 * @returns {string} Plaintext token (to be sent only to user in deep link)
 */
export function generateRegistrationToken() {
  return crypto.randomBytes(24).toString("base64url");
}

/**
 * Hashes a plaintext registration token using SHA-256 for secure database storage.
 * @param {string} token Plaintext token
 * @returns {string} Hex-encoded SHA-256 hash
 */
export function hashRegistrationToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}
