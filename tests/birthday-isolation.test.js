import { test, describe } from "node:test";
import assert from "node:assert/strict";

describe("[DOMAIN TEST] Multi-Group Birthday Isolation", () => {
  // Simulates database repository with strict query scoping
  class MockBirthdayRepository {
    constructor() {
      this.records = new Map(); // key: `${group_id}_${user_id}`
    }

    insert({ groupId, userId, name, birthMonth, birthDay }) {
      const key = `${groupId}_${userId}`;
      if (this.records.has(key)) {
        throw new Error("UNIQUE_VIOLATION");
      }
      const record = { id: `id-${Math.random()}`, groupId, userId, name, birthMonth, birthDay };
      this.records.set(key, record);
      return record;
    }

    getByUserAndGroup(groupId, userId) {
      return this.records.get(`${groupId}_${userId}`) || null;
    }

    updateByUserAndGroup(groupId, userId, { birthMonth, birthDay }) {
      const key = `${groupId}_${userId}`;
      const record = this.records.get(key);
      if (!record) return null;
      record.birthMonth = birthMonth;
      record.birthDay = birthDay;
      return record;
    }

    deleteByUserAndGroup(groupId, userId) {
      const key = `${groupId}_${userId}`;
      return this.records.delete(key);
    }

    listByGroup(groupId) {
      const list = [];
      for (const record of this.records.values()) {
        if (record.groupId === groupId) {
          list.push(record);
        }
      }
      return list.sort((a, b) => a.birthMonth - b.birthMonth || a.birthDay - b.birthDay);
    }

    listUserRegistrations(userId) {
      const list = [];
      for (const record of this.records.values()) {
        if (record.userId === userId) {
          list.push(record);
        }
      }
      return list;
    }
  }

  test("Records in Group Alpha never leak into Group Beta", () => {
    const repo = new MockBirthdayRepository();
    const groupAlpha = -100111n;
    const groupBeta = -100222n;
    const userAlice = 11111n;

    repo.insert({ groupId: groupAlpha, userId: userAlice, name: "Alice", birthMonth: 5, birthDay: 14 });

    // Query Group Beta
    const betaList = repo.listByGroup(groupBeta);
    assert.equal(betaList.length, 0, "Group Beta must NOT contain Group Alpha's members");

    const betaAlice = repo.getByUserAndGroup(groupBeta, userAlice);
    assert.equal(betaAlice, null, "Alice must not be registered in Group Beta");

    // Query Group Alpha
    const alphaList = repo.listByGroup(groupAlpha);
    assert.equal(alphaList.length, 1);
    assert.equal(alphaList[0].name, "Alice");
  });

  test("Same user can register independently in multiple groups", () => {
    const repo = new MockBirthdayRepository();
    const groupAlpha = -100111n;
    const groupBeta = -100222n;
    const userAlice = 11111n;

    // Alice registers in both groups
    repo.insert({ groupId: groupAlpha, userId: userAlice, name: "Alice Alpha", birthMonth: 5, birthDay: 14 });
    repo.insert({ groupId: groupBeta, userId: userAlice, name: "Alice Beta", birthMonth: 5, birthDay: 14 });

    assert.ok(repo.getByUserAndGroup(groupAlpha, userAlice));
    assert.ok(repo.getByUserAndGroup(groupBeta, userAlice));

    // Multi-group listing returns both
    const registrations = repo.listUserRegistrations(userAlice);
    assert.equal(registrations.length, 2);
  });

  test("Editing a birthday in Group Alpha leaves Group Beta completely untouched", () => {
    const repo = new MockBirthdayRepository();
    const groupAlpha = -100111n;
    const groupBeta = -100222n;
    const userAlice = 11111n;

    repo.insert({ groupId: groupAlpha, userId: userAlice, name: "Alice", birthMonth: 5, birthDay: 14 });
    repo.insert({ groupId: groupBeta, userId: userAlice, name: "Alice", birthMonth: 5, birthDay: 14 });

    // Update in Alpha to 20 June
    repo.updateByUserAndGroup(groupAlpha, userAlice, { birthMonth: 6, birthDay: 20 });

    const alphaRecord = repo.getByUserAndGroup(groupAlpha, userAlice);
    const betaRecord = repo.getByUserAndGroup(groupBeta, userAlice);

    assert.equal(alphaRecord.birthMonth, 6);
    assert.equal(alphaRecord.birthDay, 20);

    // Beta record must remain 14 May
    assert.equal(betaRecord.birthMonth, 5);
    assert.equal(betaRecord.birthDay, 14);
  });

  test("Deleting a birthday in Group Alpha leaves Group Beta intact", () => {
    const repo = new MockBirthdayRepository();
    const groupAlpha = -100111n;
    const groupBeta = -100222n;
    const userAlice = 11111n;

    repo.insert({ groupId: groupAlpha, userId: userAlice, name: "Alice", birthMonth: 5, birthDay: 14 });
    repo.insert({ groupId: groupBeta, userId: userAlice, name: "Alice", birthMonth: 5, birthDay: 14 });

    // Delete in Alpha
    const deleted = repo.deleteByUserAndGroup(groupAlpha, userAlice);
    assert.equal(deleted, true);

    assert.equal(repo.getByUserAndGroup(groupAlpha, userAlice), null);
    assert.ok(repo.getByUserAndGroup(groupBeta, userAlice), "Beta record must remain intact");
  });

  test("listByGroup orders birthdays chronologically by calendar date", () => {
    const repo = new MockBirthdayRepository();
    const groupId = -100111n;

    repo.insert({ groupId, userId: 1n, name: "Charlie", birthMonth: 12, birthDay: 25 });
    repo.insert({ groupId, userId: 2n, name: "Alice", birthMonth: 1, birthDay: 15 });
    repo.insert({ groupId, userId: 3n, name: "Bob", birthMonth: 5, birthDay: 1 });
    repo.insert({ groupId, userId: 4n, name: "David", birthMonth: 1, birthDay: 5 });

    const sorted = repo.listByGroup(groupId);
    assert.equal(sorted.length, 4);
    assert.equal(sorted[0].name, "David"); // 5 Jan
    assert.equal(sorted[1].name, "Alice"); // 15 Jan
    assert.equal(sorted[2].name, "Bob");   // 1 May
    assert.equal(sorted[3].name, "Charlie"); // 25 Dec
  });
});
