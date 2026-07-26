import { describe, expect, test } from "vitest";

import {
  createPrivateTestingConfig,
  isOfficialScreepsEndpoint
} from "../../src/private-testing/config.js";

describe("private testing configuration", () => {
  test("builds a normalized localhost configuration with safe defaults", () => {
    const config = createPrivateTestingConfig({
      SCREEPS_TARGET: "private",
      SCREEPS_PRIVATE_TESTING: "true"
    });

    expect(config).toEqual({
      protocol: "http",
      host: "127.0.0.1",
      port: 21025,
      cliPort: 21026,
      endpoint: "http://127.0.0.1:21025",
      username: "agentic-bot",
      password: "agentic-local-password",
      branch: "private-combat",
      dataDir: ".screeps-private",
      preserveWorld: false
    });
  });

  test("requires an explicit marker before destructive private testing commands", () => {
    expect(() =>
      createPrivateTestingConfig({ SCREEPS_TARGET: "private" }, { destructive: true })
    ).toThrow(/SCREEPS_PRIVATE_TESTING=true/);
  });

  test("requires the private target before reading private configuration", () => {
    expect(() =>
      createPrivateTestingConfig({
        SCREEPS_PRIVATE_TESTING: "true"
      })
    ).toThrow(/SCREEPS_TARGET=private/);
  });

  test("refuses official Screeps endpoints even when the local marker is set", () => {
    expect(isOfficialScreepsEndpoint("https://screeps.com")).toBe(true);
    expect(isOfficialScreepsEndpoint("https://screeps.com/")).toBe(true);
    expect(isOfficialScreepsEndpoint("https://screeps.com:443")).toBe(true);
    expect(isOfficialScreepsEndpoint("https://screeps.example")).toBe(false);

    expect(() =>
      createPrivateTestingConfig({
        SCREEPS_TARGET: "private",
        SCREEPS_PRIVATE_TESTING: "true",
        SCREEPS_PRIVATE_HOST: "screeps.com"
      })
    ).toThrow(/official Screeps endpoint/);
  });

  test("allows public deployment configuration to coexist when private target is explicit", () => {
    const config = createPrivateTestingConfig({
      SCREEPS_TARGET: "private",
      SCREEPS_PRIVATE_TESTING: "true",
      SCREEPS_TOKEN: "prod-secret-token"
    });

    expect(config.endpoint).toBe("http://127.0.0.1:21025");
  });

  test("parses explicit local settings and trims endpoint slashes", () => {
    const config = createPrivateTestingConfig({
      SCREEPS_TARGET: "private",
      SCREEPS_PRIVATE_TESTING: "true",
      SCREEPS_PRIVATE_PROTOCOL: "http:",
      SCREEPS_PRIVATE_HOST: "localhost/",
      SCREEPS_PRIVATE_PORT: "32125",
      SCREEPS_PRIVATE_CLI_PORT: "32126",
      SCREEPS_PRIVATE_USERNAME: "bot",
      SCREEPS_PRIVATE_PASSWORD: "pw",
      SCREEPS_PRIVATE_BRANCH: "private-branch",
      SCREEPS_PRIVATE_DATA_DIR: ".tmp/private",
      SCREEPS_PRIVATE_PRESERVE_WORLD: "true"
    });

    expect(config.endpoint).toBe("http://localhost:32125");
    expect(config.cliPort).toBe(32126);
    expect(config.preserveWorld).toBe(true);
  });
});
