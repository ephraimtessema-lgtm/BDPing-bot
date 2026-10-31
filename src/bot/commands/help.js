import { escapeHtml } from "../../utils/formatting.js";

/**
 * /help command handler
 * Displays command documentation based on chat context.
 */
export async function helpCommand(ctx) {
  const isPrivate = ctx.chat.type === "private";

  if (!isPrivate) {
    return ctx.reply(
      `🎉 <b>BD Ping — Group Commands</b>\n\n` +
      `• /birthdays — View the group's birthday calendar\n` +
      `• /invite — (Admins only) Get the private registration link for members\n` +
      `• /ping — Check if I'm online\n` +
      `• /chatid — Display this chat's ID\n\n` +
      `🔒 <b>Privacy Notice:</b>\n` +
      `To protect member privacy, all birthday registration, editing, and deletion commands work exclusively in private chat with @${ctx.me.username}. Members never need to share their birthdays in this group!`,
      { parse_mode: "HTML" }
    );
  }

  return ctx.reply(
    `🎉 <b>BD Ping — Commands</b>\n\n` +
    `<b>Birthday Management (Private):</b>\n` +
    `• /birthday — How to register your birthday (invitation-driven)\n` +
    `• /mybirthday — View your registered birthdays across groups\n` +
    `• /editbirthday — Update a registered birthday\n` +
    `• /deletebirthday — Remove your birthday from a group\n` +
    `• /birthdays — View member birthdays for your groups\n\n` +
    `<b>Utility Commands:</b>\n` +
    `• /start — Welcome & registration entry\n` +
    `• /help — Show this help message\n` +
    `• /ping — Check if I'm online\n` +
    `• /chatid — Display your user ID\n\n` +
    `🔒 <i>All birthday registration and editing happens privately here to protect your personal details!</i>`,
    { parse_mode: "HTML" }
  );
}
