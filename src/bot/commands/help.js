import { groupHelpMessage, privateHelpMessage } from "../../messages/index.js";

/**
 * /help command handler
 * Displays command documentation based on chat context.
 */
export async function helpCommand(ctx) {
  const isPrivate = ctx.chat.type === "private";

  if (!isPrivate) {
    return ctx.reply(groupHelpMessage(ctx.me.username), { parse_mode: "HTML" });
  }

  return ctx.reply(privateHelpMessage(), { parse_mode: "HTML" });
}
