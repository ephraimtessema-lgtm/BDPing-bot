import { getMonthName } from "./validation.js";
import { birthdayAnnouncementMessage, formatGroupBirthdayList } from "../messages/birthday.messages.js";

const SHORT_MONTHS = {
  1: "Jan", 2: "Feb", 3: "Mar", 4: "Apr",
  5: "May", 6: "Jun", 7: "Jul", 8: "Aug",
  9: "Sep", 10: "Oct", 11: "Nov", 12: "Dec",
};

/**
 * Formats a birthday date into readable string.
 * @param {number} month Month (1-12)
 * @param {number} day Day (1-31)
 * @param {boolean} shortFormat If true, returns "15 Jan", otherwise "15 January"
 * @returns {string}
 */
export function formatBirthday(month, day, shortFormat = true) {
  const monthStr = shortFormat ? (SHORT_MONTHS[month] || "") : getMonthName(month);
  return `${day} ${monthStr}`;
}

/**
 * Safely escapes HTML special characters for Telegram HTML mode.
 * @param {string} text 
 * @returns {string}
 */
export function escapeHtml(text) {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Extracts a member's first name for birthday announcement mentions.
 * @param {object} celebrant
 * @returns {string}
 */
export function getCelebrantFirstName(celebrant) {
  if (!celebrant) return "Member";
  if (celebrant.firstName) return celebrant.firstName.trim();
  if (celebrant.first_name) return celebrant.first_name.trim();
  if (celebrant.name) {
    const trimmed = celebrant.name.trim();
    const firstWord = trimmed.split(/\s+/)[0];
    return firstWord || trimmed;
  }
  return "Member";
}

/**
 * Formats a scheduled daily birthday announcement message.
 *
 * Final format:
 * 🎂 Today's Birthdays:
 *
 * Let's wish our birthday stars a very Happy Birthday! 🎉
 *
 * 🎉 Happy Birthday, [Clickable Member Name]! 🎂
 *
 * Requirements:
 * 1. Display all birthday celebrants for the group in one message.
 * 2. Show one greeting line per birthday celebrant.
 * 3. Use each member's Telegram first name as the clickable mention, linked using their Telegram user ID.
 * 4. Do not depend on usernames being available.
 * 5. Do not include ages, birth years, long birthday wishes, or unnecessary descriptions.
 * 6. Escape HTML special characters in member names correctly.
 * 7. If there is only one birthday celebrant, use the same wording. Do not change the introductory sentence.
 * 8. If nobody has a birthday, send no message (returns null).
 *
 * @param {Array<{ telegram_user_id?: number | bigint, telegramUserId?: number | bigint, userId?: number | bigint, name?: string, firstName?: string, first_name?: string }>} celebrants
 * @returns {string | null} Formatted Telegram HTML string or null if empty
 */
export function formatBirthdayAnnouncement(celebrants) {
  if (!celebrants || !Array.isArray(celebrants) || celebrants.length === 0) {
    return null;
  }

  const mentions = celebrants.map((celebrant) => {
    const userId =
      celebrant.telegram_user_id ??
      celebrant.telegramUserId ??
      celebrant.userId ??
      celebrant.id;

    const rawFirstName = getCelebrantFirstName(celebrant);
    const escapedFirstName = escapeHtml(rawFirstName);
    return `<a href="tg://user?id=${userId}">${escapedFirstName}</a>`;
  });

  return birthdayAnnouncementMessage(mentions);
}

export { formatGroupBirthdayList };
