#!/usr/bin/env python3
"""
Annotron Plugin Publisher Script
Automate the plugin publishing process
"""

import os
import json
import subprocess
import sys
import webbrowser
from pathlib import Path

# Colors for terminal output
class Colors:
    GREEN = '\033[92m'
    BLUE = '\033[94m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    BOLD = '\033[1m'
    END = '\033[0m'

def print_header(text):
    print(f"\n{Colors.BOLD}{Colors.BLUE}{'='*70}{Colors.END}")
    print(f"{Colors.BOLD}{Colors.BLUE}{text}{Colors.END}")
    print(f"{Colors.BOLD}{Colors.BLUE}{'='*70}{Colors.END}\n")

def print_success(text):
    print(f"{Colors.GREEN}✅ {text}{Colors.END}")

def print_warning(text):
    print(f"{Colors.YELLOW}⚠️  {text}{Colors.END}")

def print_error(text):
    print(f"{Colors.RED}❌ {text}{Colors.END}")

def print_info(text):
    print(f"{Colors.BLUE}ℹ️  {text}{Colors.END}")

# Paths
ANNOTRON_ROOT = Path("/Users/meii/Documents/annotron")
PLUGIN_DIR = ANNOTRON_ROOT / ".claude-plugin"
DOCS_DIR = ANNOTRON_ROOT / "docs"

def check_files():
    """Check if all required files exist"""
    print_header("📋 CHECKING FILES")

    required_files = [
        PLUGIN_DIR / "plugin.json",
        PLUGIN_DIR / "README.md",
        PLUGIN_DIR / "icon.svg",
    ]

    all_exist = True
    for file in required_files:
        if file.exists():
            print_success(f"{file.name}")
        else:
            print_error(f"{file.name} - NOT FOUND")
            all_exist = False

    if all_exist:
        print_success("All files ready!")
        return True
    else:
        print_error("Some files missing!")
        return False

def convert_svg_to_png():
    """Convert SVG icon to PNG"""
    print_header("🎨 CONVERTING ICON")

    svg_path = PLUGIN_DIR / "icon.svg"
    png_path = PLUGIN_DIR / "icon.png"

    # Check if PNG already exists
    if png_path.exists():
        print_info(f"PNG already exists: {png_path}")
        return True

    print_info("Converting SVG → PNG...")

    try:
        # Try using ImageMagick
        cmd = f"convert {svg_path} -density 150 -resize 512x512 {png_path}"
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True)

        if result.returncode == 0:
            print_success(f"Icon converted: {png_path}")
            return True
        else:
            print_warning("ImageMagick not available, trying alternative...")

            # Try using Pillow if ImageMagick fails
            try:
                from PIL import Image
                import cairosvg

                cairosvg.svg2png(bytestring=svg_path.read_bytes(),
                                write_to=str(png_path),
                                output_width=512,
                                output_height=512)
                print_success(f"Icon converted: {png_path}")
                return True
            except ImportError:
                print_error("Could not convert PNG automatically")
                print_info("Manual conversion needed:")
                print_info("  1. Go to: https://convertio.co/svg-png/")
                print_info("  2. Upload: " + str(svg_path))
                print_info("  3. Save as: " + str(png_path))
                return False
    except Exception as e:
        print_error(f"Error: {e}")
        return False

def get_submission_data():
    """Get all submission data"""
    print_header("📝 SUBMISSION DATA")

    data = {
        "name": "annotron",
        "displayName": "🎯 Annotron - AI Artifact Review & Feedback",
        "description": "Point-and-click annotation editor for AI artifacts. 3-5 second feedback loops. Beautiful HTML rendering. No copy-paste. Zero token cost.",
        "category": "Productivity",
        "repository": "https://github.com/hueanmy/annotron",
        "homepage": "https://github.com/hueanmy/annotron",
        "documentation": "https://github.com/hueanmy/annotron#readme",
        "support": "https://github.com/hueanmy/annotron/issues",
        "license": "MIT",
        "pricing": "Free",
        "keywords": [
            "annotation",
            "feedback",
            "human-in-the-loop",
            "agent-loops",
            "markdown-preview",
            "mermaid-diagrams"
        ]
    }

    print("Platform 1: Claude.ai Marketplace")
    print(f"  Name: {data['displayName']}")
    print(f"  Desc: {data['description'][:60]}...")
    print(f"  Repo: {data['repository']}")
    print()

    print("Platform 2: Claude Code Registry")
    print(f"  Files to upload: plugin.json, icon.png, README.md")
    print()

    return data

def open_submission_urls():
    """Open submission URLs in browser"""
    print_header("🌐 OPENING SUBMISSION PAGES")

    urls = {
        "Claude.ai Marketplace": "https://claude.ai/plugins",
        "Claude Code Registry": "https://code.claude.ai/plugins"
    }

    for name, url in urls.items():
        print_info(f"Opening: {name}")
        print_info(f"  → {url}")
        try:
            webbrowser.open(url)
        except Exception as e:
            print_warning(f"Could not open browser: {e}")

    print()

def create_submission_guide():
    """Create a submission guide file"""
    print_header("📄 CREATING SUBMISSION GUIDE")

    guide_content = """# Annotron Plugin - Submission Instructions

## Platform 1: Claude.ai Marketplace

### URL: https://claude.ai/plugins

### Form Fields:
- **Plugin Name**: Annotron
- **Display Name**: 🎯 Annotron - AI Artifact Review & Feedback
- **Description**: Point-and-click annotation editor for AI artifacts. 3-5 second feedback loops. Beautiful HTML rendering. No copy-paste. Zero token cost.
- **Category**: Productivity
- **Icon**: Upload `.claude-plugin/icon.png`
- **Repository**: https://github.com/hueanmy/annotron
- **Documentation**: https://github.com/hueanmy/annotron#readme
- **Support**: https://github.com/hueanmy/annotron/issues
- **License**: MIT
- **Pricing**: Free

### Steps:
1. Click "Publish Plugin" or "Submit a Plugin"
2. Fill in all fields above
3. Upload icon.png
4. Click "Submit for Review"
5. Wait 3-5 business days

---

## Platform 2: Claude Code Registry

### URL: https://code.claude.ai/plugins

### Files to Upload:
- `.claude-plugin/plugin.json`
- `.claude-plugin/icon.png`
- `.claude-plugin/README.md`

### Steps:
1. Click "Publish Plugin"
2. Connect GitHub or upload files
3. Click "Publish"
4. Wait 1-3 business days

---

## Timeline:
- Claude.ai: 3-5 days
- Claude Code: 1-3 days
- Both should be live within 1 week

---

## After Publication:

Share your plugin:
- Tweet announcement
- Post on GitHub Discussions
- Add to portfolio/website
- Create demo video

---

Generated: 2026-07-19
Plugin Version: 1.0.5
"""

    guide_path = PLUGIN_DIR / "SUBMISSION-GUIDE-FILLED.md"
    guide_path.write_text(guide_content)
    print_success(f"Created: {guide_path}")

    return guide_path

def create_json_data():
    """Create JSON file with all submission data"""
    print_header("📦 CREATING SUBMISSION JSON")

    data = {
        "plugin": {
            "name": "annotron",
            "version": "1.0.5",
            "displayName": "🎯 Annotron - AI Artifact Review & Feedback",
            "description": "Point-and-click annotation editor for AI artifacts. 3-5 second feedback loops. Beautiful HTML rendering. No copy-paste. Zero token cost.",
            "author": {
                "name": "Meii",
                "email": "mailt@creativeforce.io",
                "url": "https://github.com/hueanmy"
            }
        },
        "submission": {
            "platforms": [
                {
                    "name": "Claude.ai Marketplace",
                    "url": "https://claude.ai/plugins",
                    "status": "Ready to submit",
                    "timeline": "3-5 business days"
                },
                {
                    "name": "Claude Code Registry",
                    "url": "https://code.claude.ai/plugins",
                    "status": "Ready to submit",
                    "timeline": "1-3 business days"
                }
            ],
            "files": {
                "plugin_json": str(PLUGIN_DIR / "plugin.json"),
                "readme": str(PLUGIN_DIR / "README.md"),
                "icon_png": str(PLUGIN_DIR / "icon.png"),
                "icon_svg": str(PLUGIN_DIR / "icon.svg")
            }
        },
        "metadata": {
            "category": "Productivity",
            "license": "MIT",
            "pricing": "Free",
            "repository": "https://github.com/hueanmy/annotron",
            "documentation": "https://github.com/hueanmy/annotron#readme",
            "support": "https://github.com/hueanmy/annotron/issues"
        }
    }

    json_path = PLUGIN_DIR / "submission-data.json"
    with open(json_path, 'w') as f:
        json.dump(data, f, indent=2)

    print_success(f"Created: {json_path}")
    return json_path

def main():
    """Main execution"""
    print(f"\n{Colors.BOLD}{Colors.BLUE}")
    print("╔══════════════════════════════════════════════════════════════════════╗")
    print("║          🚀 ANNOTRON PLUGIN PUBLISHER SCRIPT 🚀                      ║")
    print("╚══════════════════════════════════════════════════════════════════════╝")
    print(f"{Colors.END}\n")

    # Step 1: Check files
    if not check_files():
        sys.exit(1)

    # Step 2: Convert icon
    convert_svg_to_png()

    # Step 3: Get submission data
    data = get_submission_data()

    # Step 4: Create submission guide
    guide_path = create_submission_guide()

    # Step 5: Create JSON data
    json_path = create_json_data()

    # Step 6: Summary
    print_header("✅ EVERYTHING READY FOR SUBMISSION")

    print(f"""
{Colors.BOLD}Files Ready:{Colors.END}
  ✅ .claude-plugin/plugin.json
  ✅ .claude-plugin/README.md
  ✅ .claude-plugin/icon.png
  ✅ .claude-plugin/icon.svg

{Colors.BOLD}Documentation:{Colors.END}
  ✅ Submission guide: {guide_path}
  ✅ JSON data: {json_path}

{Colors.BOLD}Next Steps:{Colors.END}
  1. Go to: https://claude.ai/plugins
  2. Click "Submit a Plugin"
  3. Use the form fields below:

{Colors.YELLOW}FORM DATA (Copy & Paste):{Colors.END}

Name: {data['displayName']}

Category: {data['category']}

Description: {data['description']}

Repository: {data['repository']}

Documentation: {data['documentation']}

Support: {data['support']}

License: {data['license']}

Pricing: {data['pricing']}

Icon: Upload {PLUGIN_DIR / 'icon.png'}

---

{Colors.BOLD}Then submit to Claude Code:{Colors.END}
  1. Go to: https://code.claude.ai/plugins
  2. Upload: plugin.json, icon.png, README.md
  3. Click Publish

{Colors.BOLD}Timeline:{Colors.END}
  • Claude.ai: 3-5 days
  • Claude Code: 1-3 days
  • Both live within 1 week

{Colors.GREEN}Ready? Open the submission pages now!{Colors.END}
""")

    # Try to open URLs
    response = input("\nOpen submission pages in browser? (y/n): ").lower()
    if response == 'y':
        open_submission_urls()

    print_success("You're all set! Good luck with your submission! 🚀")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print(f"\n{Colors.RED}Cancelled{Colors.END}")
        sys.exit(0)
    except Exception as e:
        print_error(f"Error: {e}")
        sys.exit(1)
