import { groupService } from "../../services/group.service.js";

/**
 * /invite command handler
 * Reusable private registration invitation link for groups.
 * Strictly restricted to group administrators in group chats.
 */
export async function inviteCommand(ctx) {
  const isPrivate = ctx.chat.type === "private";

  if (isPrivate) {
    return ctx.reply(
      `ℹ️ The <code>/invite</code> command is for group chats.\n\n` +
      `Group administrators can use it inside their groups to obtain the private birthday registration link for members.`,
      { parse_mode: "HTML" }
    );
  }

  // Check if sender is group administrator or creator
  const isAdmin = await groupService.isGroupAdmin(ctx.api, ctx.chat.id, ctx.from.id);
  if (!isAdmin) {
    return ctx.reply(
      `⚠️ Only group administrators can request the registration invitation link.`,
      { reply_to_message_id: ctx.message?.message_id }
    );
  }

  await groupService.ensureGroupExists(ctx.chat);
  const inviteLink = `https://t.me/${ctx.me.username}?start=invite_${ctx.chat.id}`;

  return ctx.reply(
    `🔒 <b>Private Birthday Registration Link</b>\n\n` +
    `Members can register their birthday privately without sharing dates in this chat:\n` +
    `${inviteLink}\n\n` +
    `📌 <i>Admins can pin this link for new and existing members!</i>`,
    { parse_mode: "HTML" }
  );
}
