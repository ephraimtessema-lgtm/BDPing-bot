import { registrationService } from "../../services/registration.service.js";
import { groupService } from "../../services/group.service.js";
import { birthdayService } from "../../services/birthday.service.js";
import { formatBirthday } from "../../utils/formatting.js";
import { InlineKeyboard } from "grammy";
import { birthdayCommand } from "./birthday.js";
import {
  groupWelcomeMessage,
  privateWelcomeMessage,
  registrationPromptMessage,
  alreadyRegisteredMessage,
  accessDeniedMessage,
  invalidInviteLinkErrorMessage,
  groupNotActiveErrorMessage,
} from "../../messages/index.js";

/**
 * /start command handler
 * Handles group onboarding, private registration links (invite_<groupId>),
 * and standard welcoming.
 */
export async function startCommand(ctx) {
  const isPrivate = ctx.chat.type === "private";
  const match = ctx.match?.trim();

  // --- 1. Group Chat: Onboarding & Shareable Invitation Link ---
  if (!isPrivate) {
    await groupService.ensureGroupExists(ctx.chat);
    const inviteLink = `https://t.me/${ctx.me.username}?start=invite_${ctx.chat.id}`;
    return ctx.reply(groupWelcomeMessage(ctx.chat.title, inviteLink), { parse_mode: "HTML" });
  }

  // --- 2. Private Chat: Invitation Deep Link (/start invite_<groupId>) ---
  if (match && (match.startsWith("invite_") || match.startsWith("group_"))) {
    const prefix = match.startsWith("invite_") ? "invite_" : "group_";
    const groupIdStr = match.slice(prefix.length);
    const groupId = parseInt(groupIdStr, 10);

    if (isNaN(groupId)) {
      return ctx.reply(invalidInviteLinkErrorMessage(), { parse_mode: "HTML" });
    }

    const group = await groupService.getGroupById(groupId);
    if (!group || !group.is_active) {
      return ctx.reply(groupNotActiveErrorMessage(), { parse_mode: "HTML" });
    }

    // Verify user is an actual active member of the group
    const isMember = await groupService.isUserInGroup(ctx.api, groupId, ctx.from.id);
    if (!isMember) {
      return ctx.reply(accessDeniedMessage(group.title), { parse_mode: "HTML" });
    }

    // Check if user is already registered in this group
    const existing = await birthdayService.getByUserAndGroup(groupId, ctx.from.id);
    if (existing) {
      const existingDateStr = formatBirthday(existing.birth_month, existing.birth_day);
      const keyboard = new InlineKeyboard()
        .text("🎂 View Birthday", `view_my_bday:${groupId}`)
        .text("✏️ Edit Birthday", `edit_grp_${groupId}`)
        .row()
        .text("❌ Cancel", "cancel_action");

      return ctx.reply(alreadyRegisteredMessage(group.title, existingDateStr), {
        parse_mode: "HTML",
        reply_markup: keyboard,
      });
    }

    // Create single active pending session for this user and group
    await registrationService.createPendingSession(ctx.from.id, groupId);

    return ctx.reply(registrationPromptMessage(group.title), {
      parse_mode: "HTML",
    });
  }

  // --- 3. Shortcut to private registration info: /start register ---
  if (match === "register") {
    return birthdayCommand(ctx);
  }

  // --- 4. Default Private Welcome ---
  return ctx.reply(privateWelcomeMessage(), { parse_mode: "HTML" });
}
