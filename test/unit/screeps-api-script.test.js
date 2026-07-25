import { afterEach, describe, expect, test } from "vitest";

import { readConfig } from "../../scripts/screeps-api.mjs";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("Screeps API script config", () => {
  test("uses the official Screeps host when SCREEPS_HOST is unset or blank", () => {
    process.env.SCREEPS_TOKEN = "token";
    delete process.env.SCREEPS_HOST;

    expect(readConfig().host).toBe("https://screeps.com");

    process.env.SCREEPS_HOST = "";
    expect(readConfig().host).toBe("https://screeps.com");

    process.env.SCREEPS_HOST = "   ";
    expect(readConfig().host).toBe("https://screeps.com");
  });

  test("normalizes an explicit host by trimming whitespace and trailing slash", () => {
    process.env.SCREEPS_TOKEN = "token";
    process.env.SCREEPS_HOST = " https://screeps.com/ ";

    expect(readConfig().host).toBe("https://screeps.com");
  });
});
