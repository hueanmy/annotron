#!/usr/bin/env node
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function convertSvgToPng() {
  try {
    const svgPath = path.join(__dirname, 'editors/vscode/icon.svg');
    const pngPath = path.join(__dirname, 'editors/vscode/icon.png');

    console.log(`📖 Reading SVG from: ${svgPath}`);
    const svgContent = fs.readFileSync(svgPath, 'utf8');

    console.log(`🚀 Launching browser...`);
    const browser = await chromium.launch();

    console.log(`📄 Creating page...`);
    const page = await browser.newPage();

    // Set viewport to square for the lockup
    await page.setViewportSize({ width: 360, height: 300 });

    // Load SVG content
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { margin: 0; padding: 0; background: white; display: flex; align-items: center; justify-content: center; }
          svg { max-width: 100%; max-height: 100%; }
        </style>
      </head>
      <body>
        ${svgContent}
      </body>
      </html>
    `;

    console.log(`📝 Setting content...`);
    await page.setContent(htmlContent);

    console.log(`⏳ Waiting for render...`);
    await page.waitForTimeout(1000);

    console.log(`📸 Taking screenshot...`);
    await page.screenshot({
      path: pngPath,
      omitBackground: false
    });

    await browser.close();

    const stats = fs.statSync(pngPath);
    console.log(`✅ Icon PNG created: ${pngPath}`);
    console.log(`   Size: ${(stats.size / 1024).toFixed(1)} KB`);
    console.log(`   Ready for VS Code extension!`);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

convertSvgToPng();
