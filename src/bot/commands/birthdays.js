import { birthdayService } from "../../services/birthday.service.js";
import {
  formatGroupBirthdayList,
  privateBirthdaysEmptyMessage,
  privateBirthdaysSelectGroupMessage,
} from "../../messages/index.js";
import { InlineKeyboard } from "grammy";

/**
 * /birthdays command handler
 * Displays chronological birthday lists.
 * - In group chat: displays the current group's birthdays.
 * - In private chat: displays birthdays for groups the user is registered in, without listing all active groups.
 */
export async function birthdaysCommand(ctx) {
  const isPrivate = ctx.chat.type === "private";

  // --- 1. Group Chat Flow ---
  if (!isPrivate) {
    const birthdays = await birthdayService.listByGroup(ctx.chat.id);
    const formatted = formatGroupBirthdayList(ctx.chat.title, birthdays);

    return ctx.reply(formatted, {
      parse_mode: "HTML",
      reply_to_message_id: ctx.message?.message_id,
    });
  }

  // --- 2. Private Chat Flow: Strictly User's Registered Groups ---
  const userRegistrations = await birthdayService.listUserRegistrationsAcrossGroups(ctx.from.id);

  if (userRegistrations.length === 0) {
    return ctx.reply(privateBirthdaysEmptyMessage(), { parse_mode: "HTML" });
  }

  if (userRegistrations.length === 1) {
    const reg = userRegistrations[0];
    const birthdays = await birthdayService.listByGroup(reg.groupId);
    const formatted = formatGroupBirthdayList(reg.groupTitle, birthdays);
    return ctx.reply(formatted, { parse_mode: "HTML" });
  }

  // Multiple registered groups: let user choose which of their groups to view
  const keyboard = new InlineKeyboard();
  for (const reg of userRegistrations) {
    keyboard.text(`📅 ${reg.groupTitle}`, `view_bday_${reg.groupId}`).row();
  }

  return ctx.reply(privateBirthdaysSelectGroupMessage(), {
    parse_mode: "HTML",
    reply_markup: keyboard,
  });
}
