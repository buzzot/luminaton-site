# Datasheets folder

This is where PDF datasheets live. The customer cabinet (`/cabinet/dashboard`) scans this folder at request time and lists everything inside.

## How to add a datasheet

1. Pick a category (or create a new subfolder).
2. Drop the PDF into that subfolder.
3. (Optional) Add or update `meta.json` in the subfolder to give the category and each file a nicer title and description.

That's it — no server restart, no code change. Refresh the dashboard.

## Folder layout

```
datasheets/
├── led-modules/
│   ├── meta.json
│   ├── LM-2835-12V.pdf
│   └── LM-3030-24V.pdf
├── led-strips/
│   ├── meta.json
│   ├── strip-5050-rgbw.pdf
│   └── strip-2835-highcri.pdf
└── accessories/
    ├── meta.json
    └── driver-100w.pdf
```

## Optional meta.json schema

```json
{
  "title": "LED Modules",
  "description": "High-output SMD modules for signage and architectural use.",
  "order": 1,
  "files": {
    "LM-2835-12V.pdf": {
      "title": "LM-2835 · 12V (waterproof)",
      "description": "Standard 12V module, IP67, 2835 chip, 6500K."
    },
    "LM-3030-24V.pdf": {
      "title": "LM-3030 · 24V (high-bright)",
      "description": "High-output 24V module for channel letters and light boxes."
    }
  }
}
```

All fields are optional. If `meta.json` is missing, the system will:
- Use the folder name (titleized) as the category title
- Use each PDF filename (minus the extension) as the file title
- Sort categories alphabetically

## Uploading on Hostinger

Use hPanel → **File Manager**, navigate to `domains/luminaton.com/public_html/datasheets/`, and upload PDFs directly into the appropriate subfolder. Or via SFTP / SSH.
