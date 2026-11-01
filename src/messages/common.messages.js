import { escapeHtml } from "../utils/formatting.js";

/**
 * Common and Shared Utility Messages for BD Ping.
 */

/**
 * Help documentation for group chats.
 * @param {string} botUsername 
 * @returns {string}
 */
export function groupHelpMessage(botUsername) {
  return (
    `🎉 <b>BD Ping — Group Commands</b>\n\n` +
    `• /birthdays — View the group's birthday calendar\n` +
    `• /invite — (Admins only) Get the private registration link for members\n` +
    `• /ping — Check if I'm online\n` +
    `• /chatid — Display this chat's ID\n\n` +
    `🔒 <b>Privacy Notice:</b>\n` +
    `To protect member privacy, all birthday registration, editing, and deletion commands work exclusively in private chat with @${botUsername}. Members never need to share their birthdays in this group!`
  );
}

/**
 * Help documentation for private chats.
 * @returns {string}
 */
export function privateHelpMessage() {
  return (
    `🎉 <b>BD Ping — Commands</b>\n\n` +
    `<b>Birthday Management (Private):</b>\n` +
    `• /birthday — How to register your birthday (invitation-driven)\n` +
    `• /mybirthday — View your registered birthdays across groups\n` +
    `• /editbirthday — Update a registered birthday\n` +
    `• /deletebirthday — Remove your birthday from a group\n` +
    `• /birthdays — View member birthdays for your groups\n\n` +
    `<b>Utility Commands:</b>\n` +
    `• /start — Welcome & registration entry\n` +
    `• /help — Show this help message\n` +
    `• /ping — Check if I'm online\n` +
    `• /chatid — Display your user ID\n\n` +
    `🔒 <i>All birthday registration and editing happens privately here to protect your personal details!</i>`
  );
}

/**
 * Short privacy notice when /birthday is called inside a group.
 * @param {string} botUsername 
 * @returns {string}
 */
export function groupPrivacyNotice(botUsername) {
  return `🔒 Birthday registration is private-only. Please message me directly: @${botUsername}`;
}

/**
 * Short privacy notice when personal birthday management commands are called in a group.
 * @param {string} botUsername 
 * @returns {string}
 */
export function groupManagementPrivacyNotice(botUsername) {
  return `🔒 Birthday commands only work in private chat: @${botUsername}`;
}

/**
 * Notice sent to group admins containing the reusable private registration invitation link.
 * @param {string} inviteUrl 
 * @returns {string}
 */
export function groupInviteLinkMessage(inviteUrl) {
  const safeInviteUrl = escapeHtml(inviteUrl);
  return (
    `🔒 <b>Private Birthday Registration Link</b>\n\n` +
    `Members can register their birthday privately without sharing dates in this chat:\n` +
    `${safeInviteUrl}\n\n` +
    `📌 <i>Admins can pin this link for new and existing members!</i>`
  );
}

/**
 * Notice sent when /invite is called inside a private chat.
 * @returns {string}
 */
export function privateInviteNotice() {
  return (
    `ℹ️ The <code>/invite</code> command is for group chats.\n\n` +
    `Group administrators can use it inside their groups to obtain the private birthday registration link for members.`
  );
}

/**
 * Pong response to /ping.
 * @returns {string}
 */
export function pingReplyMessage() {
  return `🏓 Pong! BD Ping is alive!`;
}

/**
 * Response to /chatid command.
 * @param {number|string} chatId 
 * @returns {string}
 */
export function chatIdReplyMessage(chatId) {
  return `This chat's ID is: ${chatId}`;
}

/**
 * Default fallback message when user sends non-command text in private chat without an active session.
 * @returns {string}
 */
export function unrecognizedPrivateTextMessage() {
  return (
    `🎂 Welcome to BD Ping! I didn't recognize that message.\n\n` +
    `• To register your birthday, click the BD Ping invitation link shared in your Telegram group.\n` +
    `• Type /mybirthday to view your registered dates.\n` +
    `• Type /help for all commands.`
  );
}
