import { birthdayService } from "../../services/birthday.service.js";
import { formatBirthday, escapeHtml } from "../../utils/formatting.js";
import { InlineKeyboard } from "grammy";

/**
 * /deletebirthday command handler
 * Private-only command.
 * - Group chat: quietly advises user to use private chat without buttons or prompts.
 * - Private chat: allows member to delete a birthday record with group selection and confirmation.
 */
export async function deleteBirthdayCommand(ctx) {
  const isPrivate = ctx.chat.type === "private";

  if (!isPrivate) {
    return ctx.reply(
      `🔒 Birthday commands only work in private chat: @${ctx.me.username}`,
      { reply_to_message_id: ctx.message?.message_id }
    );
  }

  // --- Private Chat Flow ---
  const userGroups = await birthdayService.listUserRegistrationsAcrossGroups(ctx.from.id);

  if (userGroups.length === 0) {
    return ctx.reply(
      `ℹ️ You don't have any registered birthdays to delete.`,
      { parse_mode: "HTML" }
    );
  }

  if (userGroups.length === 1) {
    const reg = userGroups[0];
    const keyboard = new InlineKeyboard()
      .text("🗑️ Yes, remove my birthday", `del_confirm:${reg.groupId}`)
      .text("❌ Cancel", "del_cancel");

    return ctx.reply(
      `⚠️ <b>Confirm Deletion</b>\n\n` +
      `Are you sure you want to remove your birthday (${formatBirthday(reg.birthMonth, reg.birthDay)}) from <b>${escapeHtml(reg.groupTitle)}</b>?\n\n` +
      `You will no longer receive birthday announcements in that group.`,
      { parse_mode: "HTML", reply_markup: keyboard }
    );
  }

  // Multiple groups
  const keyboard = new InlineKeyboard();
  for (const g of userGroups) {
    keyboard.text(`🗑️ ${g.groupTitle}`, `del_select:${g.groupId}`).row();
  }
  keyboard.text("❌ Cancel", "del_cancel");

  return ctx.reply(
    `🗑️ <b>Select Group Record to Delete</b>\n\n` +
    `Choose which group's birthday record you would like to delete:`,
    { parse_mode: "HTML", reply_markup: keyboard }
  );
}
