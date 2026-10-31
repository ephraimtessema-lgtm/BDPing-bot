import { birthdayService } from "../../services/birthday.service.js";

/**
 * /birthday command handler
 * Private-only birthday registration:
 * - Group chat: does NOT initiate registration. Strictly points user to private chat without buttons or prompts.
 * - Private chat: explains invitation-driven registration. NEVER lists active groups from database.
 */
export async function birthdayCommand(ctx) {
  const isPrivate = ctx.chat.type === "private";

  // --- 1. Group Chat: Privacy Notice Only ---
  if (!isPrivate) {
    return ctx.reply(
      `🔒 Birthday registration is private-only. Please message me directly: @${ctx.me.username}`,
      { reply_to_message_id: ctx.message?.message_id }
    );
  }

  // --- 2. Private Chat: Invitation-Driven Registration Notice ---
  const userRegistrations = await birthdayService.listUserRegistrationsAcrossGroups(ctx.from.id);

  let statusDetails = "";
  if (userRegistrations.length > 0) {
    statusDetails =
      `\n\n📌 <b>Your Registrations:</b> You currently have <b>${userRegistrations.length}</b> registered birthday(s).\n` +
      `• Use /mybirthday to view your registered dates.\n` +
      `• Use /editbirthday to update a date.`;
  }

  return ctx.reply(
    `🎂 <b>BD Ping — Birthday Registration</b>\n\n` +
    `Registration in BD Ping is invitation-driven.\n\n` +
    `To register your birthday for a group, open that group's BD Ping invitation link shared by your group admin.\n\n` +
    `📌 <i>Group admins can get this link at any time by typing /invite inside their group!</i>` +
    statusDetails,
    { parse_mode: "HTML" }
  );
}
