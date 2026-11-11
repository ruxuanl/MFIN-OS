export type CapabilityInput = {
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  hasNotification: boolean;
  hasPublicKeyCredential: boolean;
  isStandalone: boolean;
};

export type CapabilityState = {
  install: "ready" | "browser-only";
  offline: "supported" | "unsupported";
  push: "supported" | "unsupported";
  passkey: "supported" | "unsupported";
};

export function evaluateCapabilities(input: CapabilityInput): CapabilityState {
  return {
    install: input.isStandalone ? "ready" : "browser-only",
    offline: input.hasServiceWorker ? "supported" : "unsupported",
    push:
      input.hasServiceWorker && input.hasPushManager && input.hasNotification
        ? "supported"
        : "unsupported",
    passkey: input.hasPublicKeyCredential ? "supported" : "unsupported"
  };
}
