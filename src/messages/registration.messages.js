import { escapeHtml } from "../utils/formatting.js";

/**
 * Registration messages for BD Ping.
 * Enforces DD/MM date format and warm, friendly personality.
 */

/**
 * Prompt sent when user clicks a valid group invitation link in private chat.
 * @param {string} groupTitle 
 * @returns {string}
 */
export function registrationPromptMessage(groupTitle) {
  return (
    `🎂 <b>Private Birthday Registration</b>\n\n` +
    `You are registering your birthday for <b>${escapeHtml(groupTitle)}</b>.\n\n` +
    `Please reply to this message with your birthday in <b>DD/MM</b> format (for example, <code>15/01</code> or <code>15 Jan</code>).\n\n` +
    `<i>🔒 Your date is registered privately and will only be announced to ${escapeHtml(groupTitle)} on your special day.</i>`
  );
}

/**
 * Success confirmation sent upon saving a birthday.
 * @param {string} name 
 * @param {string} formattedDate 
 * @param {string} groupTitle 
 * @returns {string}
 */
export function registrationSuccessMessage(name, formattedDate, groupTitle) {
  const displayName = name ? escapeHtml(name) : "Member";
  return (
    `🎉 <b>Registration Complete!</b>\n\n` +
    `👤 <b>Name:</b> ${displayName}\n` +
    `📅 <b>Birthday:</b> ${formattedDate}\n` +
    `👥 <b>Group:</b> ${escapeHtml(groupTitle)}\n\n` +
    `<i>🔒 Your birthday was registered privately and will only be celebrated in ${escapeHtml(groupTitle)} on your special day!</i> 🥳`
  );
}

/**
 * Notice sent when opening an invitation link for a group the user is already registered in.
 * @param {string} groupTitle 
 * @param {string} formattedDate 
 * @returns {string}
 */
export function alreadyRegisteredMessage(groupTitle, formattedDate) {
  return (
    `ℹ️ <b>Already Registered</b>\n\n` +
    `You already have a birthday registered in <b>${escapeHtml(groupTitle)}</b>: <b>${formattedDate}</b>.\n\n` +
    `What would you like to do?`
  );
}

/**
 * Notice sent when a member sends a date for an already-registered group via text.
 * @param {string} groupTitle 
 * @param {string} [formattedDate] 
 * @returns {string}
 */
export function alreadyRegisteredTextReplyMessage(groupTitle, formattedDate) {
  const dateStr = formattedDate ? ` (${formattedDate})` : "";
  return (
    `ℹ️ <b>Already Registered</b>\n\n` +
    `You already have a birthday registered in <b>${escapeHtml(groupTitle)}</b>${dateStr}.\n\n` +
    `To update your date, please use /editbirthday.`
  );
}

/**
 * Prompt sent when user enters an invalid date.
 * @param {string} groupTitle 
 * @param {string} [errorDetail] 
 * @returns {string}
 */
export function invalidDateMessage(groupTitle, errorDetail) {
  const prefix = errorDetail ? `⚠️ ${escapeHtml(errorDetail)}\n\n` : `⚠️ Please enter a valid date.\n\n`;
  return (
    `${prefix}Please enter your birthday for <b>${escapeHtml(groupTitle)}</b> in <b>DD/MM</b> format (e.g. <code>15/01</code> or <code>15 Jan</code>):`
  );
}

/**
 * Message sent when a pending registration session has timed out.
 * @returns {string}
 */
export function sessionExpiredMessage() {
  return (
    `⚠️ <b>Session Expired</b>\n\n` +
    `Your registration session has timed out. Please click the group invitation link again to restart registration.`
  );
}

/**
 * Message sent when user tries to register for a group they are not a member of.
 * @param {string} groupTitle 
 * @returns {string}
 */
export function accessDeniedMessage(groupTitle) {
  return (
    `⚠️ <b>Access Denied</b>\n\n` +
    `You must be an active member of <b>${escapeHtml(groupTitle)}</b> to register for it.`
  );
}

/**
 * Message sent when registration or selection is cancelled.
 * @returns {string}
 */
export function registrationCancelledMessage() {
  return `❌ Action cancelled.`;
}

/**
 * Message sent when an unexpected error occurs during registration.
 * @param {string} [errorDetail] 
 * @returns {string}
 */
export function registrationErrorMessage(errorDetail) {
  const detail = errorDetail ? `: ${escapeHtml(errorDetail)}` : "";
  return (
    `⚠️ Could not complete your registration${detail}. Please try again using your group's invitation link.`
  );
}

/**
 * Message sent when user invokes /birthday in private chat.
 * Explains invitation-driven model without listing database groups.
 * @param {number} [registeredCount=0] 
 * @returns {string}
 */
export function invitationInfoPrivateMessage(registeredCount = 0) {
  let statusDetails = "";
  if (registeredCount > 0) {
    statusDetails =
      `\n\n📌 <b>Your Registrations:</b> You currently have <b>${registeredCount}</b> registered birthday(s).\n` +
      `• Use /mybirthday to view your registered dates.\n` +
      `• Use /editbirthday to update a date.`;
  }

  return (
    `🎂 <b>BD Ping — Birthday Registration</b>\n\n` +
    `Registration in BD Ping is invitation-driven.\n\n` +
    `To register your birthday for a group, open that group's BD Ping invitation link shared by your group admin.\n\n` +
    `📌 <i>Group admins can get this link at any time by typing /invite inside their group!</i>` +
    statusDetails
  );
}
