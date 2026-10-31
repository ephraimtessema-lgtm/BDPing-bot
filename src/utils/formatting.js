import { getMonthName } from "./validation.js";

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

  const lines = [
    "🎂 Today's Birthdays:",
    "Let's wish our birthday stars a very Happy Birthday! 🎉",
  ];

  for (const celebrant of celebrants) {
    const userId =
      celebrant.telegram_user_id ??
      celebrant.telegramUserId ??
      celebrant.userId ??
      celebrant.id;

    const rawFirstName = getCelebrantFirstName(celebrant);
    const escapedFirstName = escapeHtml(rawFirstName);
    const clickableMention = `<a href="tg://user?id=${userId}">${escapedFirstName}</a>`;

    lines.push(`🎉 Happy Birthday, ${clickableMention}! 🎂`);
  }

  return lines.join("\n\n");
}

/**
 * Formats a list of group birthdays chronologically.
 * @param {string} groupTitle 
 * @param {Array<{ name: string, username?: string, birth_month: number, birth_day: number }>} birthdays 
 * @returns {string} Formatted Telegram message
 */
export function formatGroupBirthdayList(groupTitle, birthdays) {
  if (!birthdays || birthdays.length === 0) {
    return (
      `📅 <b>Birthdays for ${escapeHtml(groupTitle)}</b>\n\n` +
      `No birthdays registered in this group yet!\n\n` +
      `<i>Members can register their birthday privately with @BDPingBot.</i>`
    );
  }

  // Group by month
  const groupedByMonth = {};
  for (const b of birthdays) {
    if (!groupedByMonth[b.birth_month]) {
      groupedByMonth[b.birth_month] = [];
    }
    groupedByMonth[b.birth_month].push(b);
  }

  let message = `🎂 <b>Birthdays in ${escapeHtml(groupTitle)}</b> (${birthdays.length})\n\n`;

  // Sort months chronologically starting from current month or Jan
  const months = Object.keys(groupedByMonth).map(Number).sort((a, b) => a - b);

  for (const month of months) {
    const monthName = getMonthName(month);
    message += `<b>🗓️ ${monthName}</b>\n`;
    
    // Sort days within month
    const list = groupedByMonth[month].sort((a, b) => a.birth_day - b.birth_day);
    for (const b of list) {
      const handle = b.username ? ` (@${escapeHtml(b.username)})` : "";
      message += `  • <b>${b.birth_day} ${SHORT_MONTHS[b.birth_month]}</b> — ${escapeHtml(b.name)}${handle}\n`;
    }
    message += "\n";
  }

  message += `🔒 <i>Members can register or update their birthdays privately with @BDPingBot.</i>`;
  return message.trim();
}
