#!/usr/bin/env node
/**
 * annotron — Full demo with terminal visible
 * Shows: terminal running annotron → browser opens → demo interactions
 *
 * Usage: node demo-full.js
 * This will open a terminal window showing the command execution
 */

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEMO_FILE = path.join(__dirname, 'architecture-demo.md');

console.log(`
╔══════════════════════════════════════════════════════════╗
║         annotron — Full Demo Recording Setup            ║
╚══════════════════════════════════════════════════════════╝

📹 RECORDING INSTRUCTIONS:

1. A terminal will open showing the annotron command
2. Browser will auto-open with the annotron UI
3. Demo will run automatically with interactions

⏺️  RECORDING TIPS:
   • macOS: Press Cmd+Shift+5 → Select "Record Selection"
     OR use QuickTime → File → New Screen Recording
   • Record BOTH terminal + browser together
   • Let it run for ~3 minutes

🎯 WHAT YOU'LL SEE:
   ✓ Terminal: annotron architecture-demo.md --agent running
   ✓ Browser: Opens automatically with full UI
   ✓ Outline: Navigation sidebar with collapse/expand
   ✓ Annotations: Adding comments, sending feedback
   ✓ Agent: Activity stream visible
   ✓ History: Past feedback rounds
   ✓ Markdown: Live source editor
   ✓ Controls: Download & Finalize buttons

⏳ STARTING IN 5 SECONDS...
   Get ready to press Record! 🎬

`);

setTimeout(() => {
  console.log('🚀 Launching terminal and browser...\n');

  // Open in terminal (visible)
  const terminalCmd = `cd "${__dirname}" && node bin/annotron "${DEMO_FILE}" --agent`;

  // Use open command to launch in terminal
  const terminal = spawn('open', ['-a', 'Terminal', '-W'], {
    stdio: 'pipe'
  });

  terminal.stdin.write(`${terminalCmd}\n`);
  terminal.stdin.end();

  console.log('✓ Terminal launched with command:');
  console.log(`  $ ${terminalCmd}\n`);
  console.log('✓ Browser should open automatically from terminal\n');
  console.log('🎥 START RECORDING NOW and let demo run for 3 minutes!\n');

  console.log('Demo timeline:');
  console.log('  0:00 - Outline navigation (collapse/expand, jumps)');
  console.log('  0:45 - Annotations (add comment, send feedback)');
  console.log('  1:30 - Agent activity stream');
  console.log('  2:00 - History tab, Markdown editor');
  console.log('  2:30 - Download & Finalize options');
  console.log('  2:59 - Demo complete\n');

  console.log('⚠️  Keep the terminal and browser windows visible during recording');
  console.log('💾 Save recording as: annotron-demo-v2.mp4\n');

}, 5000);
