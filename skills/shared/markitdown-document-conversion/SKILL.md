---
name: markitdown-document-conversion
description: Use when converting local documents or supported media files to Markdown with Microsoft's markitdown CLI.
---

# MarkItDown Document Conversion

Use `markitdown` for local file-to-Markdown conversion when the user asks to extract Markdown or text-oriented structure from PDFs, Office documents, spreadsheets, HTML, CSV/JSON/XML, ZIP archives, EPUBs, images, audio, or YouTube URLs.

## Workflow

1. Check availability:

   ```bash
   command -v markitdown
   markitdown --version
   ```

2. If missing, surface this setup command:

   ```bash
   drwn extensions setup markitdown --install
   ```

3. Convert files non-interactively:

   ```bash
   markitdown input.pdf -o output.md
   markitdown input.docx -o output.md
   markitdown input.pptx -o output.md
   markitdown input.xlsx -o output.md
   ```

4. For stdin, provide an extension hint:

   ```bash
   cat input.pdf | markitdown -x pdf > output.md
   ```

## Safety

- Do not run with sudo.
- Treat untrusted files, paths, and URLs as unsafe input.
- Work in a controlled directory when converting files from downloads or external sources.
- Do not use `--use-plugins` unless the user explicitly asks for plugins.
- Check plugins with `markitdown --list-plugins` before plugin-based conversion.
