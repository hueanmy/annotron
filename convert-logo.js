import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function convertSvgToPng() {
  const svgPath = path.join(__dirname, 'annotron-logo.svg');
  const pngPath = path.join(__dirname, 'editors/vscode/icon.png');

  const svgContent = fs.readFileSync(svgPath, 'utf8');

  const browser = await chromium.launch();
  const context = await browser.createBrowserContext();
  const page = await context.newPage();

  // Set viewport to 128x128 for icon
  await page.setViewportSize({ width: 128, height: 128 });

  // Load SVG
  await page.setContent(`
    <html>
      <body style="margin:0;padding:0;background:transparent;">
        ${svgContent}
      </body>
    </html>
  `);

  // Wait for render
  await page.waitForTimeout(500);

  // Screenshot as PNG
  await page.screenshot({
    path: pngPath,
    omitBackground: true,
    scale: 2 // 256x256 for better quality
  });

  await browser.close();

  const stats = fs.statSync(pngPath);
  console.log(`✅ Icon created: ${pngPath}`);
  console.log(`   Size: ${(stats.size / 1024).toFixed(1)} KB`);
  console.log(`   Dimensions: 256x256 px (retina)`);
}

convertSvgToPng().catch(console.error);
