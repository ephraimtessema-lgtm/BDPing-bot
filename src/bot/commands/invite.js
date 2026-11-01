import { groupService } from "../../services/group.service.js";
import {
  privateInviteNotice,
  adminOnlyInviteErrorMessage,
  groupInviteLinkMessage,
} from "../../messages/index.js";

/**
 * /invite command handler
 * Reusable private registration invitation link for groups.
 * Strictly restricted to group administrators in group chats.
 */
export async function inviteCommand(ctx) {
  const isPrivate = ctx.chat.type === "private";

  if (isPrivate) {
    return ctx.reply(privateInviteNotice(), { parse_mode: "HTML" });
  }

  // Check if sender is group administrator or creator
  const isAdmin = await groupService.isGroupAdmin(ctx.api, ctx.chat.id, ctx.from.id);
  if (!isAdmin) {
    return ctx.reply(adminOnlyInviteErrorMessage(), {
      reply_to_message_id: ctx.message?.message_id,
    });
  }

  await groupService.ensureGroupExists(ctx.chat);
  const inviteLink = `https://t.me/${ctx.me.username}?start=invite_${ctx.chat.id}`;

  return ctx.reply(groupInviteLinkMessage(inviteLink), { parse_mode: "HTML" });
}
