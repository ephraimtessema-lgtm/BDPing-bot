import { registrationService } from "../../services/registration.service.js";
import { groupService } from "../../services/group.service.js";
import { birthdayService } from "../../services/birthday.service.js";
import { formatBirthday, escapeHtml } from "../../utils/formatting.js";
import { InlineKeyboard } from "grammy";
import { birthdayCommand } from "./birthday.js";

/**
 * /start command handler
 * Handles group onboarding, private registration links (invite_<groupId>),
 * and standard welcoming.
 */
export async function startCommand(ctx) {
  const isPrivate = ctx.chat.type === "private";
  const match = ctx.match?.trim();

  // --- 1. Group Chat: Onboarding & Shareable Invitation Link ---
  if (!isPrivate) {
    await groupService.ensureGroupExists(ctx.chat);
    const inviteLink = `https://t.me/${ctx.me.username}?start=invite_${ctx.chat.id}`;

    return ctx.reply(
      `🎂 <b>BD Ping is ready for ${escapeHtml(ctx.chat.title)}!</b>\n\n` +
      `I automatically remember and celebrate members' birthdays in this group.\n\n` +
      `🔒 <b>Registration is 100% private.</b> Members never need to enter or announce their birthdays in this chat.\n\n` +
      `📌 <b>Admins:</b> Pin this message or share this link for members to register privately:\n` +
      `${inviteLink}\n\n` +
      `View group birthdays: /birthdays`,
      { parse_mode: "HTML" }
    );
  }

  // --- 2. Private Chat: Invitation Deep Link (/start invite_<groupId>) ---
  if (match && (match.startsWith("invite_") || match.startsWith("group_"))) {
    const prefix = match.startsWith("invite_") ? "invite_" : "group_";
    const groupIdStr = match.slice(prefix.length);
    const groupId = parseInt(groupIdStr, 10);

    if (isNaN(groupId)) {
      return ctx.reply("⚠️ Invalid invitation link.", { parse_mode: "HTML" });
    }

    const group = await groupService.getGroupById(groupId);
    if (!group || !group.is_active) {
      return ctx.reply(
        "⚠️ This group is not currently registered or active with BD Ping. Please add me to the group first!",
        { parse_mode: "HTML" }
      );
    }

    // Verify user is an actual active member of the group
    const isMember = await groupService.isUserInGroup(ctx.api, groupId, ctx.from.id);
    if (!isMember) {
      return ctx.reply(
        `⚠️ <b>Access Denied</b>\n\n` +
        `You must be an active member of <b>${escapeHtml(group.title)}</b> to register for it.`,
        { parse_mode: "HTML" }
      );
    }

    // Check if user is already registered in this group
    const existing = await birthdayService.getByUserAndGroup(groupId, ctx.from.id);
    if (existing) {
      const existingDateStr = formatBirthday(existing.birth_month, existing.birth_day);
      const keyboard = new InlineKeyboard()
        .text("🎂 View Birthday", `view_my_bday:${groupId}`)
        .text("✏️ Edit Birthday", `edit_grp_${groupId}`)
        .row()
        .text("❌ Cancel", "cancel_action");

      return ctx.reply(
        `ℹ️ <b>Already Registered</b>\n\n` +
        `You already have a birthday registered in <b>${escapeHtml(group.title)}</b>: <b>${existingDateStr}</b>.\n\n` +
        `What would you like to do?`,
        { parse_mode: "HTML", reply_markup: keyboard }
      );
    }

    // Create single active pending session for this user and group
    await registrationService.createPendingSession(ctx.from.id, groupId);

    return ctx.reply(
      `🎂 <b>Private Birthday Registration</b>\n\n` +
      `You are registering your birthday for <b>${escapeHtml(group.title)}</b>.\n\n` +
      `Please reply to this message with your birthday (e.g. <code>15 Jan</code> or <code>15/01</code>).\n\n` +
      `<i>🔒 Your date is registered privately and will only be announced to ${escapeHtml(group.title)} on your special day.</i>`,
      { parse_mode: "HTML" }
    );
  }

  // --- 3. Shortcut to private registration info: /start register ---
  if (match === "register") {
    return birthdayCommand(ctx);
  }

  // --- 4. Default Private Welcome ---
  return ctx.reply(
    "🎂 <b>Welcome to BD Ping!</b>\n\n" +
    "I help groups celebrate member birthdays automatically and privately.\n\n" +
    "• To register your birthday, click the BD Ping invitation link shared in your Telegram group.\n" +
    "• Type /mybirthday to view your registered dates.\n" +
    "• Type /help to discover all available commands.",
    { parse_mode: "HTML" }
  );
}
