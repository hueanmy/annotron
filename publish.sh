#!/bin/bash

# Annotron Plugin Publisher
# One-command publishing with form data ready to copy-paste

set -e

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║        🚀 ANNOTRON PLUGIN PUBLISHER 🚀                         ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

PLUGIN_DIR="/Users/meii/Documents/annotron/.claude-plugin"

# Check files
echo "📋 Checking files..."
if [ -f "$PLUGIN_DIR/plugin.json" ]; then
    echo "✅ plugin.json"
else
    echo "❌ plugin.json not found"
    exit 1
fi

if [ -f "$PLUGIN_DIR/README.md" ]; then
    echo "✅ README.md"
else
    echo "❌ README.md not found"
    exit 1
fi

if [ -f "$PLUGIN_DIR/icon.svg" ]; then
    echo "✅ icon.svg"
else
    echo "❌ icon.svg not found"
    exit 1
fi

echo ""
echo "✅ All files ready!"
echo ""

# Try to convert SVG to PNG
echo "🎨 Converting icon.svg → icon.png..."
if command -v convert &> /dev/null; then
    convert "$PLUGIN_DIR/icon.svg" -density 150 -resize 512x512 "$PLUGIN_DIR/icon.png"
    echo "✅ Icon converted!"
else
    echo "⚠️  ImageMagick not available"
    echo "⏳ Please convert manually:"
    echo "   1. Go to: https://convertio.co/svg-png/"
    echo "   2. Upload: $PLUGIN_DIR/icon.svg"
    echo "   3. Download and save as: $PLUGIN_DIR/icon.png"
    echo ""
fi

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "📝 SUBMISSION FORM DATA (COPY & PASTE)"
echo "════════════════════════════════════════════════════════════════"
echo ""

cat << 'FORM_DATA'

🌐 PLATFORM 1: CLAUDE.AI MARKETPLACE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

URL: https://claude.ai/plugins
Click: "Submit a Plugin"

Fill in:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Plugin Name:
🎯 Annotron - AI Artifact Review & Feedback

Category:
Productivity

Description:
Point-and-click annotation editor for AI artifacts. 3-5 second feedback
loops. Beautiful HTML rendering. No copy-paste. Zero token cost.

Icon:
Upload: icon.png

Repository:
https://github.com/hueanmy/annotron

Documentation:
https://github.com/hueanmy/annotron#readme

Support:
https://github.com/hueanmy/annotron/issues

License:
MIT

Pricing:
Free

Keywords:
annotation, feedback, human-in-the-loop, agent, markdown, mermaid

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


🔧 PLATFORM 2: CLAUDE CODE REGISTRY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

URL: https://code.claude.ai/plugins
Click: "Publish Plugin"

Upload files:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. plugin.json
2. icon.png
3. README.md

Then click: "Publish"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

FORM_DATA

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "⏱️  TIMELINE"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "• Claude.ai Marketplace: 3-5 business days"
echo "• Claude Code Registry:  1-3 business days"
echo "• Both live within:      ~1 week"
echo ""

echo "════════════════════════════════════════════════════════════════"
echo "✅ YOU'RE READY!"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "📍 Files location:"
echo "   $PLUGIN_DIR"
echo ""
echo "📄 Check these files:"
ls -lh "$PLUGIN_DIR"/{plugin.json,README.md,icon.svg,icon.png} 2>/dev/null || echo "   (icon.png will appear after conversion)"
echo ""

echo "🌐 Open these URLs in your browser:"
echo ""
echo "   1. https://claude.ai/plugins"
echo "      → Submit a Plugin → Fill form → Upload icon.png"
echo ""
echo "   2. https://code.claude.ai/plugins"
echo "      → Publish Plugin → Upload plugin.json, icon.png, README.md"
echo ""

echo "🎉 That's it! Just copy-paste the form data above and submit."
echo ""

# Try to open URLs
read -p "Open submission pages in browser? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Opening browser..."
    if command -v open &> /dev/null; then
        open "https://claude.ai/plugins"
        open "https://code.claude.ai/plugins"
    elif command -v xdg-open &> /dev/null; then
        xdg-open "https://claude.ai/plugins"
        xdg-open "https://code.claude.ai/plugins"
    else
        echo "Please open manually:"
        echo "  - https://claude.ai/plugins"
        echo "  - https://code.claude.ai/plugins"
    fi
fi

echo ""
echo "✨ Good luck! Ship it! 🚀"
echo ""
