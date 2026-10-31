import { birthdayService } from "../../services/birthday.service.js";
import { parseBirthdayInput } from "../../utils/validation.js";
import { formatBirthday, escapeHtml } from "../../utils/formatting.js";
import { InlineKeyboard } from "grammy";

/**
 * /editbirthday command handler
 * Private-only command.
 * - Group chat: quietly advises user to use private chat without buttons or prompts.
 * - Private chat: updates a member's registered birthday with group selection if multiple groups exist.
 */
export async function editBirthdayCommand(ctx) {
  const isPrivate = ctx.chat.type === "private";

  if (!isPrivate) {
    return ctx.reply(
      `🔒 Birthday commands only work in private chat: @${ctx.me.username}`,
      { reply_to_message_id: ctx.message?.message_id }
    );
  }

  // --- Private Chat Flow ---
  const rawArgs = ctx.match?.trim();
  const userGroups = await birthdayService.listUserRegistrationsAcrossGroups(ctx.from.id);

  if (userGroups.length === 0) {
    return ctx.reply(
      `ℹ️ You haven't registered your birthday in any groups yet.\n\n` +
      `To get started, open the registration invitation link from your group!`,
      { parse_mode: "HTML" }
    );
  }

  // If user is registered in exactly 1 group
  if (userGroups.length === 1) {
    const reg = userGroups[0];
    if (rawArgs) {
      const parseResult = parseBirthdayInput(rawArgs);
      if (!parseResult.valid) {
        return ctx.reply(`⚠️ ${parseResult.error}\n\nExample: <code>/editbirthday 20 Feb</code>`, {
          parse_mode: "HTML",
        });
      }

      await birthdayService.updateByUserAndGroup(reg.groupId, ctx.from.id, {
        birthMonth: parseResult.birthMonth,
        birthDay: parseResult.birthDay,
        name: ctx.from.first_name,
        username: ctx.from.username,
      });

      const newDateStr = formatBirthday(parseResult.birthMonth, parseResult.birthDay);
      return ctx.reply(
        `✅ <b>Birthday Updated!</b>\n\n` +
        `Your birthday for <b>${escapeHtml(reg.groupTitle)}</b> has been updated to <b>${newDateStr}</b>.`,
        { parse_mode: "HTML" }
      );
    }

    return ctx.reply(
      `🎂 You are registered in <b>${escapeHtml(reg.groupTitle)}</b> (${formatBirthday(reg.birthMonth, reg.birthDay)}).\n\n` +
      `To update your date, please use: <code>/editbirthday &lt;new date&gt;</code> (e.g. <code>/editbirthday 20 Feb</code>).`,
      { parse_mode: "HTML" }
    );
  }

  // User is registered in multiple groups:
  // Check if user passed `/editbirthday <groupId> <new date>`
  if (rawArgs) {
    const groupMatch = rawArgs.match(/^([-\d]+)\s+(.+)$/);
    if (groupMatch) {
      const targetGroupId = parseInt(groupMatch[1], 10);
      const targetReg = userGroups.find((g) => Number(g.groupId) === targetGroupId);
      if (targetReg) {
        const parseResult = parseBirthdayInput(groupMatch[2]);
        if (!parseResult.valid) {
          return ctx.reply(`⚠️ ${parseResult.error}\n\nExample: <code>/editbirthday ${targetGroupId} 20 Feb</code>`, {
            parse_mode: "HTML",
          });
        }

        await birthdayService.updateByUserAndGroup(targetGroupId, ctx.from.id, {
          birthMonth: parseResult.birthMonth,
          birthDay: parseResult.birthDay,
          name: ctx.from.first_name,
          username: ctx.from.username,
        });

        const newDateStr = formatBirthday(parseResult.birthMonth, parseResult.birthDay);
        return ctx.reply(
          `✅ <b>Birthday Updated!</b>\n\n` +
          `Your birthday for <b>${escapeHtml(targetReg.groupTitle)}</b> has been updated to <b>${newDateStr}</b>.`,
          { parse_mode: "HTML" }
        );
      }
    }
  }

  // Otherwise, present interactive group selection
  const keyboard = new InlineKeyboard();
  for (const g of userGroups) {
    keyboard.text(`👥 ${g.groupTitle}`, `edit_grp_${g.groupId}`).row();
  }

  return ctx.reply(
    `🎂 <b>Select Group to Edit</b>\n\n` +
    `You are registered in multiple groups. Tap the group whose birthday you would like to update:`,
    { parse_mode: "HTML", reply_markup: keyboard }
  );
}
