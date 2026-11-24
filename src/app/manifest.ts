import type { MetadataRoute } from "next";
import { strings } from "@/lib/strings";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: strings.app.name,
    short_name: strings.app.name,
    description: strings.app.tagline,
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    theme_color: "#2E2A72",
    background_color: "#FAF7F0",
    lang: "en",
    // Rendered from public/icons/ovation-app-icon*.svg by scripts/render-icons.mjs.
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
