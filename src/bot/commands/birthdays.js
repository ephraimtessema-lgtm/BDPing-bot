import { birthdayService } from "../../services/birthday.service.js";
import { formatGroupBirthdayList } from "../../utils/formatting.js";
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
    return ctx.reply(
      `📅 <b>Group Birthday Calendars</b>\n\n` +
      `You haven't registered in any groups yet!\n\n` +
      `• To view birthdays for a group, type <code>/birthdays</code> directly inside that group chat.\n` +
      `• To register your birthday, open the invitation link provided by your group admin.`,
      { parse_mode: "HTML" }
    );
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

  return ctx.reply(
    `📅 <b>View Group Birthdays</b>\n\n` +
    `Select one of your registered groups to view its birthday calendar:`,
    { parse_mode: "HTML", reply_markup: keyboard }
  );
}
