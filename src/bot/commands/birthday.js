import { birthdayService } from "../../services/birthday.service.js";
import {
  groupPrivacyNotice,
  invitationInfoPrivateMessage,
} from "../../messages/index.js";

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
    return ctx.reply(groupPrivacyNotice(ctx.me.username), {
      reply_to_message_id: ctx.message?.message_id,
    });
  }

  // --- 2. Private Chat: Invitation-Driven Registration Notice ---
  const userRegistrations = await birthdayService.listUserRegistrationsAcrossGroups(ctx.from.id);

  return ctx.reply(invitationInfoPrivateMessage(userRegistrations.length), {
    parse_mode: "HTML",
  });
}
