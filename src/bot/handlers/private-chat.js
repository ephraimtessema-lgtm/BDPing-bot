import { registrationService } from "../../services/registration.service.js";
import { birthdayService } from "../../services/birthday.service.js";
import { groupService } from "../../services/group.service.js";
import { parseBirthdayInput } from "../../utils/validation.js";
import { formatBirthday, formatGroupBirthdayList, escapeHtml } from "../../utils/formatting.js";
import { InlineKeyboard } from "grammy";

/**
 * Handles non-command text messages in private chats.
 * Intercepts user replies to complete active registration sessions.
 */
export async function privateTextHandler(ctx) {
  if (ctx.chat.type !== "private") return;
  if (!ctx.message?.text || ctx.message.text.startsWith("/")) return;

  const userId = ctx.from.id;
  const activeSession = await registrationService.getActivePendingSessionForUser(userId);

  if (!activeSession) {
    return ctx.reply(
      `🎂 Welcome to BD Ping! I didn't recognize that message.\n\n` +
      `• To register your birthday, click the BD Ping invitation link shared in your Telegram group.\n` +
      `• Type /mybirthday to view your registered dates.\n` +
      `• Type /help for all commands.`,
      { parse_mode: "HTML" }
    );
  }

  // Parse birthday input
  const parseResult = parseBirthdayInput(ctx.message.text);
  if (!parseResult.valid) {
    return ctx.reply(
      `⚠️ ${parseResult.error}\n\nPlease enter your birthday for <b>${escapeHtml(activeSession.group_title)}</b> (e.g. <code>15 Jan</code> or <code>15/01</code>):`,
      { parse_mode: "HTML" }
    );
  }

  // Complete registration atomically
  const result = await registrationService.completeRegistration({
    tokenHash: activeSession.token_hash,
    telegramUserId: userId,
    name: ctx.from.first_name || "Member",
    username: ctx.from.username,
    birthMonth: parseResult.birthMonth,
    birthDay: parseResult.birthDay,
  });

  if (!result.success) {
    if (result.error === "ALREADY_REGISTERED") {
      const existingDate = result.existingMonth
        ? ` (${formatBirthday(result.existingMonth, result.existingDay)})`
        : "";
      return ctx.reply(
        `ℹ️ <b>Already Registered</b>\n\n` +
        `You already have a birthday registered in <b>${escapeHtml(activeSession.group_title)}</b>${existingDate}.\n\n` +
        `To update your date, please use /editbirthday.`,
        { parse_mode: "HTML" }
      );
    }

    if (result.error === "SESSION_EXPIRED") {
      return ctx.reply(
        `⚠️ <b>Session Expired</b>\n\n` +
        `Your registration session has timed out. Please click the group invitation link again to restart registration.`,
        { parse_mode: "HTML" }
      );
    }

    return ctx.reply(
      `⚠️ Could not complete your registration: ${escapeHtml(result.error || "Unknown error")}. Please try again using your group's invitation link.`,
      { parse_mode: "HTML" }
    );
  }

  const dateStr = formatBirthday(parseResult.birthMonth, parseResult.birthDay);
  return ctx.reply(
    `🎉 <b>Registration Complete!</b>\n\n` +
    `👤 <b>Name:</b> ${escapeHtml(ctx.from.first_name)}\n` +
    `📅 <b>Birthday:</b> ${dateStr}\n` +
    `👥 <b>Group:</b> ${escapeHtml(activeSession.group_title)}\n\n` +
    `<i>🔒 Your birthday was registered privately and will only be celebrated in ${escapeHtml(activeSession.group_title)} on your special day!</i>`,
    { parse_mode: "HTML" }
  );
}

/**
 * Handles inline callback queries (view, edit, delete, cancel).
 */
export async function callbackQueryHandler(ctx) {
  const data = ctx.callbackQuery?.data;
  if (!data) return;

  // 1. View My Birthday Record (view_my_bday:<groupId>)
  if (data.startsWith("view_my_bday:")) {
    const groupId = parseInt(data.slice("view_my_bday:".length), 10);
    const existing = await birthdayService.getByUserAndGroup(groupId, ctx.from.id);
    const group = await groupService.getGroupById(groupId);
    const groupTitle = group?.title || `Group ${groupId}`;

    if (!existing) {
      await ctx.answerCallbackQuery({ text: "No birthday found for this group." });
      return ctx.editMessageText(`ℹ️ No birthday registered in <b>${escapeHtml(groupTitle)}</b>.`, { parse_mode: "HTML" });
    }

    const dateStr = formatBirthday(existing.birth_month, existing.birth_day);
    await ctx.answerCallbackQuery();
    return ctx.editMessageText(
      `🎂 <b>Your Birthday Record</b>\n\n` +
      `👥 <b>Group:</b> ${escapeHtml(groupTitle)}\n` +
      `📅 <b>Birthday:</b> ${dateStr}\n\n` +
      `To update your date, use <code>/editbirthday</code>.\nTo remove it, use <code>/deletebirthday</code>.`,
      { parse_mode: "HTML" }
    );
  }

  // 2. Generic Action Cancellation (cancel_action)
  if (data === "cancel_action") {
    await ctx.answerCallbackQuery({ text: "Action cancelled." });
    return ctx.editMessageText("❌ Action cancelled.");
  }

  // 3. Edit Group Selection (edit_grp_<groupId>)
  if (data.startsWith("edit_grp_")) {
    const groupId = parseInt(data.slice("edit_grp_".length), 10);
    const group = await groupService.getGroupById(groupId);
    const groupTitle = group?.title || `Group ${groupId}`;

    await ctx.answerCallbackQuery();
    return ctx.editMessageText(
      `🎂 <b>Updating birthday for ${escapeHtml(groupTitle)}</b>\n\n` +
      `Please reply with your new date using:\n<code>/editbirthday ${groupId} &lt;new date&gt;</code> (e.g. <code>/editbirthday ${groupId} 20 Feb</code>)`,
      { parse_mode: "HTML" }
    );
  }

  // 4. View Group Birthdays in Private (view_bday_<groupId>)
  if (data.startsWith("view_bday_")) {
    const groupId = parseInt(data.slice("view_bday_".length), 10);
    const group = await groupService.getGroupById(groupId);
    const groupTitle = group?.title || `Group ${groupId}`;

    const birthdays = await birthdayService.listByGroup(groupId);
    const formatted = formatGroupBirthdayList(groupTitle, birthdays);

    await ctx.answerCallbackQuery();
    return ctx.editMessageText(formatted, { parse_mode: "HTML" });
  }

  // 5. Delete Selection in Private (del_select:<groupId>)
  if (data.startsWith("del_select:")) {
    const groupId = parseInt(data.slice("del_select:".length), 10);
    const group = await groupService.getGroupById(groupId);
    const groupTitle = group?.title || `Group ${groupId}`;

    const keyboard = new InlineKeyboard()
      .text("🗑️ Yes, remove it", `del_confirm:${groupId}`)
      .text("❌ Cancel", "del_cancel");

    await ctx.answerCallbackQuery();
    return ctx.editMessageText(
      `⚠️ Are you sure you want to remove your birthday from <b>${escapeHtml(groupTitle)}</b>?`,
      { parse_mode: "HTML", reply_markup: keyboard }
    );
  }

  // 6. Delete Confirmation (del_confirm:<groupId>)
  if (data.startsWith("del_confirm:")) {
    const groupId = parseInt(data.slice("del_confirm:".length), 10);
    const userId = ctx.from.id;

    await birthdayService.deleteByUserAndGroup(groupId, userId);
    await ctx.answerCallbackQuery({ text: "Birthday removed." });
    return ctx.editMessageText("🗑️ Your birthday record has been removed.");
  }

  // 7. Delete Cancel (del_cancel)
  if (data === "del_cancel") {
    await ctx.answerCallbackQuery({ text: "Deletion cancelled." });
    return ctx.editMessageText("❌ Deletion cancelled.");
  }
}
