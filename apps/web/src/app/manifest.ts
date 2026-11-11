import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MFin OS · Personal Workspace",
    short_name: "MFin OS",
    description: "港大 MFin 学业与求职个人系统",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f3f0e8",
    theme_color: "#173d33",
    orientation: "portrait-primary",
    categories: ["productivity", "education"],
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable"
      }
    ]
  };
}
