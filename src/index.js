import "dotenv/config";
import { Bot } from "grammy";
import { supabase } from "./database/supabase.js";
import { groupService } from "./services/group.service.js";
import { startCommand } from "./bot/commands/start.js";
import { helpCommand } from "./bot/commands/help.js";
import { birthdayCommand } from "./bot/commands/birthday.js";
import { myBirthdayCommand } from "./bot/commands/mybirthday.js";
import { editBirthdayCommand } from "./bot/commands/editbirthday.js";
import { deleteBirthdayCommand } from "./bot/commands/deletebirthday.js";
import { birthdaysCommand } from "./bot/commands/birthdays.js";
import { inviteCommand } from "./bot/commands/invite.js";
import { announcementService } from "./services/announcement.service.js";
import { privateTextHandler, callbackQueryHandler } from "./bot/handlers/private-chat.js";
import {
  groupWelcomeMessage,
  pingReplyMessage,
  chatIdReplyMessage,
} from "./messages/index.js";

// 1. Validate environment variables
const requiredEnv = [
  "BOT_TOKEN",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
];

for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`Missing environment variable: ${key}`);
  }
}

// 2. Initialize Telegram bot
export const bot = new Bot(process.env.BOT_TOKEN);

// 3. Register commands
// Welcome & deep-link handler
bot.command("start", startCommand);

// Help & documentation
bot.command("help", helpCommand);

// Ping (Preserved working functionality)
bot.command("ping", async (ctx) => {
  await ctx.reply(pingReplyMessage());
});

// Chat ID (Preserved working functionality)
bot.command("chatid", async (ctx) => {
  await ctx.reply(chatIdReplyMessage(ctx.chat.id));
});

// Reusable private registration invitation link for groups (Admins only in groups)
bot.command("invite", inviteCommand);

// Birthday registration & management commands (Private-only)
bot.command("birthday", birthdayCommand);
bot.command("mybirthday", myBirthdayCommand);
bot.command("editbirthday", editBirthdayCommand);
bot.command("deletebirthday", deleteBirthdayCommand);

// Birthday calendar list (Available in group and private)
bot.command("birthdays", birthdaysCommand);

// 4. Safe group discovery & lifecycle tracking: track bot joins and leaves
bot.on("my_chat_member", async (ctx) => {
  try {
    const status = ctx.myChatMember?.new_chat_member?.status;
    if (status === "member" || status === "administrator") {
      await groupService.ensureGroupExists(ctx.chat);
      const inviteLink = `https://t.me/${ctx.me.username}?start=invite_${ctx.chat.id}`;
      await ctx.api.sendMessage(
        ctx.chat.id,
        groupWelcomeMessage(ctx.chat.title, inviteLink),
        { parse_mode: "HTML" }
      );
      console.log(`[BD Ping] Activated for group: ${ctx.chat.title} (${ctx.chat.id})`);
    } else if (status === "left" || status === "kicked") {
      await groupService.deactivateGroup(ctx.chat.id);
      console.log(`[BD Ping] Deactivated for group: ${ctx.chat.title} (${ctx.chat.id})`);
    }
  } catch (err) {
    console.error("Error handling my_chat_member update:", err);
  }
});

// 5. Register callback queries (interactive buttons)
bot.on("callback_query:data", callbackQueryHandler);

// 6. Register private message handler (for conversational registration completion)
bot.on("message:text", privateTextHandler);

// 7. Central error handling
bot.catch((err) => {
  console.error("Bot error:", err);
});

// 8. Start polling and announcement scheduler when executed directly
if (process.env.NODE_ENV !== "test") {
  const botInfo = await bot.api.getMe();
  console.log(`🎂 Bot initialized: @${botInfo.username}`);
  console.log("Supabase client initialized.");

  // Start background birthday announcement scheduler
  announcementService.startScheduler(bot.api);
  console.log("Scheduled birthday announcement runner started.");

  // Handle graceful shutdown
  const shutdown = () => {
    console.log("Stopping BD Ping...");
    announcementService.stopScheduler();
    bot.stop();
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  console.log("Starting polling...");
  await bot.start();
}
