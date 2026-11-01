import { escapeHtml } from "../utils/formatting.js";

/**
 * Welcome Messages for BD Ping.
 */

/**
 * Friendly group welcome message sent when BD Ping is added to a group or onboarded.
 * Uses the exact approved copy with dynamic group name and invitation URL interpolation.
 * @param {string} groupTitle 
 * @param {string} inviteUrl 
 * @returns {string} HTML-formatted Telegram message
 */
export function groupWelcomeMessage(groupTitle, inviteUrl) {
  const groupMention = groupTitle ? `<b>${escapeHtml(groupTitle)}</b>` : "this group";
  const safeInviteUrl = escapeHtml(inviteUrl);
  return (
    `🎉 Hey everyone! I'm BD Ping!\n\n` +
    `I'm here to make sure nobody's birthday goes unnoticed. 🎂\n\n` +
    `When it's someone's special day, I'll give ${groupMention} a little reminder so we can all celebrate together!\n\n` +
    `🔒 Your birthday stays private during registration.\n\n` +
    `Want to join the birthday celebrations? Register privately using the link below.\n\n` +
    `👉 Register your birthday: ${safeInviteUrl}\n\n` +
    `📅 Curious about upcoming birthdays? Just type /birthdays.\n\n` +
    `Let's make every birthday count! 🥳`
  );
}

/**
 * Friendly private welcome message sent when user opens /start directly in private chat.
 * @returns {string} HTML-formatted Telegram message
 */
export function privateWelcomeMessage() {
  return (
    `🎂 <b>Hey there! I'm BD Ping!</b>\n\n` +
    `I help groups celebrate member birthdays automatically and privately.\n\n` +
    `<b>Here's how to get started:</b>\n` +
    `• To register your birthday, tap the BD Ping invitation link shared in your Telegram group.\n` +
    `• Type /mybirthday to view your registered dates.\n` +
    `• Type /help to see all available commands.\n\n` +
    `Let's make every birthday special! 🎉`
  );
}
