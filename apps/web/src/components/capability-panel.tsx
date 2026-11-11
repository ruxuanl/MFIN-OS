"use client";

import { useEffect, useState } from "react";

import { Icon } from "@/components/icon";
import { evaluateCapabilities, type CapabilityState } from "@/lib/capabilities";

const initialState: CapabilityState = {
  install: "browser-only",
  offline: "unsupported",
  push: "unsupported",
  passkey: "unsupported"
};

const labels: Record<keyof CapabilityState, { label: string; description: string }> = {
  install: { label: "主屏幕模式", description: "从 Safari 添加后获得独立应用窗口" },
  offline: { label: "短暂离线", description: "断网时展示安全离线壳，不缓存敏感页面" },
  push: { label: "Web Push", description: "仅用于高价值提醒，授权将在后续开启" },
  passkey: { label: "Passkey / Face ID", description: "实验能力，失败时回退到重新登录" }
};

export function CapabilityPanel() {
  const [state, setState] = useState<CapabilityState>(initialState);

  useEffect(() => {
    const media = window.matchMedia("(display-mode: standalone)");

    const updateCapabilities = () => {
      const standalone =
        media.matches ||
        ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone));

      setState(evaluateCapabilities({
        hasServiceWorker: "serviceWorker" in navigator,
        hasPushManager: "PushManager" in window,
        hasNotification: "Notification" in window,
        hasPublicKeyCredential: "PublicKeyCredential" in window,
        isStandalone: standalone
      }));
    };

    updateCapabilities();

    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", updateCapabilities);
    } else {
      media.addListener(updateCapabilities);
    }
    window.addEventListener("appinstalled", updateCapabilities);

    return () => {
      if (typeof media.removeEventListener === "function") {
        media.removeEventListener("change", updateCapabilities);
      } else {
        media.removeListener(updateCapabilities);
      }
      window.removeEventListener("appinstalled", updateCapabilities);
    };
  }, []);

  return (
    <div className="capability-grid">
      {(Object.keys(labels) as Array<keyof CapabilityState>).map((key) => {
        const value = state[key];
        const available = value === "supported" || value === "ready";
        return (
          <article className="capability-card" key={key}>
            <div className={`status-icon${available ? " is-ready" : ""}`}>
              <Icon name={available ? "check" : "arrow"} size={16} />
            </div>
            <div>
              <strong>{labels[key].label}</strong>
              <p>{labels[key].description}</p>
            </div>
            <span className={`status-pill${available ? " is-ready" : ""}`}>
              {available ? "可用" : key === "install" ? "浏览器中" : "不可用"}
            </span>
          </article>
        );
      })}
    </div>
  );
}
