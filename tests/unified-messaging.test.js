import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  groupWelcomeMessage,
  privateWelcomeMessage,
  registrationPromptMessage,
  registrationSuccessMessage,
  alreadyRegisteredMessage,
  alreadyRegisteredTextReplyMessage,
  invalidDateMessage,
  sessionExpiredMessage,
  accessDeniedMessage,
  registrationCancelledMessage,
  registrationErrorMessage,
  invitationInfoPrivateMessage,
  birthdayAnnouncementMessage,
  emptyGroupBirthdayListMessage,
  formatGroupBirthdayList,
  myBirthdaysEmptyMessage,
  myBirthdaysListMessage,
  editBirthdayEmptyMessage,
  editBirthdayPromptMessage,
  editBirthdayInvalidFormatMessage,
  editBirthdaySuccessMessage,
  editBirthdaySelectGroupMessage,
  editBirthdayPromptForGroupMessage,
  deleteBirthdayEmptyMessage,
  deleteBirthdayConfirmMessage,
  deleteBirthdayConfirmPromptMessage,
  deleteBirthdaySelectGroupMessage,
  deleteBirthdaySuccessMessage,
  deleteBirthdayCancelledMessage,
  viewBirthdayDetailMessage,
  noBirthdayForGroupMessage,
  privateBirthdaysEmptyMessage,
  privateBirthdaysSelectGroupMessage,
  adminOnlyInviteErrorMessage,
  groupNotActiveErrorMessage,
  invalidInviteLinkErrorMessage,
  databaseErrorMessage,
  unknownErrorMessage,
  groupHelpMessage,
  privateHelpMessage,
  groupPrivacyNotice,
  groupManagementPrivacyNotice,
  groupInviteLinkMessage,
  privateInviteNotice,
  pingReplyMessage,
  chatIdReplyMessage,
  unrecognizedPrivateTextMessage,
} from "../src/messages/index.js";

describe("[UNIT TEST] Unified Messaging & Personality Architecture", () => {
  // ==========================================
  // 1. Welcome Messages
  // ==========================================
  describe("1. Welcome Messages", () => {
    test("groupWelcomeMessage uses exact approved copy and interpolates group title & invite URL", () => {
      const groupTitle = "Awesome Developers";
      const inviteUrl = "https://t.me/BDPingBot?start=invite_-100123";
      const msg = groupWelcomeMessage(groupTitle, inviteUrl);

      assert.match(msg, /^🎉 Hey everyone! I'm BD Ping!/);
      assert.match(msg, /I'm here to make sure nobody's birthday goes unnoticed\. 🎂/);
      assert.match(msg, /When it's someone's special day, I'll give <b>Awesome Developers<\/b> a little reminder so we can all celebrate together!/);
      assert.match(msg, /🔒 Your birthday stays private during registration\./);
      assert.match(msg, /👉 Register your birthday: https:\/\/t\.me\/BDPingBot\?start=invite_-100123/);
      assert.match(msg, /📅 Curious about upcoming birthdays\? Just type \/birthdays\./);
      assert.match(msg, /Let's make every birthday count! 🥳$/);
    });

    test("groupWelcomeMessage safely escapes HTML special characters in group names", () => {
      const unsafeTitle = "<Script> & 'Rockers' \"Group\"";
      const inviteUrl = "https://t.me/BDPingBot?start=invite_-100123";
      const msg = groupWelcomeMessage(unsafeTitle, inviteUrl);

      assert.match(msg, /&lt;Script&gt; &amp; 'Rockers' &quot;Group&quot;/);
      assert.doesNotMatch(msg, /<Script>/);
    });

    test("groupWelcomeMessage falls back gracefully if group title is empty or missing", () => {
      const inviteUrl = "https://t.me/BDPingBot?start=invite_-100123";
      const msg = groupWelcomeMessage("", inviteUrl);

      assert.match(msg, /I'll give this group a little reminder/);
    });

    test("privateWelcomeMessage welcomes private chat user warmly with guidance", () => {
      const msg = privateWelcomeMessage();

      assert.match(msg, /🎂 <b>Hey there! I'm BD Ping!<\/b>/);
      assert.match(msg, /I help groups celebrate member birthdays automatically and privately\./);
      assert.match(msg, /\/mybirthday/);
      assert.match(msg, /\/help/);
    });
  });

  // ==========================================
  // 2. Registration Messages
  // ==========================================
  describe("2. Registration Messages", () => {
    test("registrationPromptMessage prompts for DD/MM format with privacy reassurance", () => {
      const msg = registrationPromptMessage("Family Group");

      assert.match(msg, /🎂 <b>Private Birthday Registration<\/b>/);
      assert.match(msg, /registering your birthday for <b>Family Group<\/b>/);
      assert.match(msg, /in <b>DD\/MM<\/b> format/);
      assert.match(msg, /<code>15\/01<\/code>/);
      assert.match(msg, /🔒 Your date is registered privately/);
    });

    test("registrationSuccessMessage formats celebrant name, birthday, and group with HTML escaping", () => {
      const msg = registrationSuccessMessage("<Bob>", "15 Jan", "Engineering <Team>");

      assert.match(msg, /🎉 <b>Registration Complete!<\/b>/);
      assert.match(msg, /👤 <b>Name:<\/b> &lt;Bob&gt;/);
      assert.match(msg, /📅 <b>Birthday:<\/b> 15 Jan/);
      assert.match(msg, /👥 <b>Group:<\/b> Engineering &lt;Team&gt;/);
      assert.doesNotMatch(msg, /<Bob>/);
    });

    test("alreadyRegisteredMessage and alreadyRegisteredTextReplyMessage prevent confusion", () => {
      const deepLinkMsg = alreadyRegisteredMessage("Core Team", "14 May");
      assert.match(deepLinkMsg, /ℹ️ <b>Already Registered<\/b>/);
      assert.match(deepLinkMsg, /Core Team/);
      assert.match(deepLinkMsg, /14 May/);
      assert.match(deepLinkMsg, /What would you like to do\?/);

      const textReplyMsg = alreadyRegisteredTextReplyMessage("Core Team", "14 May");
      assert.match(textReplyMsg, /ℹ️ <b>Already Registered<\/b>/);
      assert.match(textReplyMsg, /\/editbirthday/);
    });

    test("invalidDateMessage politely prompts user without blaming", () => {
      const msg = invalidDateMessage("Reading Club", "February 30 does not exist.");

      assert.match(msg, /⚠️ February 30 does not exist\./);
      assert.match(msg, /in <b>DD\/MM<\/b> format/);
      assert.match(msg, /Reading Club/);
    });

    test("sessionExpiredMessage and accessDeniedMessage provide clear next steps", () => {
      const expiredMsg = sessionExpiredMessage();
      assert.match(expiredMsg, /⚠️ <b>Session Expired<\/b>/);
      assert.match(expiredMsg, /click the group invitation link again/);

      const deniedMsg = accessDeniedMessage("VIP Club");
      assert.match(deniedMsg, /⚠️ <b>Access Denied<\/b>/);
      assert.match(deniedMsg, /must be an active member of <b>VIP Club<\/b>/);
    });

    test("invitationInfoPrivateMessage explains invitation model and shows registration count", () => {
      const emptyMsg = invitationInfoPrivateMessage(0);
      assert.match(emptyMsg, /Registration in BD Ping is invitation-driven\./);
      assert.match(emptyMsg, /open that group's BD Ping invitation link/);
      assert.doesNotMatch(emptyMsg, /Your Registrations:/);

      const withCountMsg = invitationInfoPrivateMessage(3);
      assert.match(withCountMsg, /Registration in BD Ping is invitation-driven\./);
      assert.match(withCountMsg, /You currently have <b>3<\/b> registered birthday\(s\)\./);
      assert.match(withCountMsg, /\/mybirthday/);
      assert.match(withCountMsg, /\/editbirthday/);
    });
  });

  // ==========================================
  // 3. Birthday Messages
  // ==========================================
  describe("3. Birthday Messages", () => {
    test("birthdayAnnouncementMessage generates exact multi-celebrant format", () => {
      const mentions = [
        '<a href="tg://user?id=123">Alice</a>',
        '<a href="tg://user?id=456">Bob</a>',
      ];
      const msg = birthdayAnnouncementMessage(mentions);

      const expected =
        "🎂 Today's Birthdays:\n\n" +
        "Let's wish our birthday stars a very Happy Birthday! 🎉\n\n" +
        '🎉 Happy Birthday, <a href="tg://user?id=123">Alice</a>! 🎂\n\n' +
        '🎉 Happy Birthday, <a href="tg://user?id=456">Bob</a>! 🎂';

      assert.equal(msg, expected);
    });

    test("birthdayAnnouncementMessage returns null for empty or non-array inputs", () => {
      assert.equal(birthdayAnnouncementMessage([]), null);
      assert.equal(birthdayAnnouncementMessage(null), null);
      assert.equal(birthdayAnnouncementMessage(undefined), null);
    });

    test("emptyGroupBirthdayListMessage formats empty state cleanly", () => {
      const msg = emptyGroupBirthdayListMessage("Book Club");
      assert.match(msg, /📅 <b>Birthdays for Book Club<\/b>/);
      assert.match(msg, /No birthdays registered in this group yet!/);
      assert.match(msg, /@BDPingBot/);
    });

    test("formatGroupBirthdayList sorts chronologically and escapes special characters", () => {
      const birthdays = [
        { name: "<Eve>", username: "eve_user", birth_month: 2, birth_day: 15 },
        { name: "Adam", username: null, birth_month: 1, birth_day: 10 },
      ];
      const msg = formatGroupBirthdayList("Genesis <Group>", birthdays);

      assert.match(msg, /🎂 <b>Birthdays in Genesis &lt;Group&gt;<\/b> \(2\)/);
      assert.match(msg, /🗓️ January/);
      assert.match(msg, /• <b>10 Jan<\/b> — Adam/);
      assert.match(msg, /🗓️ February/);
      assert.match(msg, /• <b>15 Feb<\/b> — &lt;Eve&gt; \(@eve_user\)/);
      assert.doesNotMatch(msg, /<Eve>/);
    });

    test("myBirthdaysListMessage displays user's registered birthdays across groups", () => {
      const registrations = [
        { groupTitle: "Alpha Team", birthMonth: 1, birthDay: 15 },
        { groupTitle: "Beta Team", birthMonth: 5, birthDay: 20 },
      ];
      const msg = myBirthdaysListMessage(registrations);

      assert.match(msg, /📅 <b>Your Registered Birthdays Across Groups:<\/b>/);
      assert.match(msg, /1\. <b>Alpha Team<\/b>: 15 Jan/);
      assert.match(msg, /2\. <b>Beta Team<\/b>: 20 May/);
      assert.match(msg, /\/editbirthday/);
      assert.match(msg, /\/deletebirthday/);
    });

    test("edit and delete messaging provides clear user actions", () => {
      const editPrompt = editBirthdayPromptMessage("Alpha", "15 Jan");
      assert.match(editPrompt, /Alpha/);
      assert.match(editPrompt, /15 Jan/);
      assert.match(editPrompt, /\/editbirthday &lt;new date&gt;/);

      const editSuccess = editBirthdaySuccessMessage("Alpha", "20 Feb");
      assert.match(editSuccess, /✅ <b>Birthday Updated!<\/b>/);
      assert.match(editSuccess, /20 Feb/);

      const delConfirm = deleteBirthdayConfirmMessage("Alpha", "15 Jan");
      assert.match(delConfirm, /⚠️ <b>Confirm Deletion<\/b>/);
      assert.match(delConfirm, /15 Jan/);
      assert.match(delConfirm, /You will no longer receive birthday announcements/);

      const delSuccess = deleteBirthdaySuccessMessage();
      assert.match(delSuccess, /🗑️ Your birthday record has been removed\./);
    });
  });

  // ==========================================
  // 4. Error Messages
  // ==========================================
  describe("4. Error Messages", () => {
    test("adminOnlyInviteErrorMessage politely restricts /invite to admins", () => {
      const msg = adminOnlyInviteErrorMessage();
      assert.match(msg, /⚠️ Only group administrators can request the registration invitation link\./);
    });

    test("groupNotActiveErrorMessage guides user to add bot first", () => {
      const msg = groupNotActiveErrorMessage();
      assert.match(msg, /⚠️ This group is not currently registered or active with BD Ping\./);
    });

    test("technical errors are non-blaming and reassuring", () => {
      assert.match(databaseErrorMessage(), /⚠️ Something went wrong on our end\. Please try again in a moment\./);
      assert.match(unknownErrorMessage(), /⚠️ Something unexpected happened\. Please try again\./);
      assert.match(invalidInviteLinkErrorMessage(), /⚠️ Invalid invitation link\./);
    });
  });

  // ==========================================
  // 5. Common & Shared Messages
  // ==========================================
  describe("5. Common & Shared Messages", () => {
    test("groupHelpMessage explains group commands and highlights private registration", () => {
      const msg = groupHelpMessage("BDPingBot");

      assert.match(msg, /🎉 <b>BD Ping — Group Commands<\/b>/);
      assert.match(msg, /\/birthdays/);
      assert.match(msg, /\/invite/);
      assert.match(msg, /\/ping/);
      assert.match(msg, /\/chatid/);
      assert.match(msg, /🔒 <b>Privacy Notice:<\/b>/);
      assert.match(msg, /@BDPingBot/);
    });

    test("privateHelpMessage lists birthday management commands and utility commands", () => {
      const msg = privateHelpMessage();

      assert.match(msg, /🎉 <b>BD Ping — Commands<\/b>/);
      assert.match(msg, /<b>Birthday Management \(Private\):<\/b>/);
      assert.match(msg, /\/birthday/);
      assert.match(msg, /\/mybirthday/);
      assert.match(msg, /\/editbirthday/);
      assert.match(msg, /\/deletebirthday/);
      assert.match(msg, /\/birthdays/);
      assert.match(msg, /<b>Utility Commands:<\/b>/);
    });

    test("privacy notices redirect group members directly to private bot chat", () => {
      assert.match(groupPrivacyNotice("BDPingBot"), /🔒 Birthday registration is private-only\. Please message me directly: @BDPingBot/);
      assert.match(groupManagementPrivacyNotice("BDPingBot"), /🔒 Birthday commands only work in private chat: @BDPingBot/);
    });

    test("groupInviteLinkMessage includes clickable link and admin pin recommendation", () => {
      const url = "https://t.me/BDPingBot?start=invite_-100123";
      const msg = groupInviteLinkMessage(url);

      assert.match(msg, /🔒 <b>Private Birthday Registration Link<\/b>/);
      assert.match(msg, /https:\/\/t\.me\/BDPingBot\?start=invite_-100123/);
      assert.match(msg, /Admins can pin this link/);
    });

    test("ping and chatid utilities reply accurately", () => {
      assert.match(pingReplyMessage(), /🏓 Pong! BD Ping is alive!/);
      assert.match(chatIdReplyMessage(123456), /This chat's ID is: 123456/);
    });

    test("unrecognizedPrivateTextMessage offers clear guidance", () => {
      const msg = unrecognizedPrivateTextMessage();

      assert.match(msg, /🎂 Welcome to BD Ping! I didn't recognize that message\./);
      assert.match(msg, /BD Ping invitation link/);
      assert.match(msg, /\/mybirthday/);
      assert.match(msg, /\/help/);
    });
  });

  // ==========================================
  // 6. Special Character Escaping & Defensive Robustness
  // ==========================================
  describe("6. Special Character Escaping & Defensive Robustness", () => {
    const specialChars = `<Script & "Rockers' Group">`;

    test("invalidDateMessage escapes special characters in errorDetail", () => {
      const msg = invalidDateMessage("Alpha Team", `Invalid date <test> & "quotes"`);
      assert.match(msg, /&lt;test&gt; &amp; &quot;quotes&quot;/);
      assert.doesNotMatch(msg, /<test>/);
    });

    test("editBirthdayInvalidFormatMessage escapes special characters in errorDetail and exampleCommand", () => {
      const msg = editBirthdayInvalidFormatMessage(`Error <with> & "bad" input`, `/edit <cmd> & test`);
      assert.match(msg, /&lt;with&gt; &amp; &quot;bad&quot;/);
      assert.match(msg, /&lt;cmd&gt; &amp; test/);
      assert.doesNotMatch(msg, /<with>/);
      assert.doesNotMatch(msg, /<cmd>/);
    });

    test("groupWelcomeMessage and groupInviteLinkMessage escape special characters in inviteUrl", () => {
      const dangerousUrl = "https://t.me/BDPingBot?start=invite_-100123&track=1<2>&auth='xyz'\"";
      
      const welcome = groupWelcomeMessage("Group", dangerousUrl);
      assert.match(welcome, /https:\/\/t\.me\/BDPingBot\?start=invite_-100123&amp;track=1&lt;2&gt;&amp;auth='xyz'&quot;/);
      assert.doesNotMatch(welcome, /1<2>/);

      const inviteLink = groupInviteLinkMessage(dangerousUrl);
      assert.match(inviteLink, /https:\/\/t\.me\/BDPingBot\?start=invite_-100123&amp;track=1&lt;2&gt;&amp;auth='xyz'&quot;/);
      assert.doesNotMatch(inviteLink, /1<2>/);
    });

    test("registrationSuccessMessage supports fallback name and escapes special characters in all fields", () => {
      const msg = registrationSuccessMessage(specialChars, "15 Jan", specialChars);
      assert.match(msg, /&lt;Script &amp; &quot;Rockers' Group&quot;&gt;/);
      assert.doesNotMatch(msg, /<Script/);

      const fallbackMsg = registrationSuccessMessage("", "15 Jan", "Group");
      assert.match(fallbackMsg, /👤 <b>Name:<\/b> Member/);
    });
  });
});
