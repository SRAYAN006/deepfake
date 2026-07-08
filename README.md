# DeepGuard — AI-Based Deepfake Image Validator

> **Detect AI-generated and manipulated images — 100% locally, no data uploaded.**

---

## Feature List

| # | Feature | Status |
|---|---|---|
| 1 | Drag & Drop / Browse / Paste image upload | ✅ |
| 2 | AI detection via TensorFlow.js (with graceful fallback) | ✅ |
| 3 | Heuristic analysis engine (noise, edges, color, compression) | ✅ |
| 4 | Real / AI Generated / Suspicious verdict | ✅ |
| 5 | Confidence score & Trust Score ring | ✅ |
| 6 | Image info dashboard (dimensions, size, format) | ✅ |
| 7 | RGB Color Histogram (Canvas API) | ✅ |
| 8 | Detection Indicators (explainability) | ✅ |
| 9 | Score Breakdown Chart | ✅ |
| 10 | Detection History (localStorage, max 100) | ✅ |
| 11 | Image Comparison Mode | ✅ |
| 12 | Pixel Difference Heatmap | ✅ |
| 13 | Export: JSON report | ✅ |
| 14 | Export: PDF report (print dialog) | ✅ |
| 15 | Settings: Dark/Light theme | ✅ |
| 16 | Settings: Confidence threshold | ✅ |
| 17 | Settings: Auto-analyze on upload | ✅ |
| 18 | Settings: Save history toggle | ✅ |
| 19 | Keyboard navigable | ✅ |
| 20 | ARIA labels & semantic HTML | ✅ |
| 21 | Respects prefers-reduced-motion | ✅ |
| 22 | Mobile-first responsive design | ✅ |
| 23 | Floating Analyze button (mobile) | ✅ |
| 24 | Zero data uploaded — 100% private | ✅ |

---

## Setup Instructions

### Option 1: Open Directly (Quickest)

> **Note:** ES Modules require a server due to browser CORS policy.

```bash
# Install a simple static server globally (one time)
npm install -g serve

# Serve the app
cd path/to/deepfake
serve .
```

Then open `http://localhost:3000` in your browser.

### Option 2: Python (No npm needed)

```bash
cd path/to/deepfake
python -m http.server 8000
```

Open `http://localhost:8000`.

### Option 3: VS Code Live Server

1. Install the **Live Server** extension in VS Code.
2. Right-click `index.html` → **Open with Live Server**.

---

## AI Model Information

### Mode 1: TensorFlow.js Model (Preferred)

DeepGuard first attempts to load:
1. A custom trained model from `/assets/model/model.json`
2. MobileNet v2 from CDN as a feature extractor

**To add your own model:**

1. Train a binary classifier on real vs. AI-generated images.
2. Convert to TF.js format:
   ```bash
   pip install tensorflowjs
   tensorflowjs_converter --input_format=keras my_model.h5 ./assets/model/
   ```
3. Place `model.json` and shard files in `/assets/model/`.

**Recommended datasets:**
- [FaceForensics++](https://github.com/ondyari/FaceForensics)
- [DFDC (Deepfake Detection Challenge)](https://ai.facebook.com/datasets/dfdc/)
- [CIFAKE: Real and AI-Generated Synthetic Images](https://www.kaggle.com/datasets/birdy654/cifake-real-and-ai-generated-synthetic-images)

### Mode 2: Heuristic Analysis Engine (Fallback)

When no model is available, DeepGuard uses pixel-level analysis:

| Signal | AI Indicator | Real Indicator |
|---|---|---|
| Noise Level | Very low (too clean) | Moderate sensor noise |
| Edge Score | Soft/blurred edges | Sharp, natural edges |
| Color Entropy | Over-saturated | Natural distribution |
| Compression | Lossless/minimal artifacts | JPEG artifacts present |
| Image Dimensions | Round numbers (512, 1024…) | Varied |

---

## Storage Schema

```
localStorage key: deepfakeValidator:data
```

```json
{
  "version": 2,
  "settings": {
    "theme": "dark",
    "confidenceThreshold": 65,
    "autoAnalyze": true,
    "saveHistory": true,
    "enableAnimations": true
  },
  "history": [
    {
      "id": "abc123",
      "filename": "photo.jpg",
      "timestamp": 1720451234567,
      "prediction": "Real",
      "confidence": 87.3,
      "trustScore": 91,
      "fileSize": "2.4 MB",
      "format": "JPEG",
      "thumbUrl": "data:image/jpeg;base64,..."
    }
  ]
}
```

**Schema migration** is handled automatically via `migrate()` in `storage.js`.

---

## Manual Testing Checklist

### Upload
- [ ] Drag & drop a JPG image → image previews correctly
- [ ] Click "Browse Files" → file picker opens
- [ ] Paste an image from clipboard → image loads
- [ ] Upload a non-image file → error message shown
- [ ] Upload a file > 20 MB → error message shown
- [ ] Upload a corrupted file → graceful error shown

### Analysis
- [ ] Click "Analyze Image" → progress steps animate
- [ ] Result appears: Real / AI Generated / Suspicious
- [ ] Confidence bar fills to correct percentage
- [ ] Trust Score ring animates
- [ ] Detection indicators list populated
- [ ] Score breakdown chart renders
- [ ] Color histogram renders
- [ ] Image info (dimensions, size, format) populated
- [ ] Heuristic notice shown when model not loaded

### History
- [ ] After analysis, entry appears in History panel
- [ ] History entry shows thumbnail, filename, date, prediction
- [ ] Delete entry removes it from list
- [ ] "Clear All" removes all entries
- [ ] History persists after page refresh

### Comparison
- [ ] Upload two images to Compare tab
- [ ] "Compare Both" runs analysis on each
- [ ] Badges show predictions for each
- [ ] Pixel difference heatmap renders

### Export
- [ ] "JSON" button downloads a valid JSON report
- [ ] "PDF" opens a print-ready HTML page

### Settings
- [ ] Theme toggle switches dark ↔ light mode
- [ ] Theme persists after page refresh
- [ ] Threshold slider changes value & persists
- [ ] Auto-analyze toggle works (on: analyze on upload, off: manual only)
- [ ] Save History = off → no entries saved after analysis

### Accessibility
- [ ] Tab key navigates all interactive elements
- [ ] Focus outlines visible on all focusable elements
- [ ] Upload zone works with Enter/Space keyboard
- [ ] Screen reader announces analysis results (aria-live)

---

## Project Structure

```
deepfake/
├── index.html     — Main app shell (semantic HTML, ARIA)
├── styles.css     — Complete design system (CSS custom properties)
├── app.js         — App controller & UI logic
├── model.js       — TF.js inference + heuristic detection engine
├── storage.js     — localStorage CRUD with schema migration
├── utils.js       — File validation, export, histogram, pixel analysis
├── assets/
│   └── model/     — Place TF.js model files here
└── README.md      — This file
```

---

## Future Improvements

1. **Grad-CAM Heatmap** — Attention overlay highlighting suspicious regions
2. **EXIF Metadata Extraction** — Display camera model, GPS, timestamps
3. **Batch Processing** — Analyze multiple images at once
4. **Browser Extension** — Right-click → "Check with DeepGuard"
5. **Custom Model Upload** — Let users load their own `.json` model in-browser
6. **WebGPU Acceleration** — Faster inference using WebGPU API
7. **Offline PWA** — Service Worker for full offline capability
8. **Shareable Report Links** — Generate share-able URLs (no PII)

---

## Privacy & Security

- 🛡 **Zero server communication** — all analysis runs in your browser
- 🔒 **No image data stored externally** — localStorage only, browser-local
- 🧹 **Filename sanitization** — user filenames never used in `innerHTML`
- 🚫 **No analytics** — no tracking, no cookies

---

*DeepGuard v1.0 — Built with HTML5, CSS3, Vanilla JS, TensorFlow.js*
