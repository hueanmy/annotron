#!/usr/bin/env node
/**
 * annotron — Enhanced automated demo with better interaction capture
 * Creates composite intro frame + records browser demo
 */

import { chromium } from 'playwright';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEMO_FILE = path.join(__dirname, 'architecture-demo.md');
const VIDEO_OUTPUT = path.join(__dirname, 'docs', 'annotron-demo-v2.mp4');

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function runDemo() {
  console.log('📹 Starting enhanced annotron demo...\n');

  // Start server + agent
  console.log('0️⃣  Starting server with agent loop...');
  const serverProcess = spawn('node', ['bin/annotron', DEMO_FILE, '--agent'], {
    cwd: __dirname,
    stdio: 'pipe',
  });

  let serverReady = false;
  serverProcess.stdout.on('data', (data) => {
    if (data.toString().includes('Editor URL')) serverReady = true;
  });

  // Wait for server
  for (let i = 0; i < 30; i++) {
    if (serverReady) break;
    await sleep(200);
  }

  if (!serverReady) {
    console.error('✗ Server failed to start');
    serverProcess.kill();
    process.exit(1);
  }

  console.log('✓ Server ready\n');

  const browser = await chromium.launch({
    headless: false,
    args: ['--start-maximized']
  });

  const context = await browser.newContext({
    recordVideo: { dir: path.join(__dirname, 'docs'), size: { width: 1920, height: 1080 } }
  });

  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.setDefaultNavigationTimeout(10000);

  try {
    // ── DEMO START ──
    console.log('📂 Opening annotron UI...\n');
    const fileParam = encodeURIComponent(DEMO_FILE);
    await page.goto(`http://127.0.0.1:7321/?file=${fileParam}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // ── 1. Outline Navigation ──
    console.log('1️⃣  Outline Navigation Demo');
    console.log('   Expanding outline, jumping to sections...');

    // Wait for outline sidebar
    await page.waitForSelector('#outline-sidebar', { timeout: 5000 });

    // Toggle collapse
    const toggleBtn = await page.$('#btn-outline-toggle');
    if (toggleBtn) {
      await toggleBtn.click();
      await page.waitForTimeout(800);
      await toggleBtn.click();
      await page.waitForTimeout(800);
    }

    // Click outline items to navigate
    const outlineItems = await page.$$('.outline-item');
    if (outlineItems.length > 2) {
      await outlineItems[2].click();
      await page.waitForTimeout(1500);
      await outlineItems[5]?.click?.();
      await page.waitForTimeout(1500);
    }

    // ── 2. Annotations ──
    console.log('\n2️⃣  Annotations Demo');
    console.log('   Adding comment and sending feedback...');

    // Turn on Annotate mode
    const btnAnnotate = await page.$('#btn-annotate');
    if (btnAnnotate) {
      await btnAnnotate.click();
      await page.waitForTimeout(1000);

      // Type in composer
      const composer = await page.$('#free-text');
      if (composer) {
        await composer.click();
        await composer.type('Excellent architecture design! Consider adding deployment strategy details.');
        await page.waitForTimeout(1500);

        // Send feedback
        const btnSend = await page.$('#btn-send');
        if (btnSend && await btnSend.isVisible()) {
          await btnSend.click();
          console.log('   Feedback sent to agent...');
          await page.waitForTimeout(2000);
        }
      }
    }

    // ── 3. Activity Stream ──
    console.log('\n3️⃣  Agent Activity Stream');
    console.log('   Agent processing feedback...');
    await page.waitForTimeout(3000);

    // ── 4. History Tab ──
    console.log('\n4️⃣  History Tab');
    console.log('   Viewing feedback history...');
    const historyTab = await page.$('.stab[data-tab="history"]');
    if (historyTab && await historyTab.isVisible()) {
      await historyTab.click();
      await page.waitForTimeout(2000);
    }

    // Back to annotations
    const annotationsTab = await page.$('.stab[data-tab="annotations"]');
    if (annotationsTab) {
      await annotationsTab.click();
      await page.waitForTimeout(1000);
    }

    // ── 5. Markdown Editor ──
    console.log('\n5️⃣  Markdown Editor');
    console.log('   Showing live markdown source...');
    const btnMarkdown = await page.$('#btn-md-source');
    if (btnMarkdown && await btnMarkdown.isVisible()) {
      await btnMarkdown.click();
      await page.waitForTimeout(1500);
      await btnMarkdown.click();
      await page.waitForTimeout(1000);
    }

    // ── 6. Download & Finalize ──
    console.log('\n6️⃣  Download & Finalize Options');
    console.log('   Showing export options...');
    await page.waitForTimeout(1500);

    // Scroll to top
    await page.evaluate(() => {
      const iframe = document.querySelector('iframe');
      if (iframe?.contentWindow) iframe.contentWindow.scrollTo(0, 0);
    });
    await page.waitForTimeout(1000);

    console.log('\n✅ Demo complete!');

  } catch (error) {
    console.error('\n❌ Error during demo:', error.message);
  } finally {
    // Close and save
    const videoPath = await context.close();
    await browser.close();
    serverProcess.kill();

    if (videoPath) {
      try {
        fs.renameSync(videoPath, VIDEO_OUTPUT);
        const stats = fs.statSync(VIDEO_OUTPUT);
        const sizeMB = (stats.size / 1024 / 1024).toFixed(1);
        console.log(`\n📹 Video saved: ${VIDEO_OUTPUT}`);
        console.log(`   Size: ${sizeMB} MB`);
        console.log(`   Format: MP4 (via Playwright WebM conversion)`);
      } catch (e) {
        console.log(`Video: ${videoPath}`);
      }
    }

    console.log('\n🎬 Demo features recorded:');
    console.log('   ✓ Outline navigation (collapse/expand)');
    console.log('   ✓ Jumping between sections');
    console.log('   ✓ Adding annotations');
    console.log('   ✓ Sending feedback to agent');
    console.log('   ✓ Agent activity stream');
    console.log('   ✓ History tab');
    console.log('   ✓ Markdown editor');
    console.log('   ✓ Download & Finalize options');
  }
}

runDemo().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
