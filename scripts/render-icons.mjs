// Renders the PNG app icons from the brand SVGs in public/icons, using Playwright's Chromium.
// Usage: node scripts/render-icons.mjs   (after changing ovation-app-icon*.svg)
import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const jobs = [
  { src: "public/icons/ovation-app-icon.svg", out: "public/icons/icon-192.png", size: 192 },
  { src: "public/icons/ovation-app-icon.svg", out: "public/icons/icon-512.png", size: 512 },
  {
    src: "public/icons/ovation-app-icon-maskable.svg",
    out: "public/icons/icon-maskable-512.png",
    size: 512,
  },
  // iOS rounds the corners itself, so the apple-touch icon uses the full-bleed (maskable) art.
  { src: "public/icons/ovation-app-icon-maskable.svg", out: "src/app/apple-icon.png", size: 180 },
];

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const { src, out, size } of jobs) {
    const svg = await readFile(src, "utf8");
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
    );
    await writeFile(out, await page.locator("svg").screenshot({ omitBackground: true }));
    console.log(`${out} (${size}px)`);
  }
} finally {
  await browser.close();
}
