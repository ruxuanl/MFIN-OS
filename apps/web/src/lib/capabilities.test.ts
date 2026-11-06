import { describe, expect, it } from "vitest";

import { evaluateCapabilities } from "./capabilities";

describe("evaluateCapabilities", () => {
  it("reports the full iPhone PWA capability set when every primitive exists", () => {
    expect(
      evaluateCapabilities({
        hasServiceWorker: true,
        hasPushManager: true,
        hasNotification: true,
        hasPublicKeyCredential: true,
        isStandalone: true
      })
    ).toEqual({
      install: "ready",
      offline: "supported",
      push: "supported",
      passkey: "supported"
    });
  });

  it("does not claim push support when service workers are missing", () => {
    const state = evaluateCapabilities({
      hasServiceWorker: false,
      hasPushManager: true,
      hasNotification: true,
      hasPublicKeyCredential: false,
      isStandalone: false
    });

    expect(state.push).toBe("unsupported");
    expect(state.offline).toBe("unsupported");
    expect(state.install).toBe("browser-only");
  });
});
