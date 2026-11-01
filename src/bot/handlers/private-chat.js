import { registrationService } from "../../services/registration.service.js";
import { birthdayService } from "../../services/birthday.service.js";
import { groupService } from "../../services/group.service.js";
import { parseBirthdayInput } from "../../utils/validation.js";
import { formatBirthday } from "../../utils/formatting.js";
import { InlineKeyboard } from "grammy";
import {
  unrecognizedPrivateTextMessage,
  invalidDateMessage,
  alreadyRegisteredTextReplyMessage,
  sessionExpiredMessage,
  registrationErrorMessage,
  registrationSuccessMessage,
  registrationCancelledMessage,
  noBirthdayForGroupMessage,
  viewBirthdayDetailMessage,
  editBirthdayPromptForGroupMessage,
  formatGroupBirthdayList,
  deleteBirthdayConfirmPromptMessage,
  deleteBirthdaySuccessMessage,
  deleteBirthdayCancelledMessage,
  TOAST_NO_BIRTHDAY_FOUND,
  TOAST_ACTION_CANCELLED,
  TOAST_BIRTHDAY_REMOVED,
  TOAST_DELETION_CANCELLED,
} from "../../messages/index.js";

/**
 * Handles non-command text messages in private chats.
 * Intercepts user replies to complete active registration sessions.
 */
export async function privateTextHandler(ctx) {
  if (ctx.chat.type !== "private") return;
  if (!ctx.message?.text || ctx.message.text.startsWith("/")) return;

  const userId = ctx.from.id;
  const activeSession = await registrationService.getActivePendingSessionForUser(userId);

  if (!activeSession) {
    return ctx.reply(unrecognizedPrivateTextMessage(), { parse_mode: "HTML" });
  }

  // Parse birthday input
  const parseResult = parseBirthdayInput(ctx.message.text);
  if (!parseResult.valid) {
    return ctx.reply(
      invalidDateMessage(activeSession.group_title, parseResult.error),
      { parse_mode: "HTML" }
    );
  }

  // Complete registration atomically
  const result = await registrationService.completeRegistration({
    tokenHash: activeSession.token_hash,
    telegramUserId: userId,
    name: ctx.from.first_name || "Member",
    username: ctx.from.username,
    birthMonth: parseResult.birthMonth,
    birthDay: parseResult.birthDay,
  });

  if (!result.success) {
    if (result.error === "ALREADY_REGISTERED") {
      const existingDate = result.existingMonth
        ? formatBirthday(result.existingMonth, result.existingDay)
        : null;
      return ctx.reply(
        alreadyRegisteredTextReplyMessage(activeSession.group_title, existingDate),
        { parse_mode: "HTML" }
      );
    }

    if (result.error === "SESSION_EXPIRED") {
      return ctx.reply(sessionExpiredMessage(), { parse_mode: "HTML" });
    }

    return ctx.reply(registrationErrorMessage(result.error), {
      parse_mode: "HTML",
    });
  }

  const dateStr = formatBirthday(parseResult.birthMonth, parseResult.birthDay);
  return ctx.reply(
    registrationSuccessMessage(ctx.from.first_name || "Member", dateStr, activeSession.group_title),
    { parse_mode: "HTML" }
  );
}

/**
 * Handles inline callback queries (view, edit, delete, cancel).
 */
export async function callbackQueryHandler(ctx) {
  const data = ctx.callbackQuery?.data;
  if (!data) return;

  // 1. View My Birthday Record (view_my_bday:<groupId>)
  if (data.startsWith("view_my_bday:")) {
    const groupId = parseInt(data.slice("view_my_bday:".length), 10);
    const existing = await birthdayService.getByUserAndGroup(groupId, ctx.from.id);
    const group = await groupService.getGroupById(groupId);
    const groupTitle = group?.title || `Group ${groupId}`;

    if (!existing) {
      await ctx.answerCallbackQuery({ text: TOAST_NO_BIRTHDAY_FOUND });
      return ctx.editMessageText(noBirthdayForGroupMessage(groupTitle), {
        parse_mode: "HTML",
      });
    }

    const dateStr = formatBirthday(existing.birth_month, existing.birth_day);
    await ctx.answerCallbackQuery();
    return ctx.editMessageText(viewBirthdayDetailMessage(groupTitle, dateStr), {
      parse_mode: "HTML",
    });
  }

  // 2. Generic Action Cancellation (cancel_action)
  if (data === "cancel_action") {
    await ctx.answerCallbackQuery({ text: TOAST_ACTION_CANCELLED });
    return ctx.editMessageText(registrationCancelledMessage());
  }

  // 3. Edit Group Selection (edit_grp_<groupId>)
  if (data.startsWith("edit_grp_")) {
    const groupId = parseInt(data.slice("edit_grp_".length), 10);
    const group = await groupService.getGroupById(groupId);
    const groupTitle = group?.title || `Group ${groupId}`;

    await ctx.answerCallbackQuery();
    return ctx.editMessageText(
      editBirthdayPromptForGroupMessage(groupTitle, groupId),
      { parse_mode: "HTML" }
    );
  }

  // 4. View Group Birthdays in Private (view_bday_<groupId>)
  if (data.startsWith("view_bday_")) {
    const groupId = parseInt(data.slice("view_bday_".length), 10);
    const group = await groupService.getGroupById(groupId);
    const groupTitle = group?.title || `Group ${groupId}`;

    const birthdays = await birthdayService.listByGroup(groupId);
    const formatted = formatGroupBirthdayList(groupTitle, birthdays);

    await ctx.answerCallbackQuery();
    return ctx.editMessageText(formatted, { parse_mode: "HTML" });
  }

  // 5. Delete Selection in Private (del_select:<groupId>)
  if (data.startsWith("del_select:")) {
    const groupId = parseInt(data.slice("del_select:".length), 10);
    const group = await groupService.getGroupById(groupId);
    const groupTitle = group?.title || `Group ${groupId}`;

    const keyboard = new InlineKeyboard()
      .text("🗑️ Yes, remove it", `del_confirm:${groupId}`)
      .text("❌ Cancel", "del_cancel");

    await ctx.answerCallbackQuery();
    return ctx.editMessageText(deleteBirthdayConfirmPromptMessage(groupTitle), {
      parse_mode: "HTML",
      reply_markup: keyboard,
    });
  }

  // 6. Delete Confirmation (del_confirm:<groupId>)
  if (data.startsWith("del_confirm:")) {
    const groupId = parseInt(data.slice("del_confirm:".length), 10);
    const userId = ctx.from.id;

    await birthdayService.deleteByUserAndGroup(groupId, userId);
    await ctx.answerCallbackQuery({ text: TOAST_BIRTHDAY_REMOVED });
    return ctx.editMessageText(deleteBirthdaySuccessMessage());
  }

  // 7. Delete Cancel (del_cancel)
  if (data === "del_cancel") {
    await ctx.answerCallbackQuery({ text: TOAST_DELETION_CANCELLED });
    return ctx.editMessageText(deleteBirthdayCancelledMessage());
  }
}
