import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Aether Forge",
    short_name: "Aether",
    description: "Mint Relics. Forge Looms. Hold to mine $AETHER.",
    start_url: "/",
    display: "standalone",
    background_color: "#070609",
    theme_color: "#070609",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
