# Markdown Studio

A word-processor style Markdown viewer and editor for macOS. Open any `.md` file, see it fully rendered, edit it in place, and save it back as plain Markdown. Type `/` anywhere to insert blocks Notion-style.

## Features

- Renders every common Markdown element: headings 1–6, bold / italic / underline / strikethrough / inline code / ==highlight==, links, bulleted / numbered / nested lists, task lists with clickable checkboxes, blockquotes, fenced code blocks with syntax highlighting, GFM tables, images (relative paths resolve next to the file), horizontal rules, hard line breaks.
- WYSIWYG editing with a formatting toolbar, a floating bubble menu on selection, and Markdown shortcuts as you type (`# `, `- `, `1. `, `[ ] `, `> `, ` ``` `, `**bold**`, …).
- `/` command menu: Text, Heading 1–3, Bulleted / Numbered / To-do list, Quote, Code block, Divider, Table, Image (from disk or URL), Link, Line break, Date.
- New, Open, Save, Save As… with native macOS dialogs. Files are always saved as `.md`.
- Multiple windows, unsaved-changes prompt on close, Open Recent, Reveal in Finder, drag-and-drop `.md` files to open and images to insert.
- "Source" toggle (⇧⌘M) to view and edit the raw Markdown; changes flow both ways.
- Find (⌘F), word/character count, double-click `.md` files in Finder to open them.
- Light and dark mode: follows the system by default, or pick **View → Appearance → System / Light / Dark**. The choice is remembered.

## Install (prebuilt)

1. Open `release/Markdown Studio-1.0.0-arm64.dmg` (Apple Silicon) or `release/Markdown Studio-1.0.0.dmg` (Intel).
2. Drag **Markdown Studio** into **Applications**.
3. The app is not code-signed or notarized, so the first launch on any Mac shows a Gatekeeper warning. Either right-click the app and choose **Open**, or run:

```bash
xattr -cr "/Applications/Markdown Studio.app"
```

To get rid of that warning permanently you need an Apple Developer ID certificate. Set `identity` in `electron-builder.yml` (or remove the line) and enable `hardenedRuntime` and notarization; electron-builder handles the rest.

## Build from source

```bash
npm install
npm run dist          # DMG + zip for arm64 and x64 in release/
npm run dist:universal   # single universal binary
npm start             # build and launch locally
npm run dev           # Vite dev server + Electron with hot reload
npm test              # end-to-end test against the real app
```

`npm run icon` regenerates `build/icon.icns` from `scripts/make-icon.swift`.

## Keyboard shortcuts

| Keys | Action |
| --- | --- |
| ⌘N · ⌘O · ⌘S · ⇧⌘S | New · Open · Save · Save As |
| `/` | Command menu |
| ⌘B · ⌘I · ⌘U · ⇧⌘X | Bold · Italic · Underline · Strikethrough |
| ⌘E · ⇧⌘H · ⌘K | Inline code · Highlight · Link |
| ⌥⌘1…4 · ⌥⌘0 | Heading 1–4 · Plain text |
| ⇧⌘8 · ⇧⌘7 · ⇧⌘9 | Bulleted · Numbered · Task list |
| ⇧⌘B · ⌥⌘C | Quote · Code block |
| ⇧⌘M | Toggle Markdown source |
| ⌘F | Find |
| ⌘-click link | Open in browser |

## Notes on fidelity

Markdown is parsed into a document model and re-serialized on save, so the output is normalized: table columns are re-padded, trailing whitespace is dropped, and bare URLs become explicit links. Content, structure, code fence languages, task states, nested lists, and image paths are preserved. A file is not marked as modified just by opening it.

## Stack

Electron 44 · Vite 8 · Tiptap 3 (ProseMirror) with `@tiptap/markdown` · lowlight for syntax highlighting · electron-builder.

## Layout

```
electron/main.cjs     app lifecycle, windows, menus, file dialogs, save/open IPC
electron/preload.cjs  the small API bridge exposed to the page
src/main.js           app controller: toolbar, source view, find, drag & drop, dirty tracking
src/editor.js         Tiptap setup, slash-command extension, local image resolution
src/slash-menu.js     the "/" command list and popup
src/styles.css        document typography, light/dark themes
tests/e2e.mjs         Playwright-driven end-to-end test
samples/              kitchen-sink.md exercising every element
```
