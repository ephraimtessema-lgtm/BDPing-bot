import { escapeHtml, formatBirthday } from "../utils/formatting.js";
import { getMonthName } from "../utils/validation.js";

const SHORT_MONTHS = {
  1: "Jan", 2: "Feb", 3: "Mar", 4: "Apr",
  5: "May", 6: "Jun", 7: "Jul", 8: "Aug",
  9: "Sep", 10: "Oct", 11: "Nov", 12: "Dec",
};

/**
 * Toast callback notifications for inline button actions.
 */
export const TOAST_NO_BIRTHDAY_FOUND = "No birthday found for this group.";
export const TOAST_ACTION_CANCELLED = "Action cancelled.";
export const TOAST_BIRTHDAY_REMOVED = "Birthday removed.";
export const TOAST_DELETION_CANCELLED = "Deletion cancelled.";

/**
 * Formats the scheduled daily birthday announcement message.
 * Final approved format:
 * 🎂 Today's Birthdays:
 * 
 * Let's wish our birthday stars a very Happy Birthday! 🎉
 * 
 * 🎉 Happy Birthday, [Clickable Member Name]! 🎂
 * @param {Array<string>} celebrantMentions Pre-formatted clickable mention strings
 * @returns {string | null}
 */
export function birthdayAnnouncementMessage(celebrantMentions) {
  if (!celebrantMentions || !Array.isArray(celebrantMentions) || celebrantMentions.length === 0) {
    return null;
  }

  const lines = [
    "🎂 Today's Birthdays:",
    "Let's wish our birthday stars a very Happy Birthday! 🎉",
  ];

  for (const mention of celebrantMentions) {
    lines.push(`🎉 Happy Birthday, ${mention}! 🎂`);
  }

  return lines.join("\n\n");
}

/**
 * Message shown when a group has no registered birthdays.
 * @param {string} groupTitle 
 * @returns {string}
 */
export function emptyGroupBirthdayListMessage(groupTitle) {
  return (
    `📅 <b>Birthdays for ${escapeHtml(groupTitle)}</b>\n\n` +
    `No birthdays registered in this group yet!\n\n` +
    `<i>Members can register their birthday privately with @BDPingBot.</i>`
  );
}

/**
 * Formats a list of group birthdays chronologically.
 * @param {string} groupTitle 
 * @param {Array<{ name: string, username?: string, birth_month: number, birth_day: number }>} birthdays 
 * @returns {string} Formatted Telegram message
 */
export function formatGroupBirthdayList(groupTitle, birthdays) {
  if (!birthdays || birthdays.length === 0) {
    return emptyGroupBirthdayListMessage(groupTitle);
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

  // Sort months chronologically starting from Jan
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

/**
 * Message shown for /mybirthday when user has zero registered birthdays.
 * @returns {string}
 */
export function myBirthdaysEmptyMessage() {
  return (
    `📅 <b>Your Registered Birthdays</b>\n\n` +
    `You haven't registered your birthday in any groups yet!\n\n` +
    `To register, open the BD Ping invitation link shared by your group admin in your Telegram group.`
  );
}

/**
 * Message listing all birthdays registered by a user across groups.
 * @param {Array<{ groupTitle: string, birthMonth: number, birthDay: number }>} registrations 
 * @returns {string}
 */
export function myBirthdaysListMessage(registrations) {
  let text = `📅 <b>Your Registered Birthdays Across Groups:</b>\n\n`;
  for (let i = 0; i < registrations.length; i++) {
    const reg = registrations[i];
    const dateStr = formatBirthday(reg.birthMonth, reg.birthDay);
    text += `${i + 1}. <b>${escapeHtml(reg.groupTitle)}</b>: ${dateStr}\n`;
  }
  text += `\nTo update a record, use /editbirthday.\nTo remove one, use /deletebirthday.`;
  return text;
}

/**
 * Message shown when user attempts /editbirthday with no registrations.
 * @returns {string}
 */
export function editBirthdayEmptyMessage() {
  return (
    `ℹ️ You haven't registered your birthday in any groups yet.\n\n` +
    `To get started, open the registration invitation link from your group!`
  );
}

/**
 * Message prompting user to enter new birthday for a single group.
 * @param {string} groupTitle 
 * @param {string} formattedDate 
 * @returns {string}
 */
export function editBirthdayPromptMessage(groupTitle, formattedDate) {
  return (
    `🎂 You are registered in <b>${escapeHtml(groupTitle)}</b> (${formattedDate}).\n\n` +
    `To update your date, please use: <code>/editbirthday &lt;new date&gt;</code> (e.g. <code>/editbirthday 20/02</code>).`
  );
}

/**
 * Message shown when an invalid date is provided for /editbirthday.
 * @param {string} errorDetail 
 * @param {string} exampleCommand 
 * @returns {string}
 */
export function editBirthdayInvalidFormatMessage(errorDetail, exampleCommand) {
  const detail = errorDetail ? escapeHtml(errorDetail) : "Please enter a valid date.";
  const example = exampleCommand ? escapeHtml(exampleCommand) : "";
  return `⚠️ ${detail}\n\nExample: <code>${example}</code>`;
}

/**
 * Message confirming birthday update.
 * @param {string} groupTitle 
 * @param {string} formattedDate 
 * @returns {string}
 */
export function editBirthdaySuccessMessage(groupTitle, formattedDate) {
  return (
    `✅ <b>Birthday Updated!</b>\n\n` +
    `Your birthday for <b>${escapeHtml(groupTitle)}</b> has been updated to <b>${formattedDate}</b>.`
  );
}

/**
 * Message prompting user to select which group to edit.
 * @returns {string}
 */
export function editBirthdaySelectGroupMessage() {
  return (
    `🎂 <b>Select Group to Edit</b>\n\n` +
    `You are registered in multiple groups. Tap the group whose birthday you would like to update:`
  );
}

/**
 * Message prompting user to send updated date after selecting a group via button.
 * @param {string} groupTitle 
 * @param {number|string} groupId 
 * @returns {string}
 */
export function editBirthdayPromptForGroupMessage(groupTitle, groupId) {
  return (
    `🎂 <b>Updating birthday for ${escapeHtml(groupTitle)}</b>\n\n` +
    `Please reply with your new date using:\n<code>/editbirthday ${groupId} &lt;new date&gt;</code> (e.g. <code>/editbirthday ${groupId} 20/02</code>)`
  );
}

/**
 * Message shown when user attempts /deletebirthday with no registrations.
 * @returns {string}
 */
export function deleteBirthdayEmptyMessage() {
  return `ℹ️ You don't have any registered birthdays to delete.`;
}

/**
 * Message asking for confirmation before deleting a birthday.
 * @param {string} groupTitle 
 * @param {string} formattedDate 
 * @returns {string}
 */
export function deleteBirthdayConfirmMessage(groupTitle, formattedDate) {
  return (
    `⚠️ <b>Confirm Deletion</b>\n\n` +
    `Are you sure you want to remove your birthday (${formattedDate}) from <b>${escapeHtml(groupTitle)}</b>?\n\n` +
    `You will no longer receive birthday announcements in that group.`
  );
}

/**
 * Message prompting confirmation when deleting via interactive callback.
 * @param {string} groupTitle 
 * @returns {string}
 */
export function deleteBirthdayConfirmPromptMessage(groupTitle) {
  return `⚠️ Are you sure you want to remove your birthday from <b>${escapeHtml(groupTitle)}</b>?`;
}

/**
 * Message prompting user to select which group record to delete.
 * @returns {string}
 */
export function deleteBirthdaySelectGroupMessage() {
  return (
    `🗑️ <b>Select Group Record to Delete</b>\n\n` +
    `Choose which group's birthday record you would like to delete:`
  );
}

/**
 * Message confirming deletion.
 * @returns {string}
 */
export function deleteBirthdaySuccessMessage() {
  return `🗑️ Your birthday record has been removed.`;
}

/**
 * Message confirming cancellation of deletion.
 * @returns {string}
 */
export function deleteBirthdayCancelledMessage() {
  return `❌ Deletion cancelled.`;
}

/**
 * Detailed view of a user's single group birthday record.
 * @param {string} groupTitle 
 * @param {string} formattedDate 
 * @returns {string}
 */
export function viewBirthdayDetailMessage(groupTitle, formattedDate) {
  return (
    `🎂 <b>Your Birthday Record</b>\n\n` +
    `👥 <b>Group:</b> ${escapeHtml(groupTitle)}\n` +
    `📅 <b>Birthday:</b> ${formattedDate}\n\n` +
    `To update your date, use <code>/editbirthday</code>.\nTo remove it, use <code>/deletebirthday</code>.`
  );
}

/**
 * Message shown when no birthday is found for the specified group.
 * @param {string} groupTitle 
 * @returns {string}
 */
export function noBirthdayForGroupMessage(groupTitle) {
  return `ℹ️ No birthday registered in <b>${escapeHtml(groupTitle)}</b>.`;
}

/**
 * Message shown for /birthdays in private chat when user has no registrations.
 * @returns {string}
 */
export function privateBirthdaysEmptyMessage() {
  return (
    `📅 <b>Group Birthday Calendars</b>\n\n` +
    `You haven't registered in any groups yet!\n\n` +
    `• To view birthdays for a group, type <code>/birthdays</code> directly inside that group chat.\n` +
    `• To register your birthday, open the invitation link provided by your group admin.`
  );
}

/**
 * Message prompting user to select which of their groups to view calendar for.
 * @returns {string}
 */
export function privateBirthdaysSelectGroupMessage() {
  return (
    `📅 <b>View Group Birthdays</b>\n\n` +
    `Select one of your registered groups to view its birthday calendar:`
  );
}
