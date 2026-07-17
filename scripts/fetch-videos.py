#!/usr/bin/env python3
"""Fetch transcripts for specific YouTube video IDs given on the command line.

General-purpose sibling of fetch-shorts.py (which is a fixed 15-short list).
Writes the same transcript .md format that incremental-ingest.ts parses
(**Video ID:**, **Source:**, ## Transcript) and updates manifest.json.

Usage: python3 scripts/fetch-videos.py <id1> <id2> ...
"""

import json
import os
import re
import subprocess
import sys

from youtube_transcript_api import YouTubeTranscriptApi

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "content", "transcripts")
YT_DLP = "/Users/mark/.local/bin/yt-dlp"


def get_video_info(video_id):
    result = subprocess.run(
        [YT_DLP, "--print", "%(title)s|||%(duration_string)s",
         f"https://www.youtube.com/watch?v={video_id}"],
        capture_output=True, text=True, timeout=30
    )
    if "|||" in result.stdout:
        parts = result.stdout.strip().split("|||", 1)
        return parts[0].strip(), parts[1].strip() if len(parts) > 1 else ""
    return None, ""


def sanitize_filename(title):
    clean = re.sub(r'[^\w\s-]', '', title)[:80].strip()
    return clean.replace(' ', '_')


def fetch_transcript(video_id):
    ytt = YouTubeTranscriptApi()
    transcript = ytt.fetch(video_id)
    return ' '.join([t.text for t in transcript.snippets])


def load_manifest():
    path = os.path.join(OUTPUT_DIR, "manifest.json")
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    return []


def save_manifest(manifest):
    with open(os.path.join(OUTPUT_DIR, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)


def main():
    ids = sys.argv[1:]
    if not ids:
        print("Usage: python3 scripts/fetch-videos.py <id1> <id2> ...")
        sys.exit(1)

    manifest = load_manifest()
    success, failed = 0, []

    for i, vid in enumerate(ids):
        print(f"\n[{i+1}/{len(ids)}] {vid}")
        title, duration = get_video_info(vid)
        if not title:
            print("  FAIL: could not get video info")
            failed.append(vid)
            continue
        print(f"  Title: {title}")

        filename = f"{vid}_{sanitize_filename(title)}.md"
        filepath = os.path.join(OUTPUT_DIR, filename)

        try:
            text = fetch_transcript(vid)
            with open(filepath, "w") as f:
                f.write(f"# {title}\n\n")
                f.write(f"**Video ID:** {vid}\n")
                f.write(f"**Duration:** {duration}\n")
                f.write(f"**Source:** https://www.youtube.com/watch?v={vid}\n\n")
                f.write(f"## Transcript\n\n{text}\n")
            print(f"  OK: {len(text)} chars")
            existing = next((e for e in manifest if e["id"] == vid), None)
            if existing:
                existing.update({"title": title, "file": filename, "chars": len(text), "status": "ok"})
                existing.pop("error", None)
            else:
                manifest.append({"id": vid, "title": title, "file": filename, "chars": len(text), "status": "ok"})
            success += 1
        except Exception as e:
            print(f"  FAIL: {e}")
            existing = next((e2 for e2 in manifest if e2["id"] == vid), None)
            if existing:
                existing["status"] = "failed"
                existing["error"] = str(e)
            else:
                manifest.append({"id": vid, "title": title, "status": "failed", "error": str(e)})
            failed.append(title)

    save_manifest(manifest)
    print(f"\n{'='*60}\nDone: {success} ok, {len(failed)} failed out of {len(ids)}")
    for t in failed:
        print(f"  - {t}")


if __name__ == "__main__":
    main()
