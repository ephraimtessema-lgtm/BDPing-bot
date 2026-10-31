import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { generateRegistrationToken, hashRegistrationToken } from "../src/utils/crypto.js";

describe("[UNIT TEST] Registration Token Security & Cryptography", () => {
  test("generateRegistrationToken produces URL-safe strings within Telegram start parameter limits", () => {
    const token = generateRegistrationToken();
    assert.equal(typeof token, "string");
    assert.ok(token.length > 20, "Token should have at least 128 bits of entropy");
    // Telegram start parameters must be 1-64 characters and URL safe ([A-Za-z0-9_-])
    assert.ok(token.length <= 64, `Token length (${token.length}) must fit in Telegram 64-char limit`);
    assert.match(token, /^[A-Za-z0-9_-]+$/, "Token must be base64url encoded for clean deep linking");
  });

  test("generateRegistrationToken produces unique cryptographically random tokens", () => {
    const tokens = new Set();
    for (let i = 0; i < 50; i++) {
      const token = generateRegistrationToken();
      assert.equal(tokens.has(token), false, "Generated tokens must be unique");
      tokens.add(token);
    }
  });

  test("hashRegistrationToken produces deterministic SHA-256 hex hashes", () => {
    const token = "sample_test_token_12345";
    const hash1 = hashRegistrationToken(token);
    const hash2 = hashRegistrationToken(token);

    assert.equal(hash1, hash2, "Hashing must be deterministic");
    assert.equal(hash1.length, 64, "SHA-256 hash must be 64 hex characters (256 bits)");
    assert.match(hash1, /^[0-9a-f]{64}$/, "Hash must be lowercase hex");
    assert.notEqual(token, hash1, "Hash must never match plaintext token");
  });

  test("Different tokens produce completely distinct hashes", () => {
    const hashA = hashRegistrationToken(generateRegistrationToken());
    const hashB = hashRegistrationToken(generateRegistrationToken());
    assert.notEqual(hashA, hashB);
  });
});
