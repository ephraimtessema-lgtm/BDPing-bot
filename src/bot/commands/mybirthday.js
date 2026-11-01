import { birthdayService } from "../../services/birthday.service.js";
import {
  groupManagementPrivacyNotice,
  myBirthdaysEmptyMessage,
  myBirthdaysListMessage,
} from "../../messages/index.js";

/**
 * /mybirthday command handler
 * Private-only command.
 * - Group chat: quietly advises user to use private chat.
 * - Private chat: lists all birthdays the user has registered across all groups.
 */
export async function myBirthdayCommand(ctx) {
  const isPrivate = ctx.chat.type === "private";

  if (!isPrivate) {
    return ctx.reply(groupManagementPrivacyNotice(ctx.me.username), {
      reply_to_message_id: ctx.message?.message_id,
    });
  }

  const registrations = await birthdayService.listUserRegistrationsAcrossGroups(ctx.from.id);

  if (registrations.length === 0) {
    return ctx.reply(myBirthdaysEmptyMessage(), { parse_mode: "HTML" });
  }

  return ctx.reply(myBirthdaysListMessage(registrations), { parse_mode: "HTML" });
}
