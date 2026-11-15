import { describe, expect, it } from "vitest";
import { parseRadarSourceTime, radarSourceTime, radarTimeLabel } from "./radar-source-time";
const observed = new Date("2026-11-15T04:00:00Z");
describe("source publication and update times", () => {
  it("uses explicit source publication and update dates ahead of provider estimates", () => {
    expect(parseRadarSourceTime("2020-01-01", "更新时间：2026年11月14日 19:00", observed)).toEqual({ from:"2026-11-14", to:"2026-11-14", basis:"updated", approximate:false });
    expect(parseRadarSourceTime(null, "发布时间：2026-11-13", observed)?.basis).toBe("published");
  });
  it("shows a bounded range for days ago and preserves the observation anchor", () => {
    const time = parseRadarSourceTime(null, "Research Intern\n2 days ago", observed);
    expect(time).toEqual({ from:"2026-11-12", to:"2026-11-13", basis:"relative", approximate:true });
    expect(radarSourceTime({ evidence:"2 days ago", discoveredAt:observed.toISOString() })).toEqual(time);
    expect(radarTimeLabel(time).value).toBe("2026-11-12 至 2026-11-13");
  });
  it("uses source time rather than first discovery or application deadline", () => {
    expect(radarSourceTime({ evidence:"截止日期：2026-11-20", discoveredAt:observed.toISOString() })).toBeNull();
    expect(radarSourceTime({ evidence:"No published date", discoveredAt:observed.toISOString() })).toBeNull();
    expect(radarSourceTime({ evidence:"2 days ago" })).toBeNull();
    expect(radarTimeLabel(null).value).toBe("来源未提供日期");
  });
  it("handles Chinese relative dates, today and hours with the China timezone", () => {
    expect(parseRadarSourceTime(null,"发表于昨天",observed)?.from).toBe("2026-11-14");
    expect(parseRadarSourceTime(null,"三天前",observed)?.to).toBe("2026-11-12");
    expect(parseRadarSourceTime(null,"Updated 3 hours ago",new Date("2026-11-14T17:00:00Z"))?.from).toBe("2026-11-14");
  });
  it("labels provider estimates and rejects impossible calendar dates", () => {
    expect(parseRadarSourceTime("2026-11-14T08:00:00Z", "", observed)?.basis).toBe("provider");
    expect(parseRadarSourceTime(null,"发布日期：2026-02-31",observed)).toBeNull();
  });
});
