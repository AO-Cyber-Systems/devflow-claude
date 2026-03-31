# Theme Specifications

Complete specifications for each theme including colors, typography, and AI prompt keywords.

---

## Cybernetic Luxury

**Inspired by:** AO Cyber Systems aesthetic - premium tech with digital sovereignty messaging.

### Color Palette

| Role | Hex | Usage |
|------|-----|-------|
| Primary Background | `#0a0a0f` | Deep space black |
| Secondary Background | `#12121a` | Card/section backgrounds |
| Accent Primary | `#00d4ff` | Cyan highlights, CTAs |
| Accent Secondary | `#7c3aed` | Purple accents |
| Accent Tertiary | `#10b981` | Success/trust indicators |
| Text Primary | `#ffffff` | Headlines |
| Text Secondary | `#a1a1aa` | Body text |
| Gradient | `linear-gradient(135deg, #0a0a0f 0%, #1a1a2e 50%, #0a0a0f 100%)` | Background depth |

### Typography

| Element | Font | Weight | Size (1200px width) |
|---------|------|--------|---------------------|
| Headline | `Space Grotesk` | 700 | 64-80px |
| Subheadline | `Space Grotesk` | 500 | 32-40px |
| Body | `Inter` | 400 | 18-24px |
| CTA | `Space Grotesk` | 600 | 20-24px |

Google Fonts import:
```
https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500&display=swap
```

### Visual Elements

- Subtle grid patterns or circuit-board motifs
- Metallic/chrome accents
- Glowing edges on key elements
- Gradient overlays: `linear-gradient(180deg, rgba(0,212,255,0.1) 0%, transparent 50%)`
- Box shadows with cyan glow: `0 0 40px rgba(0,212,255,0.2)`

### Replicate Prompt Keywords

**For backgrounds:**
```
cyberpunk luxury, dark futuristic, digital sovereignty, abstract technology, 
neural network visualization, holographic elements, chrome and cyan, 
premium tech aesthetic, dark gradient, subtle grid pattern, 
high-end minimalist tech, enterprise software aesthetic, 
no text, no words, suitable for text overlay
```

**For product/feature imagery:**
```
futuristic interface, holographic display, premium technology, 
sleek digital product, cybernetic design, dark mode UI, 
glowing cyan accents, abstract data visualization
```

### CSS Overlay Pattern

```css
.overlay {
  background: linear-gradient(
    180deg,
    rgba(10, 10, 15, 0.7) 0%,
    rgba(10, 10, 15, 0.85) 100%
  );
  backdrop-filter: blur(2px);
}
.headline {
  color: #ffffff;
  text-shadow: 0 0 30px rgba(0, 212, 255, 0.5);
}
.accent-text {
  color: #00d4ff;
}
```

---

## Republican Campaign

**Aesthetic:** Bold patriotic imagery, traditional American values, strong and confident.

### Color Palette

| Role | Hex | Usage |
|------|-----|-------|
| Primary | `#bf0a30` | Republican red |
| Secondary | `#002868` | Navy blue |
| Accent | `#ffffff` | White, stars |
| Gold Accent | `#d4af37` | Premium/victory accents |
| Background Dark | `#1a1a2e` | Dark navy alternative |
| Text on Dark | `#ffffff` | White text |
| Text on Light | `#002868` | Navy text |

### Typography

| Element | Font | Weight | Size (1200px width) |
|---------|------|--------|---------------------|
| Headline | `Oswald` | 700 | 72-96px |
| Subheadline | `Oswald` | 500 | 36-48px |
| Body | `Source Sans Pro` | 400 | 20-26px |
| CTA | `Oswald` | 600 | 24-28px |

Google Fonts import:
```
https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Source+Sans+Pro:wght@400;600&display=swap
```

### Visual Elements

- American flag imagery (tasteful, not overwhelming)
- Stars and stripes patterns
- Bold diagonal stripes
- Eagle silhouettes
- Strong geometric shapes
- Red, white, blue gradients

### Replicate Prompt Keywords

**For backgrounds:**
```
patriotic American imagery, waving American flag, red white blue abstract,
majestic bald eagle, American landscape sunset, Mount Rushmore,
stars and stripes pattern, patriotic rally atmosphere, 
American heartland, freedom and liberty symbolism,
no text, no words, suitable for text overlay
```

**For event/rally imagery:**
```
American political rally, patriotic crowd, American flags waving,
confident leadership, American dream imagery, 
working class America, rural American landscape
```

### CSS Overlay Pattern

```css
.overlay {
  background: linear-gradient(
    135deg,
    rgba(0, 40, 104, 0.85) 0%,
    rgba(191, 10, 48, 0.75) 100%
  );
}
.headline {
  color: #ffffff;
  text-transform: uppercase;
  letter-spacing: 2px;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
}
.accent-bar {
  background: linear-gradient(90deg, #bf0a30, #d4af37);
  height: 4px;
}
```

---

## Ministry/Church

**Aesthetic:** Warm, welcoming, spiritually uplifting, trustworthy and peaceful.

### Color Palette

| Role | Hex | Usage |
|------|-----|-------|
| Primary | `#1e3a5f` | Deep spiritual blue |
| Secondary | `#2d5a7b` | Lighter blue |
| Accent Warm | `#d4a574` | Golden/wheat tones |
| Accent Light | `#f4e4bc` | Cream/parchment |
| Background Light | `#faf8f5` | Warm white |
| Background Dark | `#1a2332` | Evening sky |
| Text Dark | `#2c3e50` | Reading text |
| Text Light | `#ffffff` | On dark backgrounds |

### Typography

| Element | Font | Weight | Size (1200px width) |
|---------|------|--------|---------------------|
| Headline | `Playfair Display` | 700 | 56-72px |
| Subheadline | `Playfair Display` | 500 | 28-36px |
| Scripture | `EB Garamond` | 400 italic | 24-32px |
| Body | `Lato` | 400 | 18-22px |
| CTA | `Lato` | 600 | 18-22px |

Google Fonts import:
```
https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;700&family=EB+Garamond:ital,wght@0,400;1,400&family=Lato:wght@400;600&display=swap
```

### Visual Elements

- Soft light rays / divine light
- Nature imagery (mountains, water, sunrise)
- Subtle cross motifs
- Warm gradient overlays
- Gentle bokeh/light effects
- Open Bible or hands in prayer (contextual)

### Replicate Prompt Keywords

**For backgrounds:**
```
serene spiritual landscape, golden hour sunlight rays, 
peaceful mountain vista, calm waters reflection,
divine light breaking through clouds, sunrise over hills,
wheat field golden light, peaceful nature scene,
warm ethereal glow, heavenly atmosphere,
no text, no words, suitable for text overlay
```

**For event/worship imagery:**
```
church community gathering, hands raised in worship,
peaceful congregation, candlelit service atmosphere,
baptism water reflection, prayer hands soft light,
open Bible with warm lighting
```

### CSS Overlay Pattern

```css
.overlay {
  background: linear-gradient(
    180deg,
    rgba(30, 58, 95, 0.6) 0%,
    rgba(30, 58, 95, 0.8) 100%
  );
}
.headline {
  color: #ffffff;
  font-style: normal;
}
.scripture {
  color: #f4e4bc;
  font-style: italic;
  border-left: 3px solid #d4a574;
  padding-left: 20px;
}
.accent-text {
  color: #d4a574;
}
```

---

## Theme Selection Guide

| Content Type | Recommended Theme |
|--------------|-------------------|
| AI/Tech product | Cybernetic Luxury |
| SaaS announcement | Cybernetic Luxury |
| Software feature | Cybernetic Luxury |
| Political rally | Republican Campaign |
| Campaign announcement | Republican Campaign |
| Patriotic holiday | Republican Campaign |
| Sunday service | Ministry/Church |
| Bible verse/quote | Ministry/Church |
| Church event | Ministry/Church |
| Sermon series | Ministry/Church |
| Volunteer call | Ministry/Church |
