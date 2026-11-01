/**
 * Error Messages for BD Ping.
 * Friendly, helpful, non-blaming error descriptions.
 */

/**
 * Notice sent when a non-administrator attempts to run /invite in a group.
 * @returns {string}
 */
export function adminOnlyInviteErrorMessage() {
  return `⚠️ Only group administrators can request the registration invitation link.`;
}

/**
 * Notice sent when an invitation link points to an unknown or inactive group.
 * @returns {string}
 */
export function groupNotActiveErrorMessage() {
  return `⚠️ This group is not currently registered or active with BD Ping. Please add me to the group first!`;
}

/**
 * Notice sent when an invitation link format is malformed or invalid.
 * @returns {string}
 */
export function invalidInviteLinkErrorMessage() {
  return `⚠️ Invalid invitation link.`;
}

/**
 * Generic technical / database error message.
 * @returns {string}
 */
export function databaseErrorMessage() {
  return `⚠️ Something went wrong on our end. Please try again in a moment.`;
}

/**
 * General unexpected error message.
 * @returns {string}
 */
export function unknownErrorMessage() {
  return `⚠️ Something unexpected happened. Please try again.`;
}
