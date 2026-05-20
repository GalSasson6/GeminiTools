# Gemini Model Usage Counter

An unofficial Chrome extension that tracks Gemini model usage directly in the Gemini UI.

## Features

- Shows a usage badge beside the active Gemini model.
- Tracks usage separately for supported model labels such as Fast, Thinking, Pro, and Deep Research.
- Adds usage badges inside the Gemini model switcher.
- Lets you edit per-model limits and reset windows from the popup.
- Optional composer auto-direction for mixed Hebrew and English text.
- Optional neon styling for Gemini math output.
- Includes quick selected-text context insertion and Shift+Tab model cycling.

## Install Locally

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this repository folder.
5. Open `https://gemini.google.com/` or `https://aistudio.google.com/`.

## Privacy

The extension stores usage counts and settings with `chrome.storage.sync`. It does not send your prompts, messages, counts, or settings to an external server.

## Notes

This project is not affiliated with Google or Gemini. Gemini UI selectors can change, so some features may need updates when Google changes the site.
