# Video Creation Guide - annotron Teaser

## Quick Overview

You have 2 existing demo videos:
- `docs/annotron-demo-v2.mp4` (30 sec)
- `docs/annotron-demo-v2-raw.webm`

We'll create:
1. **TikTok teaser** (15s) - Vietnamese voiceover
2. **YouTube teaser** (20s) - English voiceover

---

## Step-by-Step: Create Video from Existing Demo

### Option 1: Using DaVinci Resolve (Free, Professional)

#### Download & Install
- Go to [DaVinci Resolve](https://www.blackmagicdesign.com/products/davinciresolve)
- Download free version (Studio is paid)
- Install on your machine

#### Workflow (15-20 minutes)

1. **Import Video**
   - Open DaVinci Resolve
   - Create new project
   - Media → Import → Select `annotron-demo-v2.mp4`
   - Drag to timeline

2. **Trim to Length**
   - For 15s teaser: Trim first 15 seconds
   - For 20s teaser: Keep full 20 seconds
   - Right-click → Trim → Set duration

3. **Add Voiceover**
   - **Generate voiceover with ElevenLabs:**
     - Go to elevenlabs.io
     - Copy Vietnamese script from `tiktok-script-vi.md`
     - Choose voice (Adam or Aria)
     - Generate → Download MP3
   
   - **Add to DaVinci:**
     - Fairlight audio tab
     - Import MP3 track
     - Position under video track
     - Adjust levels (voiceover ~-6dB)

4. **Add Text Overlays**
   - Fusion tab → Add text
   - Key overlays from storyboard:
     - "Click vào đâu..." (2s)
     - "Ghi chú..." (5s)
     - "AI sửa..." (8s)
     - "youtube.com/@studyingwithmeii" (end)
   - Font: Arial/Segoe UI, bold, white
   - Color: #ffffff on transparent background
   - Add drop shadow for readability

5. **Add Color Grade**
   - Color tab
   - Add subtle saturation boost (+10-15%)
   - Slightly darken midtones
   - Maintain purple/teal color scheme

6. **Add Transitions & Effects**
   - Between scenes: Dissolve (0.3s)
   - Text: Fade-in (0.2s)
   - On "AI sửa" moment: Slight zoom/scale effect

7. **Add Background Music**
   - Import royalty-free track
   - Audio library options:
     - YouTube Audio Library (free)
     - Epidemic Sound (subscription)
     - Artlist (subscription)
   - Position under voiceover track
   - Reduce volume to -20dB (voiceover stays prominent)

8. **Export**
   - File → Export
   - Format: MP4 (H.264 codec)
   - Resolution: 1080p (1920x1080)
   - Frame rate: 30fps
   - Name: `annotron-teaser-15s-vi.mp4`
   - Save to `docs/` folder

---

### Option 2: Using CapCut (Free, Easy, Mobile/Desktop)

#### Download
- [CapCut Website](https://www.capcut.com)
- Available on: Windows, Mac, iOS, Android

#### Workflow (10-15 minutes)

1. **Create New Project**
   - Open CapCut
   - New project → Select video format (9:16 for TikTok)

2. **Import Video**
   - Upload → Select `annotron-demo-v2.mp4`
   - Add to timeline

3. **Trim Video**
   - Select segment → Trim to 15s
   - Speed up if needed (1.2x for 15s from 20s content)

4. **Add Voiceover**
   - Import ElevenLabs MP3 (from elevenlabs.io)
   - Audio track → Add audio → Select MP3
   - Sync with video
   - Adjust volume (louder than background music)

5. **Add Text**
   - Text → Add text
   - Copy from storyboard
   - Position and time each text element
   - Font: Modern sans-serif (CapCut defaults fine)
   - Color: White with shadow

6. **Add Background Music**
   - Music → Search for track
   - Apply royalty-free music (CapCut has library)
   - Lower volume (-15 to -20dB)

7. **Add Transitions**
   - Between clips: Smooth or Zoom transition
   - Duration: 0.3s

8. **Add Effects (Optional)**
   - Effects → Add effects during "AI applies" moment
   - Suggestion: Subtle scale/zoom effect

9. **Export**
   - Export button (top right)
   - Format: MP4
   - Resolution: 1080p or 720p
   - Name: `annotron-teaser-15s-vi.mp4`
   - Save to `docs/` folder

---

### Option 3: Using FFmpeg (Command-line, Powerful)

#### Install FFmpeg
```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt install ffmpeg

# Windows (via choco)
choco install ffmpeg
```

#### Generate ElevenLabs Voiceover
```bash
# 1. Get MP3 from ElevenLabs (download manually or via API)
# 2. Place in docs/ folder as voiceover-vi.mp3
```

#### Combine Video + Audio
```bash
cd /Users/meii/Documents/annotron/docs

# Trim video to 15s AND add voiceover
ffmpeg -i annotron-demo-v2.mp4 \
  -i voiceover-vi.mp3 \
  -ss 0 -t 15 \
  -c:v libx264 \
  -c:a aac \
  -shortest \
  annotron-teaser-15s-vi.mp4
```

#### Add Background Music (Advanced)
```bash
# Use complex audio filter
ffmpeg -i annotron-teaser-15s-vi.mp4 \
  -i background-music.mp3 \
  -filter_complex "[1:a]volume=0.3[music];[0:a][music]amix=inputs=2[aout]" \
  -map 0:v -map "[aout]" \
  -c:v libx264 \
  -c:a aac \
  annotron-teaser-15s-vi-with-music.mp4
```

#### Add Text Overlay (Harder - use another tool for this)
```bash
# FFmpeg subtitle approach (more complex)
# Recommendation: Use DaVinci or CapCut for text overlays instead
```

---

## Audio Assets You Need

### 1. Vietnamese Voiceover (ElevenLabs)

**Steps:**
1. Go to [elevenlabs.io](https://elevenlabs.io)
2. Sign up (free tier available)
3. Paste script from `docs/tiktok-script-vi.md` (15s version)
4. Select voice: 
   - **"Adam"** - Professional, clear
   - **"Aria"** - Conversational, friendly
5. Generate
6. Download MP3
7. Save to `docs/voiceover-vi.mp3`

**Alternative: Use TTS Service**
- Google Text-to-Speech
- AWS Polly
- Azure Speech Services

### 2. Background Music (Royalty-free)

**Best sources:**
- YouTube Audio Library (free, no signup)
- Epidemic Sound (€4.99/month)
- Artlist (subscription)
- Pexels Music (free)
- Pixabay Music (free)

**Recommendations for annotron:**
- Tech/upbeat instrumental
- Duration: 20-30 seconds
- Tempo: 100-130 BPM
- Genre: Electronic, modern, minimal

**Search terms:**
- "Upbeat tech background"
- "Modern startup music"
- "Minimal electronic"

---

## Text Overlay Specifications

### For 15-Second Vietnamese Video

```
Time: 0-2s
Text: "Feedback chậm?"
Position: Center
Size: 48px
Color: White (#FFFFFF)
Shadow: Yes, black, offset 2px

Time: 2-4s  
Text: "Click vào đâu"
Position: Center
Size: 36px
Color: White
Shadow: Yes

Time: 4-6s
Text: "Ghi chú là đây"
Position: Center  
Size: 36px
Color: White
Shadow: Yes

Time: 6-10s
Text: "AI tự sửa"
Position: Center
Size: 36px
Color: #48d1cc (Teal)
Shadow: Yes

Time: 10-12s
Text: "Kết quả ngay"
Position: Center
Size: 36px
Color: #10b981 (Green)
Shadow: Yes

Time: 12-15s
Text: "youtube.com/@studyingwithmeii"
Position: Bottom
Size: 24px
Color: White
Shadow: Yes, strong
```

---

## Quality Checklist

Before exporting final video:

- [ ] Video length: exactly 15s (or 20s)
- [ ] Audio synced: voiceover matches on-screen actions
- [ ] Audio levels: voiceover -6 to -12dB, music -15 to -20dB
- [ ] Text readable: contrast ratio ≥ 4.5:1
- [ ] No artifacts: glitches, audio pops, color banding
- [ ] Branding: annotron logo or URL visible at end
- [ ] Format: MP4, H.264, 1080p 30fps
- [ ] File size: <100MB for upload

---

## File Naming Convention

```
annotron-teaser-[duration]-[language]-[version].mp4

Examples:
- annotron-teaser-15s-vi-v1.mp4
- annotron-teaser-20s-en-v1.mp4
- annotron-teaser-15s-vi-final.mp4
```

---

## Upload to Platforms

### TikTok
1. **File specs:**
   - Format: MP4, 9:16 aspect ratio (vertical)
   - Max size: 287.6 MB
   - Max length: 10 minutes (we're well under)
   - Codec: H.264 video, AAC audio

2. **Upload:**
   - Open TikTok app or web
   - Click + icon → Upload video
   - Select file: `annotron-teaser-15s-vi-final.mp4`
   - Add caption from `social-media-captions.md`
   - Add hashtags: #AI #Coding #OpenSource
   - Post!

### YouTube
1. **File specs:**
   - Format: MP4, any aspect ratio
   - Max file size: 256GB
   - Codec: H.264 video, MP3/AAC audio

2. **Upload:**
   - Go to [youtube.com/upload](https://youtube.com/upload)
   - Select file: `annotron-teaser-20s-en-final.mp4`
   - Title: "annotron — AI Artifact Review in 20 Seconds"
   - Description: (from `social-media-captions.md`)
   - Tags: `annotron, AI, OpenSource, DevTools, Coding`
   - Thumbnail: Custom (use logo or screenshot)
   - Post!

### YouTube Shorts
- Same as YouTube, but:
- Aspect ratio: 9:16 (vertical)
- Duration: ≤ 60 seconds

### Instagram Reels
1. **File specs:**
   - Format: MP4
   - Aspect ratio: 9:16
   - Max length: 90 seconds
   - Max file size: 100MB

2. **Upload:**
   - Open Instagram app
   - Create → Reels
   - Upload video
   - Add caption from `social-media-captions.md`
   - Share!

---

## Pro Tips

1. **Test Audio Sync**
   - Play video multiple times
   - Voiceover should match cursor clicks and animations
   - Re-sync if off by >100ms

2. **Check on Phone**
   - Always preview on actual mobile device
   - Text size and timing feel different on small screens

3. **A/B Test Captions**
   - Create 2-3 versions with different captions
   - Test which gets more engagement

4. **Use Platform Tools**
   - TikTok: Use trending sounds (not always needed, voiceover is fine)
   - YouTube: Enable auto-captions, then review for accuracy
   - Instagram: Use carousel/Stories to promote video

5. **Timing**
   - Post TikTok: 7-9 AM, 12 PM, 6-8 PM (Vietnam time)
   - Post YouTube: Upload, then share on Twitter/LinkedIn
   - Cross-platform: Same day or within 24 hours

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| **Audio out of sync** | Re-import audio, manually adjust timeline |
| **Text too small on mobile** | Increase font size, reduce text amount |
| **Voiceover too quiet** | Increase audio gain (0 to +6dB) |
| **Background music too loud** | Reduce music track volume to -20dB |
| **Video choppy** | Reduce resolution or lower frame rate |
| **File too large** | Lower resolution to 720p, reduce bitrate |
| **Color looks washed out** | Add saturation in color grading |
| **Text hard to read** | Add stronger shadow, increase contrast |

---

## Next Steps

1. ✅ Generate voiceover with ElevenLabs
2. ✅ Find royalty-free background music
3. ✅ Choose video editor (DaVinci, CapCut, or FFmpeg)
4. ✅ Edit video following storyboard
5. ✅ Export as MP4
6. ✅ Test on mobile device
7. ✅ Upload to TikTok, YouTube, Instagram
8. ✅ Share link on GitHub, Twitter, LinkedIn
9. ✅ Monitor analytics

**Estimated time:** 1-2 hours (including voiceover generation)

