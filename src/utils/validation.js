/**
 * Date validation and parsing utilities for BD Ping (@BDPingBot)
 * 
 * Requirements:
 * - Collect only birthday month and day (no birth year)
 * - Support DD/MM, DD-MM, DD.MM
 * - Support natural language: "15 Jan", "Jan 15", "15 January", "January 15"
 * - Permissive with optional year (discards year safely without storing)
 * - Validate February 29 (leap-year babies)
 * - Reject impossible calendar dates (e.g. 30 Feb, 31 Apr)
 */

const MONTH_NAMES = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, september: 9, sept: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

const DAYS_IN_MONTH = {
  1: 31,  // January
  2: 29,  // February (allows Feb 29 for leaplings)
  3: 31,  // March
  4: 30,  // April
  5: 31,  // May
  6: 30,  // June
  7: 31,  // July
  8: 31,  // August
  9: 30,  // September
  10: 31, // October
  11: 30, // November
  12: 31, // December
};

const MONTH_LABELS = {
  1: "January",
  2: "February",
  3: "March",
  4: "April",
  5: "May",
  6: "June",
  7: "July",
  8: "August",
  9: "September",
  10: "October",
  11: "November",
  12: "December",
};

/**
 * Parses and validates a user-entered birthday string.
 * @param {string} input Raw text input from user (e.g. "15 Jan", "15/01", "29 Feb")
 * @returns {{ valid: boolean, birthMonth?: number, birthDay?: number, error?: string }}
 */
export function parseBirthdayInput(input) {
  if (!input || typeof input !== "string") {
    return {
      valid: false,
      error: "Please provide a birthday, for example: `15 Jan` or `15/01`.",
    };
  }

  const clean = input.trim().toLowerCase();

  let day = null;
  let month = null;

  // 1. Check numeric formats: DD/MM, DD-MM, DD.MM (with optional year DD/MM/YYYY)
  const numericMatch = clean.match(/^(\d{1,2})[\/\-\.](\d{1,2})(?:[\/\-\.]\d{2,4})?$/);
  if (numericMatch) {
    day = parseInt(numericMatch[1], 10);
    month = parseInt(numericMatch[2], 10);
  }

  // 2. Check "15 Jan" or "15 January" (with optional year "15 Jan 1995")
  if (day === null || month === null) {
    const dayFirstMatch = clean.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)(?:\s+\d{2,4})?$/);
    if (dayFirstMatch) {
      const parsedDay = parseInt(dayFirstMatch[1], 10);
      const parsedMonthStr = dayFirstMatch[2];
      if (MONTH_NAMES[parsedMonthStr]) {
        day = parsedDay;
        month = MONTH_NAMES[parsedMonthStr];
      }
    }
  }

  // 3. Check "Jan 15" or "January 15" (with optional year "Jan 15 1995" or "Jan 15, 1995")
  if (day === null || month === null) {
    const monthFirstMatch = clean.match(/^([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+\d{2,4})?$/);
    if (monthFirstMatch) {
      const parsedMonthStr = monthFirstMatch[1];
      const parsedDay = parseInt(monthFirstMatch[2], 10);
      if (MONTH_NAMES[parsedMonthStr]) {
        day = parsedDay;
        month = MONTH_NAMES[parsedMonthStr];
      }
    }
  }

  // If no pattern matched
  if (day === null || month === null) {
    return {
      valid: false,
      error: "Invalid date format. Please use DD/MM (e.g. `15/01`) or written format (e.g. `15 Jan`).",
    };
  }

  // Validate month range
  if (month < 1 || month > 12) {
    return {
      valid: false,
      error: "Month must be between 1 and 12.",
    };
  }

  // Validate day range
  if (day < 1) {
    return {
      valid: false,
      error: "Day must be 1 or greater.",
    };
  }

  const maxDays = DAYS_IN_MONTH[month];
  if (day > maxDays) {
    const monthName = MONTH_LABELS[month];
    if (month === 2) {
      return {
        valid: false,
        error: `February has at most 29 days (entered: ${day}).`,
      };
    }
    return {
      valid: false,
      error: `${monthName} has only ${maxDays} days (entered: ${day}).`,
    };
  }

  return {
    valid: true,
    birthMonth: month,
    birthDay: day,
  };
}

/**
 * Returns human-readable label for a month (1 -> "January").
 * @param {number} month Month number (1-12)
 * @returns {string}
 */
export function getMonthName(month) {
  return MONTH_LABELS[month] || "Unknown";
}
