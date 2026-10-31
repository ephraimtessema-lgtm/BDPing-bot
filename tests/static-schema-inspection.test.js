
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const migration001Path = path.resolve(
  __dirname,
  "../src/database/migrations/001_initial_schema.sql"
);

const migration002Path = path.resolve(
  __dirname,
  "../src/database/migrations/002_registration_atomicity.sql"
);

const sql001 = fs.readFileSync(migration001Path, "utf-8");
const sql002 = fs.readFileSync(migration002Path, "utf-8");

function assertSqlMatch(sql, regex, message) {
  assert.match(sql, regex, message);
}

describe("[STATIC INSPECTION] Database Migration 001 Schema & Constraints (v5)", () => {
  test("Defines all 5 core tables with strict schema declarations", () => {
    for (const table of [
      "groups",
      "birthdays",
      "announcement_logs",
      "announcement_log_birthdays",
      "registration_sessions",
    ]) {
      assertSqlMatch(
        sql001,
        new RegExp(
          `CREATE\\s+TABLE\\s+IF\\s+NOT\\s+EXISTS\\s+${table}\\b`,
          "i"
        ),
        `Must create ${table} table`
      );
    }
  });

  test("Groups table has primary key id and NO redundant uq_groups_id constraint", () => {
    assertSqlMatch(sql001, /id\s+BIGINT\s+PRIMARY\s+KEY/i);
    assert.doesNotMatch(sql001, /CONSTRAINT\s+uq_groups_id\s+UNIQUE/i);
  });

  test("Helper functions use bd_ping prefix", () => {
    assertSqlMatch(
      sql001,
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+bd_ping_set_updated_at\s*\(\s*\)/i
    );

    assertSqlMatch(
      sql001,
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+bd_ping_validate_group_timezone\s*\(\s*\)/i
    );

    assert.doesNotMatch(
      sql001,
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+set_updated_at\s*\(\s*\)/i
    );
  });

  test("Groups table has timezone validation trigger and default Africa/Addis_Ababa", () => {
    assertSqlMatch(
      sql001,
      /timezone\s+TEXT\s+NOT\s+NULL\s+DEFAULT\s+'Africa\/Addis_Ababa'/i
    );

    assertSqlMatch(
      sql001,
      /CREATE\s+TRIGGER\s+trg_groups_validate_timezone/i
    );

    assertSqlMatch(
      sql001,
      /AT\s+TIME\s+ZONE\s+NEW\.timezone/i
    );
  });

  test("Birthdays table enforces calendar validity and Feb 29 for leap years", () => {
    assertSqlMatch(
      sql001,
      /CONSTRAINT\s+chk_valid_calendar_day\s+CHECK/i
    );

    assertSqlMatch(
      sql001,
      /birth_month\s*=\s*2\s+AND\s+birth_day\s+BETWEEN\s+1\s+AND\s+29/i
    );
  });

  test("Birthdays table enforces group-level multi-tenant isolation", () => {
    assertSqlMatch(
      sql001,
      /CONSTRAINT\s+uq_group_user_birthday\s+UNIQUE\s*\(\s*group_id\s*,\s*telegram_user_id\s*\)/i
    );

    assertSqlMatch(
      sql001,
      /CONSTRAINT\s+uq_birthdays_id_group\s+UNIQUE\s*\(\s*id\s*,\s*group_id\s*\)/i
    );
  });

  test("Announcement logs enforce idempotency, lease fencing, backoff, and consistency constraints", () => {
    assertSqlMatch(
      sql001,
      /CONSTRAINT\s+uq_group_announcement_date\s+UNIQUE\s*\(\s*group_id\s*,\s*announcement_date\s*\)/i
    );

    assertSqlMatch(sql001, /claim_token\s+UUID/i);
    assertSqlMatch(sql001, /claimed_at\s+TIMESTAMPTZ/i);
    assertSqlMatch(sql001, /next_retry_at\s+TIMESTAMPTZ/i);

    assertSqlMatch(
      sql001,
      /CONSTRAINT\s+chk_sending_lease_consistency\s+CHECK\s*\(\s*status\s*!=\s*'sending'\s+OR\s+claim_token\s+IS\s+NOT\s+NULL\s*\)/i
    );

    assertSqlMatch(
      sql001,
      /CONSTRAINT\s+chk_sent_terminal\s+CHECK\s*\(\s*status\s*!=\s*'sent'\s+OR\s+sent_at\s+IS\s+NOT\s+NULL\s*\)/i
    );
  });

  test("Junction table enforces column-specific SET NULL for birthday_id", () => {
    assertSqlMatch(
      sql001,
      /FOREIGN\s+KEY\s*\(\s*announcement_log_id\s*,\s*group_id\s*\)\s+REFERENCES\s+announcement_logs\s*\(\s*id\s*,\s*group_id\s*\)\s+ON\s+DELETE\s+CASCADE/i
    );

    assertSqlMatch(
      sql001,
      /FOREIGN\s+KEY\s*\(\s*birthday_id\s*,\s*group_id\s*\)\s+REFERENCES\s+birthdays\s*\(\s*id\s*,\s*group_id\s*\)\s+ON\s+DELETE\s+SET\s+NULL\s*\(\s*birthday_id\s*\)/i
    );

    assertSqlMatch(
      sql001,
      /member_name_snapshot\s+TEXT\s+NOT\s+NULL/i
    );
  });

  test("Claim RPC enforces due time, lease fencing, and NULL lease handling", () => {
    assertSqlMatch(
      sql001,
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+bd_ping_claim_announcement_jobs/i
    );

    assertSqlMatch(
      sql001,
      /claimed_at\s+IS\s+NULL/i
    );

    assertSqlMatch(
      sql001,
      /AT\s+TIME\s+ZONE\s+g\.timezone/i
    );

    assertSqlMatch(
      sql001,
      /announcement_date\s*,\s*g\.announcement_time/i
    );

    assertSqlMatch(
      sql001,
      /claim_token\s*=\s*gen_random_uuid\s*\(\s*\)/i
    );

    assertSqlMatch(
      sql001,
      /FOR\s+UPDATE\s+SKIP\s+LOCKED/i
    );
  });

  test("Fenced completion RPC requires claim_token and applies backoff", () => {
    assertSqlMatch(
      sql001,
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+bd_ping_complete_announcement_job/i
    );

    assertSqlMatch(
      sql001,
      /claim_token\s*=\s*p_claim_token/i
    );

    assertSqlMatch(
      sql001,
      /POWER\s*\(\s*2\s*,\s*GREATEST\s*\(\s*v_retry_count\s*-\s*1\s*,\s*0\s*\)\s*\)/i
    );
  });

  test("RPC permissions are restricted to service_role and security invoker is used", () => {
    assert.doesNotMatch(sql001, /SECURITY\s+DEFINER/i);

    assertSqlMatch(
      sql001,
      /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+bd_ping_claim_announcement_jobs\s*\(\s*INTEGER\s*,\s*INTEGER\s*,\s*INTEGER\s*\)\s+FROM\s+PUBLIC;/i
    );

    assertSqlMatch(
      sql001,
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+bd_ping_claim_announcement_jobs\s*\(\s*INTEGER\s*,\s*INTEGER\s*,\s*INTEGER\s*\)\s+TO\s+service_role;/i
    );

    assertSqlMatch(
      sql001,
      /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+bd_ping_complete_announcement_job\s*\(\s*UUID\s*,\s*UUID\s*,\s*TEXT\s*,\s*BIGINT\s*,\s*TEXT\s*,\s*INTEGER\s*\)\s+FROM\s+PUBLIC;/i
    );

    assertSqlMatch(
      sql001,
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+bd_ping_complete_announcement_job\s*\(\s*UUID\s*,\s*UUID\s*,\s*TEXT\s*,\s*BIGINT\s*,\s*TEXT\s*,\s*INTEGER\s*\)\s+TO\s+service_role;/i
    );
  });

  test("RLS is enabled with default-deny policies on all 5 tables", () => {
    const tables = [
      "groups",
      "birthdays",
      "announcement_logs",
      "announcement_log_birthdays",
      "registration_sessions",
    ];

    for (const table of tables) {
      assertSqlMatch(
        sql001,
        new RegExp(
          `ALTER\\s+TABLE\\s+(?:public\\.)?${table}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY\\s*;`,
          "i"
        ),
        `${table} must have RLS enabled`
      );

      assertSqlMatch(
        sql001,
        new RegExp(
          `CREATE\\s+POLICY\\s+"Deny public access on ${table}"\\s+ON\\s+(?:public\\.)?${table}\\s+FOR\\s+ALL\\s+USING\\s*\\(\\s*false\\s*\\)`,
          "i"
        ),
        `${table} must have default-deny policy`
      );
    }
  });
});

describe("[STATIC INSPECTION] Database Migration 002 Registration Atomicity", () => {
  test("Defines unique pending session index per Telegram user across all groups", () => {
    assertSqlMatch(
      sql002,
      /CREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+uq_user_pending_session\s+ON\s+public\.registration_sessions\s*\(\s*telegram_user_id\s*\)\s+WHERE\s+status\s*=\s*'pending';/i
    );
  });

  test("Defines atomic session creation function bd_ping_create_registration_session", () => {
    assertSqlMatch(
      sql002,
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.bd_ping_create_registration_session/i
    );

    assertSqlMatch(
      sql002,
      /SET\s+status\s*=\s*'expired'/i
    );

    assertSqlMatch(
      sql002,
      /pg_advisory_xact_lock\s*\(\s*p_telegram_user_id\s*\)/i
    );

    assertSqlMatch(
      sql002,
      /SET\s+search_path\s*=\s*public\s*,\s*pg_temp\s*;/i
    );

    // Match the complete GRANT statement across line breaks.
    assertSqlMatch(
      sql002,
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.bd_ping_create_registration_session\s*\(\s*TEXT\s*,\s*BIGINT\s*,\s*BIGINT\s*,\s*INTEGER\s*\)\s+TO\s+service_role\s*;/i,
      "Must grant execution to service_role"
    );
  });

  test("Defines atomic registration completion function without overwriting existing birthdays", () => {
    assertSqlMatch(
      sql002,
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.bd_ping_complete_registration/i
    );

    assertSqlMatch(
      sql002,
      /FOR\s+UPDATE/i
    );

    assertSqlMatch(
      sql002,
      /v_session\.expires_at\s*<=\s*now\s*\(\s*\)/i
    );

    // IS DISTINCT FROM safely checks ownership, including NULL cases.
    assertSqlMatch(
      sql002,
      /v_session\.telegram_user_id\s+IS\s+DISTINCT\s+FROM\s+p_telegram_user_id/i,
      "Must verify user ownership"
    );

    assertSqlMatch(
      sql002,
      /ON\s+CONFLICT\s*\(\s*group_id\s*,\s*telegram_user_id\s*\)\s+DO\s+NOTHING/i,
      "Must avoid overwriting an existing birthday"
    );

    assert.doesNotMatch(
      sql002,
      /ON\s+CONFLICT[\s\S]*?DO\s+UPDATE/i,
      "Must NOT overwrite existing birthday on registration"
    );

    assertSqlMatch(
      sql002,
      /SET\s+search_path\s*=\s*public\s*,\s*pg_temp\s*;/i
    );

    assertSqlMatch(
      sql002,
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.bd_ping_complete_registration\s*\(\s*TEXT\s*,\s*BIGINT\s*,\s*TEXT\s*,\s*TEXT\s*,\s*SMALLINT\s*,\s*SMALLINT\s*\)\s+TO\s+service_role\s*;/i,
      "Must grant execution to service_role"
    );
  });
});
