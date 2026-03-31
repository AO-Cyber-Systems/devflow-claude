# Platform Specifications

Dimensions, safe zones, and best practices for each supported platform.

---

## Facebook

### Dimensions

| Format | Dimensions | Aspect Ratio | Replicate aspect_ratio |
|--------|------------|--------------|------------------------|
| Feed Post | 1200 × 630 | 1.91:1 | `16:9` (close enough) |
| Square Post | 1080 × 1080 | 1:1 | `1:1` |
| Story | 1080 × 1920 | 9:16 | `9:16` |
| Cover Photo | 820 × 312 | 2.63:1 | `16:9` then crop |
| Event Cover | 1920 × 1005 | 1.91:1 | `16:9` |

### Safe Zones

**Feed Post (1200×630):**
- Keep critical text within center 1000×500
- Profile picture overlaps bottom-left on mobile
- Reactions bar overlaps bottom

**Story (1080×1920):**
- Top 150px: Status bar overlap
- Bottom 250px: CTA button area
- Safe zone: 1080×1520 centered

### Best Practices

- Text should cover less than 20% of image for ad reach
- High contrast text for mobile readability
- Primary message visible without clicking "see more"
- Faces and key elements in center for thumbnail cropping

---

## Instagram

### Dimensions

| Format | Dimensions | Aspect Ratio | Replicate aspect_ratio |
|--------|------------|--------------|------------------------|
| Square Post | 1080 × 1080 | 1:1 | `1:1` |
| Portrait Post | 1080 × 1350 | 4:5 | `4:5` |
| Landscape Post | 1080 × 566 | 1.91:1 | `16:9` |
| Story/Reel | 1080 × 1920 | 9:16 | `9:16` |
| Carousel | 1080 × 1080 or 1080 × 1350 | 1:1 or 4:5 | `1:1` or `4:5` |

### Safe Zones

**Square Post (1080×1080):**
- Keep text within center 900×900
- Bottom 100px may be covered by caption preview

**Portrait Post (1080×1350):**
- Best engagement format
- Keep critical content in center 900×1100
- Top/bottom 125px are "bonus" areas

**Story/Reel (1080×1920):**
- Top 120px: Username/timestamp overlay
- Bottom 200px: CTA, comments, share buttons
- Safe zone: 1080×1600 centered
- Left edge 60px: Profile picture stack

### Best Practices

- Portrait (4:5) gets most screen real estate in feed
- First frame of video is thumbnail - make it count
- Carousel first slide should hook the swipe
- Use consistent visual style across carousel slides
- Stories: Add interactive elements (polls, questions) in safe zone

---

## Twitter/X

### Dimensions

| Format | Dimensions | Aspect Ratio | Replicate aspect_ratio |
|--------|------------|--------------|------------------------|
| Single Image | 1200 × 675 | 16:9 | `16:9` |
| Two Images | 700 × 800 each | 7:8 | `4:5` (approximate) |
| Three Images | 700 × 800 + 2× (700 × 400) | Mixed | Varies |
| Four Images | 700 × 400 each | 7:4 | `16:9` |
| Header | 1500 × 500 | 3:1 | Custom crop |

### Safe Zones

**Single Image (1200×675):**
- Full bleed, no major overlays
- Keep text within center 1000×550 for padding
- Alt text button overlays bottom-left corner

**Timeline Display:**
- Images may be cropped to 2:1 in some views
- Keep key content in center vertical third

### Best Practices

- 16:9 single images display best in timeline
- Bright, high-contrast images stop the scroll
- Text should be large enough to read at thumbnail size
- Avoid text in corners (gets covered by image count badges)
- GIFs autoplay - first frame matters less

---

## Cross-Platform Adaptation

When creating for multiple platforms from one concept:

### Priority Order

1. **Facebook 1200×630** - Start here (default)
2. **Instagram 1080×1350** - Recompose for vertical
3. **Twitter/X 1200×675** - Similar to Facebook, minor adjustments
4. **Instagram Square 1080×1080** - Center-crop or recompose
5. **Stories 1080×1920** - Full vertical redesign

### Adaptation Strategy

**Horizontal → Vertical:**
- Move headline to upper third
- Stack elements vertically
- Increase text size proportionally
- Add more vertical padding

**Vertical → Horizontal:**
- Move elements side-by-side
- Reduce text size slightly
- Use horizontal rule dividers
- Ensure nothing gets cropped

### Text Scaling Guide

| Platform | Headline | Subheadline | Body |
|----------|----------|-------------|------|
| Facebook 1200×630 | 64px | 32px | 20px |
| Instagram 1080×1080 | 56px | 28px | 18px |
| Instagram 1080×1350 | 60px | 30px | 18px |
| Instagram 1080×1920 | 72px | 36px | 22px |
| Twitter/X 1200×675 | 60px | 30px | 18px |

---

## File Export Settings

### PNG (Recommended for most)
- Color space: sRGB
- Bit depth: 8-bit
- Compression: Maximum quality

### JPEG (For photos/complex images)
- Quality: 85-95%
- Color space: sRGB
- Progressive: Yes

### Video
- Codec: H.264
- Resolution: Match platform dimensions
- Frame rate: 30fps (stories/reels: 30fps)
- Audio: AAC 128kbps (if applicable)
