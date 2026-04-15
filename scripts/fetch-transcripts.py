#!/usr/bin/env python3
"""Fetch all YouTube transcripts from The Punch Doctor channel."""

import json
import os
import re
import subprocess
import sys

from youtube_transcript_api import YouTubeTranscriptApi

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "content", "transcripts")
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Get video list from yt-dlp
YT_DLP = "/Users/mark/Library/Python/3.9/bin/yt-dlp"
CHANNEL = "https://www.youtube.com/@ThePunchDoctor/videos"

def get_video_list():
    """Get all video IDs and titles from the channel."""
    result = subprocess.run(
        [YT_DLP, "--flat-playlist", "--print", "%(id)s|||%(title)s|||%(duration_string)s", CHANNEL],
        capture_output=True, text=True
    )
    videos = []
    for line in result.stdout.strip().split("\n"):
        if "|||" not in line:
            continue
        parts = line.split("|||")
        if len(parts) >= 2:
            videos.append({
                "id": parts[0].strip(),
                "title": parts[1].strip(),
                "duration": parts[2].strip() if len(parts) > 2 else ""
            })
    return videos

def sanitize_filename(title):
    """Make title safe for filenames."""
    return re.sub(r'[^\w\s-]', '', title)[:80].strip().replace(' ', '_')

def fetch_transcript(video_id):
    """Fetch transcript for a single video."""
    ytt = YouTubeTranscriptApi()
    transcript = ytt.fetch(video_id)
    return ' '.join([t.text for t in transcript.snippets])

def main():
    print("Fetching video list...")
    videos = get_video_list()
    print(f"Found {len(videos)} videos")

    success = 0
    failed = []
    manifest = []

    for i, video in enumerate(videos):
        vid = video["id"]
        title = video["title"]
        filename = f"{vid}_{sanitize_filename(title)}.md"
        filepath = os.path.join(OUTPUT_DIR, filename)

        if os.path.exists(filepath):
            print(f"[{i+1}/{len(videos)}] SKIP (exists): {title}")
            manifest.append({"id": vid, "title": title, "file": filename, "status": "exists"})
            success += 1
            continue

        try:
            text = fetch_transcript(vid)
            with open(filepath, "w") as f:
                f.write(f"# {title}\n\n")
                f.write(f"**Video ID:** {vid}\n")
                f.write(f"**Duration:** {video['duration']}\n")
                f.write(f"**Source:** https://www.youtube.com/watch?v={vid}\n\n")
                f.write(f"## Transcript\n\n{text}\n")

            print(f"[{i+1}/{len(videos)}] OK: {title} ({len(text)} chars)")
            manifest.append({"id": vid, "title": title, "file": filename, "chars": len(text), "status": "ok"})
            success += 1
        except Exception as e:
            print(f"[{i+1}/{len(videos)}] FAIL: {title} — {e}")
            manifest.append({"id": vid, "title": title, "status": "failed", "error": str(e)})
            failed.append(title)

    # Write manifest
    manifest_path = os.path.join(OUTPUT_DIR, "manifest.json")
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)

    print(f"\nDone: {success} ok, {len(failed)} failed out of {len(videos)}")
    if failed:
        print("Failed videos:")
        for t in failed:
            print(f"  - {t}")

if __name__ == "__main__":
    main()
