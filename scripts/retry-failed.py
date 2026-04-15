#!/usr/bin/env python3
"""Retry failed transcript downloads with delays to avoid rate limiting."""

import json
import os
import re
import time
import subprocess

from youtube_transcript_api import YouTubeTranscriptApi

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "content", "transcripts")
MANIFEST = os.path.join(OUTPUT_DIR, "manifest.json")
YT_DLP = "/Users/mark/Library/Python/3.9/bin/yt-dlp"

def sanitize_filename(title):
    return re.sub(r'[^\w\s-]', '', title)[:80].strip().replace(' ', '_')

def get_video_title(vid):
    """Get title from yt-dlp for a single video."""
    result = subprocess.run(
        [YT_DLP, "--print", "%(title)s", f"https://www.youtube.com/watch?v={vid}"],
        capture_output=True, text=True
    )
    return result.stdout.strip()

def get_video_duration(vid):
    result = subprocess.run(
        [YT_DLP, "--print", "%(duration_string)s", f"https://www.youtube.com/watch?v={vid}"],
        capture_output=True, text=True
    )
    return result.stdout.strip()

def main():
    with open(MANIFEST) as f:
        manifest = json.load(f)

    failed = [d for d in manifest if d['status'] == 'failed']
    print(f"Retrying {len(failed)} failed transcripts (3s delay between each)...")

    ytt = YouTubeTranscriptApi()
    success = 0
    still_failed = 0

    for i, entry in enumerate(failed):
        vid = entry['id']
        title = entry['title']
        print(f"[{i+1}/{len(failed)}] Trying: {title}...", end=" ", flush=True)

        # Delay to avoid rate limiting
        if i > 0:
            time.sleep(3)

        try:
            transcript = ytt.fetch(vid)
            text = ' '.join([t.text for t in transcript.snippets])

            filename = f"{vid}_{sanitize_filename(title)}.md"
            filepath = os.path.join(OUTPUT_DIR, filename)

            duration = get_video_duration(vid)

            with open(filepath, "w") as f:
                f.write(f"# {title}\n\n")
                f.write(f"**Video ID:** {vid}\n")
                f.write(f"**Duration:** {duration}\n")
                f.write(f"**Source:** https://www.youtube.com/watch?v={vid}\n\n")
                f.write(f"## Transcript\n\n{text}\n")

            # Update manifest
            for m in manifest:
                if m['id'] == vid:
                    m['status'] = 'ok'
                    m['file'] = filename
                    m['chars'] = len(text)
                    break

            print(f"OK ({len(text)} chars)")
            success += 1

        except Exception as e:
            err = str(e).split('\n')[0][:80]
            print(f"FAIL: {err}")
            still_failed += 1

    # Save updated manifest
    with open(MANIFEST, "w") as f:
        json.dump(manifest, f, indent=2)

    print(f"\nDone: {success} recovered, {still_failed} still failing")

if __name__ == "__main__":
    main()
