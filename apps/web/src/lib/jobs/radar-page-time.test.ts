import { describe, expect, it, vi } from "vitest";
import { extractPageSourceTime, publicPageAddress } from "./radar-page-time";
vi.mock("server-only",()=>({}));
describe("source link publication and update dates",()=>{
  it("extracts page metadata, structured dates and link Last-Modified",()=>{
    expect(extractPageSourceTime('<meta content="2026-11-13T08:00:00+08:00" property="article:published_time">',null,"https://example.com/jobs/1")?.from).toBe("2026-11-13");
    expect(extractPageSourceTime('<script type="application/ld+json">{"dateModified":"2026-11-14"}</script>',null,"https://example.com/jobs/1")?.basis).toBe("updated");
    expect(extractPageSourceTime('',"Fri, 13 Nov 2026 08:00:00 GMT","https://example.com/jobs/1")).toMatchObject({from:"2026-11-13",basis:"updated",reference:"链接页 Last-Modified"});
  });
  it("uses article time for public posts and never makes up a date from an HTTP response time",()=>{
    const timestamp=Math.floor(new Date("2026-11-13T08:00:00Z").getTime()/1000);
    expect(extractPageSourceTime(`var ct = "${timestamp}";`,null,"https://mp.weixin.qq.com/s/test")?.from).toBe("2026-11-13");
    expect(extractPageSourceTime('<p>No date</p>',null,"https://example.com/jobs/1")).toBeNull();
  });
  it("blocks localhost, private addresses, link-local and IPv4-mapped IPv6",()=>{
    for(const ip of ["127.0.0.1","10.0.0.1","192.168.0.1","172.17.0.1","169.254.169.254","::1","::ffff:127.0.0.1","fc00::1"])expect(publicPageAddress(ip)).toBe(false);
    expect(publicPageAddress("8.8.8.8")).toBe(true);
  });
});
