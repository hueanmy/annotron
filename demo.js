#!/usr/bin/env node
/**
 * annotron — Automated demo script with screen recording
 * Records all features: outline navigation, annotations, agent loop, etc.
 *
 * Usage: node demo.js
 */

import { chromium } from 'playwright';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEMO_FILE = path.join(__dirname, 'architecture-demo.md');
const VIDEO_OUTPUT = path.join(__dirname, 'docs', 'annotron-demo-v2.webm');

// Ensure docs dir exists
if (!fs.existsSync(path.join(__dirname, 'docs'))) {
  fs.mkdirSync(path.join(__dirname, 'docs'), { recursive: true });
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function runDemo() {
  console.log('📹 Starting annotron demo recording...\n');

  // ── DEMO 0: Quick mention of VS Code extension ──
  console.log('0️⃣  VS Code Extension workflow:');
  console.log('   • Install: right-click .md/.html → "Open in annotron"');
  console.log('   • Browser opens automatically with full agent loop');
  console.log('   • Same features as CLI: outline, annotations, auto-apply\n');

  // Start server + agent via CLI
  const serverProcess = spawn('node', ['bin/annotron', DEMO_FILE, '--agent'], {
    cwd: __dirname,
    stdio: 'pipe',
  });

  let serverReady = false;
  serverProcess.stdout.on('data', (data) => {
    const output = data.toString();
    if (output.includes('Editor URL')) {
      serverReady = true;
      console.log('✓ Server started');
    }
  });

  serverProcess.stderr.on('data', (data) => {
    console.error('[server]', data.toString());
  });

  // Wait for server
  let attempts = 0;
  while (!serverReady && attempts < 30) {
    await sleep(200);
    attempts++;
  }

  if (!serverReady) {
    console.error('✗ Server failed to start');
    serverProcess.kill();
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    recordVideo: { dir: path.join(__dirname, 'docs'), size: { width: 1920, height: 1080 } }
  });

  const page = await context.newPage();

  try {
    // Navigate to annotron UI
    console.log('\n📂 Opening annotron editor...');
    const fileParam = encodeURIComponent(DEMO_FILE);
    await page.goto(`http://127.0.0.1:7321/?file=${fileParam}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // ── DEMO 1: Outline Sidebar Navigation ──
    console.log('\n1️⃣  Demonstrating outline navigation...');

    // Show outline sidebar (should be auto-visible)
    console.log('   • Outline sidebar visible on the left');
    await page.waitForTimeout(1500);

    // Click on a section heading in the outline
    console.log('   • Clicking "3. Component Architecture" heading...');
    await page.click('.outline-item', { force: true }); // Click first item
    await page.waitForTimeout(1000);

    // Scroll down to show more content
    await page.evaluate(() => {
      document.querySelector('iframe').contentWindow.scrollBy(0, 500);
    });
    await page.waitForTimeout(1000);

    // Toggle outline collapse
    console.log('   • Toggling outline collapse...');
    const collapseBtn = await page.$('#btn-outline-toggle');
    if (collapseBtn) {
      await collapseBtn.click();
      await page.waitForTimeout(800);
      await collapseBtn.click(); // Expand again
      await page.waitForTimeout(800);
    }

    // ── DEMO 2: Annotation (Point & Click) ──
    console.log('\n2️⃣  Demonstrating annotations...');

    // Switch to Annotate mode
    console.log('   • Turning on Annotate mode...');
    const btnAnnotate = await page.$('#btn-annotate');
    if (btnAnnotate) {
      await btnAnnotate.click();
      await page.waitForTimeout(1000);

      // Highlight text in the iframe
      console.log('   • Selecting text in document...');
      await page.evaluate(() => {
        const iframe = document.querySelector('iframe');
        const doc = iframe.contentDocument;
        const range = doc.createRange();
        const selection = doc.defaultView.getSelection();

        // Find a text node to select
        const p = doc.querySelector('p');
        if (p) {
          range.selectNodeContents(p);
          selection.removeAllRanges();
          selection.addRange(range);
        }
      });
      await page.waitForTimeout(800);

      // Right-click to trigger comment popup (or use chip if available)
      console.log('   • Opening comment composer...');
      await page.waitForTimeout(1500);

      // Type a comment in the composer
      const composerText = await page.$('#free-text');
      if (composerText) {
        await composerText.click();
        await composerText.type('Great architecture overview! Consider adding more details about error handling.');
        await page.waitForTimeout(1000);
      }

      // Send feedback
      console.log('   • Sending feedback to agent...');
      const btnSend = await page.$('#btn-send');
      if (btnSend) {
        await btnSend.click();
        await page.waitForTimeout(2000);
      }
    }

    // ── DEMO 3: Agent Loop Activity ──
    console.log('\n3️⃣  Showing agent loop activity...');
    console.log('   • Agent is processing feedback...');
    await page.waitForTimeout(3000);

    // Show the activity/conversation area
    console.log('   • Activity stream visible in sidebar');
    await page.waitForTimeout(1500);

    // ── DEMO 4: History Tab ──
    console.log('\n4️⃣  Demonstrating History tab...');
    const historyTab = await page.$('.stab[data-tab="history"]');
    if (historyTab) {
      await historyTab.click();
      await page.waitForTimeout(1500);
    }

    // ── DEMO 5: Markdown Mode ──
    console.log('\n5️⃣  Showing Markdown editing...');
    const btnMarkdown = await page.$('#btn-md-source');
    if (btnMarkdown) {
      await btnMarkdown.click();
      await page.waitForTimeout(1500);

      // Show markdown editor
      console.log('   • Markdown source editor visible');
      await page.waitForTimeout(1000);

      // Close it
      await btnMarkdown.click();
      await page.waitForTimeout(800);
    }

    // ── DEMO 6: Download Feature ──
    console.log('\n6️⃣  Demonstrating Download...');
    console.log('   • Download button available (clean HTML artifact)');
    await page.waitForTimeout(1500);

    // ── DEMO 7: Finalize ──
    console.log('\n7️⃣  Showing Finalize workflow...');
    console.log('   • Finalize button ready to write result to disk');
    await page.waitForTimeout(1500);

    // Scroll back to top
    await page.evaluate(() => {
      document.querySelector('iframe').contentWindow.scrollTo(0, 0);
    });
    await page.waitForTimeout(1000);

    // ── END ──
    console.log('\n✅ Demo complete! Recording saved.');
    console.log(`📹 Video: ${VIDEO_OUTPUT}`);
    console.log('\n📌 Note: Same features work via VS Code extension:');
    console.log('   • Install extension from marketplace');
    console.log('   • Right-click .md/.html file → "Open in annotron"');
    console.log('   • Automatic agent loop with auto-apply feedback');

  } catch (error) {
    console.error('❌ Demo error:', error);
  } finally {
    // Close browser and stop recording
    const videoPath = await context.close();
    await browser.close();
    serverProcess.kill();

    if (videoPath) {
      // Rename to standard name
      try {
        fs.renameSync(videoPath, VIDEO_OUTPUT);
        console.log(`\n✨ Video saved to: ${VIDEO_OUTPUT}`);
      } catch (e) {
        console.log(`Video saved to: ${videoPath}`);
      }
    }
  }
}

// Run
runDemo().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
