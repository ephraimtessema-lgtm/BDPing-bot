import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseBirthdayInput, getMonthName } from "../src/utils/validation.js";

describe("[UNIT TEST] Date Parsing & Validation", () => {
  test("Parses standard numeric formats (DD/MM, DD-MM, DD.MM)", () => {
    const cases = [
      { input: "15/01", expectedMonth: 1, expectedDay: 15 },
      { input: "15/1", expectedMonth: 1, expectedDay: 15 },
      { input: "01/05", expectedMonth: 5, expectedDay: 1 },
      { input: "15-01", expectedMonth: 1, expectedDay: 15 },
      { input: "15.01", expectedMonth: 1, expectedDay: 15 },
      { input: "31/12", expectedMonth: 12, expectedDay: 31 },
    ];

    for (const c of cases) {
      const res = parseBirthdayInput(c.input);
      assert.equal(res.valid, true, `Should accept valid format: ${c.input}`);
      assert.equal(res.birthMonth, c.expectedMonth);
      assert.equal(res.birthDay, c.expectedDay);
    }
  });

  test("Discards optional year safely without storing", () => {
    const withYear = parseBirthdayInput("15/01/1995");
    assert.equal(withYear.valid, true);
    assert.equal(withYear.birthMonth, 1);
    assert.equal(withYear.birthDay, 15);

    const writtenWithYear = parseBirthdayInput("15 Jan 1995");
    assert.equal(writtenWithYear.valid, true);
    assert.equal(writtenWithYear.birthMonth, 1);
    assert.equal(writtenWithYear.birthDay, 15);
  });

  test("Parses natural language date formats ('15 Jan', 'Jan 15', '15 January')", () => {
    const cases = [
      { input: "15 Jan", expectedMonth: 1, expectedDay: 15 },
      { input: "Jan 15", expectedMonth: 1, expectedDay: 15 },
      { input: "15th January", expectedMonth: 1, expectedDay: 15 },
      { input: "1st March", expectedMonth: 3, expectedDay: 1 },
      { input: "March 1st", expectedMonth: 3, expectedDay: 1 },
      { input: "4 July", expectedMonth: 7, expectedDay: 4 },
      { input: "October 31", expectedMonth: 10, expectedDay: 31 },
    ];

    for (const c of cases) {
      const res = parseBirthdayInput(c.input);
      assert.equal(res.valid, true, `Should accept written date: ${c.input}`);
      assert.equal(res.birthMonth, c.expectedMonth);
      assert.equal(res.birthDay, c.expectedDay);
    }
  });

  test("Accepts February 29 for leap-year babies", () => {
    const feb29Num = parseBirthdayInput("29/02");
    assert.equal(feb29Num.valid, true, "29/02 must be accepted");
    assert.equal(feb29Num.birthMonth, 2);
    assert.equal(feb29Num.birthDay, 29);

    const feb29Text = parseBirthdayInput("29 Feb");
    assert.equal(feb29Text.valid, true, "29 Feb must be accepted");
    assert.equal(feb29Text.birthMonth, 2);
    assert.equal(feb29Text.birthDay, 29);
  });

  test("Rejects impossible February calendar dates (30 Feb, 31 Feb)", () => {
    const feb30 = parseBirthdayInput("30 Feb");
    assert.equal(feb30.valid, false, "30 Feb must be rejected");
    assert.match(feb30.error, /February has at most 29 days/);

    const feb31 = parseBirthdayInput("31/02");
    assert.equal(feb31.valid, false, "31/02 must be rejected");
    assert.match(feb31.error, /February has at most 29 days/);
  });

  test("Rejects impossible dates in 30-day months (31 Apr, 31 Jun, 31 Sep, 31 Nov)", () => {
    const apr31 = parseBirthdayInput("31 Apr");
    assert.equal(apr31.valid, false, "31 Apr must be rejected");
    assert.match(apr31.error, /April has only 30 days/);

    const jun31 = parseBirthdayInput("31/06");
    assert.equal(jun31.valid, false, "31/06 must be rejected");
    assert.match(jun31.error, /June has only 30 days/);

    const sep31 = parseBirthdayInput("31 Sep");
    assert.equal(sep31.valid, false, "31 Sep must be rejected");
    assert.match(sep31.error, /September has only 30 days/);

    const nov31 = parseBirthdayInput("31/11");
    assert.equal(nov31.valid, false, "31/11 must be rejected");
    assert.match(nov31.error, /November has only 30 days/);
  });

  test("Rejects day out of range (< 1 or > 31)", () => {
    const zeroDay = parseBirthdayInput("0 Jan");
    assert.equal(zeroDay.valid, false);
    assert.match(zeroDay.error, /Day must be 1 or greater/);

    const highDay = parseBirthdayInput("32 Jan");
    assert.equal(highDay.valid, false);
    assert.match(highDay.error, /January has only 31 days/);
  });

  test("Rejects non-date and malformed input gracefully", () => {
    assert.equal(parseBirthdayInput("").valid, false);
    assert.equal(parseBirthdayInput(null).valid, false);
    assert.equal(parseBirthdayInput("hello").valid, false);
    assert.equal(parseBirthdayInput("abc/xyz").valid, false);
  });

  test("getMonthName converts numeric month to label correctly", () => {
    assert.equal(getMonthName(1), "January");
    assert.equal(getMonthName(2), "February");
    assert.equal(getMonthName(12), "December");
    assert.equal(getMonthName(13), "Unknown");
  });
});
