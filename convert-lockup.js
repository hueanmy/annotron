import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function convertSvgToPng() {
  const svgPath = path.join(__dirname, 'editors/vscode/icon.svg');
  const pngPath = path.join(__dirname, 'editors/vscode/icon.png');

  const svgContent = fs.readFileSync(svgPath, 'utf8');

  const browser = await chromium.launch();
  const context = await browser.createBrowserContext();
  const page = await context.newPage();

  await page.setViewportSize({ width: 360, height: 300 });

  await page.setContent(`
    <!DOCTYPE html>
    <html>
    <body style="margin:0;padding:0;background:white;">
      ${svgContent}
    </body>
    </html>
  `);

  await page.waitForTimeout(500);

  await page.screenshot({
    path: pngPath,
    omitBackground: false
  });

  await browser.close();

  const stats = fs.statSync(pngPath);
  console.log(`✅ Icon PNG created: ${pngPath}`);
  console.log(`   Size: ${(stats.size / 1024).toFixed(1)} KB`);
}

convertSvgToPng().catch(console.error);
