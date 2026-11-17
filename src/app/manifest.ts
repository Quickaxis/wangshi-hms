import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "HOSPIRO - Hotel Management System",
    short_name: "HOSPIRO",
    description: "Next-Generation Property & Hotel Management System for Homestays",
    start_url: "/",
    display: "standalone",
    background_color: "#F7F6FC",
    theme_color: "#5146D8",
    icons: [
      {
        src: "/logos/faviconapplogo.png",
        sizes: "1254x1254",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/logos/faviconapplogo.png",
        sizes: "1254x1254",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

