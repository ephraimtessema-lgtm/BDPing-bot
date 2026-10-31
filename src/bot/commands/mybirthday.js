import { birthdayService } from "../../services/birthday.service.js";
import { formatBirthday, escapeHtml } from "../../utils/formatting.js";

/**
 * /mybirthday command handler
 * Private-only command.
 * - Group chat: quietly advises user to use private chat.
 * - Private chat: lists all birthdays the user has registered across all groups.
 */
export async function myBirthdayCommand(ctx) {
  const isPrivate = ctx.chat.type === "private";

  if (!isPrivate) {
    return ctx.reply(
      `🔒 Birthday commands only work in private chat: @${ctx.me.username}`,
      { reply_to_message_id: ctx.message?.message_id }
    );
  }

  const registrations = await birthdayService.listUserRegistrationsAcrossGroups(ctx.from.id);

  if (registrations.length === 0) {
    return ctx.reply(
      `📅 <b>Your Registered Birthdays</b>\n\n` +
      `You haven't registered your birthday in any groups yet!\n\n` +
      `To register, open the BD Ping invitation link shared by your group admin in your Telegram group.`,
      { parse_mode: "HTML" }
    );
  }

  let text = `📅 <b>Your Registered Birthdays Across Groups:</b>\n\n`;
  for (let i = 0; i < registrations.length; i++) {
    const reg = registrations[i];
    text += `${i + 1}. <b>${escapeHtml(reg.groupTitle)}</b>: ${formatBirthday(reg.birthMonth, reg.birthDay)}\n`;
  }

  text += `\nTo update a record, use /editbirthday.\nTo remove one, use /deletebirthday.`;
  return ctx.reply(text, { parse_mode: "HTML" });
}
