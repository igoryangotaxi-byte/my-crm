import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findMentionedUserIds } from "../lib/sales-operation/mentions.ts";

const USERS = [
  { id: "u1", name: "Alice Cohen" },
  { id: "u2", name: "Bob" },
  { id: "u3", name: "Carol Levi" },
];

describe("findMentionedUserIds", () => {
  it("returns nothing when there is no @", () => {
    assert.deepEqual(findMentionedUserIds("no mentions here", USERS), []);
  });

  it("matches first name and full name", () => {
    assert.deepEqual(findMentionedUserIds("hey @Alice please check", USERS), ["u1"]);
    assert.deepEqual(findMentionedUserIds("cc @Alice Cohen", USERS), ["u1"]);
  });

  it("matches multiple distinct users once each", () => {
    const result = findMentionedUserIds("@Bob and @Carol sync up", USERS).sort();
    assert.deepEqual(result, ["u2", "u3"]);
  });

  it("does not match partial tokens", () => {
    assert.deepEqual(findMentionedUserIds("email alice@example.com", USERS), []);
  });
});
