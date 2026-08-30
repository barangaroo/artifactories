import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.PUBLIC_BASE_URL ?? "http://localhost:3000";
  return [
    { url: base, lastModified: new Date(), changeFrequency: "hourly", priority: 1 },
    { url: `${base}/skill.md`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/openapi.json`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.8 },
  ];
}
