import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function convertSvgToPng() {
  const svgPath = path.join(__dirname, 'annotron-logo-fixed.svg');
  const pngPath = path.join(__dirname, 'editors/vscode/icon.png');

  const svgContent = fs.readFileSync(svgPath, 'utf8');

  const browser = await chromium.launch();
  const context = await browser.createBrowserContext();
  const page = await context.newPage();

  // Set exact square viewport
  await page.setViewportSize({ width: 256, height: 256 });

  // Load SVG with transparent background
  await page.setContent(`
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { margin: 0; padding: 0; background: transparent; display: flex; align-items: center; justify-content: center; width: 256px; height: 256px; }
        svg { width: 100%; height: 100%; }
      </style>
    </head>
    <body>
      ${svgContent}
    </body>
    </html>
  `);

  await page.waitForTimeout(800);

  // Screenshot
  await page.screenshot({
    path: pngPath,
    omitBackground: true
  });

  await browser.close();

  const stats = fs.statSync(pngPath);
  console.log(`✅ Icon created: ${pngPath}`);
  console.log(`   Size: ${(stats.size / 1024).toFixed(1)} KB`);
  console.log(`   Ready for VS Code!`);
}

convertSvgToPng().catch(console.error);
