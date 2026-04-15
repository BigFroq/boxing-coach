#!/usr/bin/env python3
"""Fetch remaining transcripts via Firecrawl stealth proxy scraping YouTube directly."""

import json
import os
import re
import subprocess
import time

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "content", "transcripts")
MANIFEST = os.path.join(OUTPUT_DIR, "manifest.json")

def sanitize(title):
    return re.sub(r'[^\w\s-]', '', title)[:80].strip().replace(' ', '_')

def extract_transcript_from_markdown(md):
    """Extract the transcript section from Firecrawl YouTube markdown."""
    marker = "## Transcript"
    idx = md.find(marker)
    if idx == -1:
        return None
    text = md[idx + len(marker):].strip()
    # Cut off at next section (## Endscreen, etc)
    for end_marker in ["## Endscreen", "## Comments"]:
        end_idx = text.find(end_marker)
        if end_idx != -1:
            text = text[:end_idx].strip()
    return text if len(text) > 100 else None

def main():
    with open(MANIFEST) as f:
        manifest = json.load(f)

    failed = [d for d in manifest if d['status'] == 'failed']
    print(f"Fetching {len(failed)} transcripts via Firecrawl...")

    success = 0
    still_fail = 0

    for i, entry in enumerate(failed):
        vid = entry['id']
        title = entry['title']
        url = f"https://www.youtube.com/watch?v={vid}"

        print(f"[{i+1}/{len(failed)}] {title}...", end=" ", flush=True)

        # Use firecrawl CLI via curl to their API
        # We'll use the MCP approach - call firecrawl_scrape via the script
        # Actually, let's just write out what we need and process with a node script
        filename = f"{vid}_{sanitize(title)}.md"
        filepath = os.path.join(OUTPUT_DIR, filename)

        if os.path.exists(filepath):
            print("SKIP (exists)")
            success += 1
            continue

        # Write a marker file so we know which ones to process
        marker_path = os.path.join(OUTPUT_DIR, f".pending_{vid}")
        with open(marker_path, 'w') as f:
            json.dump({"id": vid, "title": title, "filename": filename}, f)

        print(f"QUEUED")

    print(f"\nQueued pending files. Process them via Firecrawl MCP tool.")

if __name__ == "__main__":
    main()
