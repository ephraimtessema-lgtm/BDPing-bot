import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import { callbackQueryHandler } from "../src/bot/handlers/private-chat.js";
import { birthdayService } from "../src/services/birthday.service.js";
import { groupService } from "../src/services/group.service.js";
import {
  TOAST_NO_BIRTHDAY_FOUND,
  TOAST_ACTION_CANCELLED,
  TOAST_BIRTHDAY_REMOVED,
  TOAST_DELETION_CANCELLED,
} from "../src/messages/index.js";

describe("[INTEGRATION UNIT TEST] Callback Query Routing & State Transitions", () => {
  // Store original service references to restore cleanly after tests
  const original = {
    birthdayService: { ...birthdayService },
    groupService: { ...groupService },
  };

  afterEach(() => {
    Object.assign(birthdayService, original.birthdayService);
    Object.assign(groupService, original.groupService);
  });

  function createMockCallbackContext(callbackData, userId = 12345) {
    let answeredWith = null;
    let editedMessage = null;
    return {
      from: { id: userId, first_name: "TestUser", username: "test_user" },
      callbackQuery: callbackData !== undefined ? { data: callbackData } : undefined,
      answerCallbackQuery: async (options) => {
        answeredWith = options || {};
      },
      editMessageText: async (text, options) => {
        editedMessage = { text, options };
        return editedMessage;
      },
      getAnswered: () => answeredWith,
      getEdited: () => editedMessage,
    };
  }

  // --- 1. view_my_bday:<groupId> ---
  describe("1. view_my_bday:<groupId>", () => {
    test("displays registered birthday details when record exists", async () => {
      const groupId = -100123;
      birthdayService.getByUserAndGroup = async (gid, uid) => ({
        id: "bday-1",
        group_id: gid,
        telegram_user_id: uid,
        birth_month: 5,
        birth_day: 14,
      });
      groupService.getGroupById = async (gid) => ({ id: gid, title: "Devs <Group>" });

      const ctx = createMockCallbackContext(`view_my_bday:${groupId}`);
      await callbackQueryHandler(ctx);

      assert.ok(ctx.getAnswered() !== null, "Must call answerCallbackQuery");
      const edited = ctx.getEdited();
      assert.ok(edited, "Must edit message text");
      assert.equal(edited.options?.parse_mode, "HTML");
      assert.match(edited.text, /Your Birthday Record/);
      assert.match(edited.text, /Devs &lt;Group&gt;/);
      assert.match(edited.text, /14 May/);
    });

    test("handles missing record with informative toast notification", async () => {
      const groupId = -100123;
      birthdayService.getByUserAndGroup = async () => null;
      groupService.getGroupById = async (gid) => ({ id: gid, title: "Alpha Team" });

      const ctx = createMockCallbackContext(`view_my_bday:${groupId}`);
      await callbackQueryHandler(ctx);

      const answered = ctx.getAnswered();
      assert.equal(answered?.text, TOAST_NO_BIRTHDAY_FOUND);
      const edited = ctx.getEdited();
      assert.match(edited.text, /No birthday registered in <b>Alpha Team<\/b>/);
    });
  });

  // --- 2. cancel_action ---
  describe("2. cancel_action", () => {
    test("cancels current action and displays toast", async () => {
      const ctx = createMockCallbackContext("cancel_action");
      await callbackQueryHandler(ctx);

      assert.equal(ctx.getAnswered()?.text, TOAST_ACTION_CANCELLED);
      const edited = ctx.getEdited();
      assert.equal(edited.text, "❌ Action cancelled.");
    });
  });

  // --- 3. edit_grp_<groupId> ---
  describe("3. edit_grp_<groupId>", () => {
    test("prompts user with command syntax to update birthday for selected group", async () => {
      const groupId = -100555;
      groupService.getGroupById = async (gid) => ({ id: gid, title: "Marketing & Sales" });

      const ctx = createMockCallbackContext(`edit_grp_${groupId}`);
      await callbackQueryHandler(ctx);

      assert.ok(ctx.getAnswered() !== null);
      const edited = ctx.getEdited();
      assert.equal(edited.options?.parse_mode, "HTML");
      assert.match(edited.text, /Updating birthday for Marketing &amp; Sales/);
      assert.match(edited.text, new RegExp(`/editbirthday ${groupId} &lt;new date&gt;`));
    });
  });

  // --- 4. view_bday_<groupId> ---
  describe("4. view_bday_<groupId>", () => {
    test("displays group birthdays calendar list", async () => {
      const groupId = -100777;
      groupService.getGroupById = async (gid) => ({ id: gid, title: "Core Group" });
      birthdayService.listByGroup = async () => [
        { name: "Alice", username: "alice_tg", birth_month: 1, birth_day: 15 },
      ];

      const ctx = createMockCallbackContext(`view_bday_${groupId}`);
      await callbackQueryHandler(ctx);

      assert.ok(ctx.getAnswered() !== null);
      const edited = ctx.getEdited();
      assert.equal(edited.options?.parse_mode, "HTML");
      assert.match(edited.text, /Birthdays in Core Group/);
      assert.match(edited.text, /15 Jan/);
      assert.match(edited.text, /Alice/);
    });
  });

  // --- 5. del_select:<groupId> ---
  describe("5. del_select:<groupId>", () => {
    test("presents deletion confirmation prompt with keyboard", async () => {
      const groupId = -100888;
      groupService.getGroupById = async (gid) => ({ id: gid, title: "Omega Team" });

      const ctx = createMockCallbackContext(`del_select:${groupId}`);
      await callbackQueryHandler(ctx);

      assert.ok(ctx.getAnswered() !== null);
      const edited = ctx.getEdited();
      assert.equal(edited.options?.parse_mode, "HTML");
      assert.match(edited.text, /Are you sure you want to remove your birthday from <b>Omega Team<\/b>\?/);
      assert.ok(edited.options?.reply_markup, "Must attach confirmation buttons");
    });
  });

  // --- 6. del_confirm:<groupId> ---
  describe("6. del_confirm:<groupId>", () => {
    test("deletes user birthday and confirms with toast and message edit", async () => {
      const groupId = -100999;
      let deletedRecord = null;
      birthdayService.deleteByUserAndGroup = async (gid, uid) => {
        deletedRecord = { gid, uid };
      };

      const ctx = createMockCallbackContext(`del_confirm:${groupId}`, 44444);
      await callbackQueryHandler(ctx);

      assert.deepEqual(deletedRecord, { gid: groupId, uid: 44444 });
      assert.equal(ctx.getAnswered()?.text, TOAST_BIRTHDAY_REMOVED);
      const edited = ctx.getEdited();
      assert.equal(edited.text, "🗑️ Your birthday record has been removed.");
    });
  });

  // --- 7. del_cancel ---
  describe("7. del_cancel", () => {
    test("cancels deletion and reports cancellation toast", async () => {
      const ctx = createMockCallbackContext("del_cancel");
      await callbackQueryHandler(ctx);

      assert.equal(ctx.getAnswered()?.text, TOAST_DELETION_CANCELLED);
      const edited = ctx.getEdited();
      assert.equal(edited.text, "❌ Deletion cancelled.");
    });
  });

  // --- 8. Malformed & Safe Fallback Handling ---
  describe("8. Malformed data & edge cases", () => {
    test("exits safely when callbackQuery is undefined or has no data", async () => {
      const ctx1 = createMockCallbackContext();
      ctx1.callbackQuery = undefined;
      await assert.doesNotReject(async () => {
        await callbackQueryHandler(ctx1);
      });
      assert.equal(ctx1.getAnswered(), null);
      assert.equal(ctx1.getEdited(), null);

      const ctx2 = createMockCallbackContext("");
      await assert.doesNotReject(async () => {
        await callbackQueryHandler(ctx2);
      });
      assert.equal(ctx2.getAnswered(), null);
      assert.equal(ctx2.getEdited(), null);
    });

    test("unrecognized callback data does not crash or throw unhandled exceptions", async () => {
      const ctx = createMockCallbackContext("random_unhandled_action_123");
      await assert.doesNotReject(async () => {
        await callbackQueryHandler(ctx);
      });
      assert.equal(ctx.getAnswered(), null);
      assert.equal(ctx.getEdited(), null);
    });

    test("malformed numeric IDs are handled safely without unhandled errors", async () => {
      groupService.getGroupById = async () => null;
      birthdayService.getByUserAndGroup = async () => null;

      const ctx = createMockCallbackContext("view_my_bday:notanumber");
      await assert.doesNotReject(async () => {
        await callbackQueryHandler(ctx);
      });
      assert.equal(ctx.getAnswered()?.text, TOAST_NO_BIRTHDAY_FOUND);
    });
  });
});
