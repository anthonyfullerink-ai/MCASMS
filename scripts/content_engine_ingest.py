#!/usr/bin/env python3
"""
Content Engine Ingestion Script
Extracts transcripts and metadata from YouTube videos using youtube-transcript-api and oEmbed.
Formats content into Markdown and JSON blocks for agent synthesis.
"""

import sys
import os
import json
import re
import urllib.request
import urllib.parse
from datetime import datetime, timezone

try:
    from youtube_transcript_api import YouTubeTranscriptApi
except ImportError:
    print(json.dumps({"success": False, "error": "youtube-transcript-api is not installed."}))
    sys.exit(1)

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
RESEARCH_FILE = os.path.join(DATA_DIR, "competitor_research.json")
RESEARCH_MD_FILE = os.path.join(DATA_DIR, "competitor_research.md")

os.makedirs(DATA_DIR, exist_ok=True)

def extract_video_id(url_or_id):
    url_or_id = url_or_id.strip()
    if re.match(r'^[a-zA-Z0-9_-]{11}$', url_or_id):
        return url_or_id
    
    patterns = [
        r'(?:v=|\/v\/|youtu\.be\/|\/embed\/|\/shorts\/)([a-zA-Z0-9_-]{11})',
        r'(\?|&)v=([a-zA-Z0-9_-]{11})'
    ]
    for pattern in patterns:
        match = re.search(pattern, url_or_id)
        if match:
            return match.group(1) if len(match.groups()) == 1 else match.group(2)
    return None

def fetch_video_metadata(video_id):
    try:
        url = f"https://www.youtube.com/watch?v={video_id}"
        oembed_url = f"https://www.youtube.com/oembed?url={urllib.parse.quote(url)}&format=json"
        req = urllib.request.Request(oembed_url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=5) as response:
            data = json.loads(response.read().decode('utf-8'))
            return {
                "title": data.get("title", f"YouTube Video {video_id}"),
                "author": data.get("author_name", "Unknown Creator"),
                "author_url": data.get("author_url", "")
            }
    except Exception:
        return {
            "title": f"YouTube Video {video_id}",
            "author": "Unknown Creator",
            "author_url": ""
        }

def ingest_video(url_or_id):
    video_id = extract_video_id(url_or_id)
    if not video_id:
        return {"success": False, "error": f"Invalid YouTube URL or ID: {url_or_id}"}
    
    meta = fetch_video_metadata(video_id)
    
    try:
        api = YouTubeTranscriptApi()
        try:
            transcript_obj = api.fetch(video_id, languages=['en', 'en-US', 'en-GB'])
        except Exception:
            # Fallback to any available transcript
            transcript_list = api.list(video_id)
            transcript_obj = transcript_list.find_transcript(['en', 'en-US', 'en-GB', 'en-auto'])
            if not transcript_obj:
                # pick first
                for t in transcript_list:
                    transcript_obj = t.fetch()
                    break
        
        raw_snippets = transcript_obj.to_raw_data() if hasattr(transcript_obj, 'to_raw_data') else transcript_obj
        full_text = " ".join([item.get('text', '') for item in raw_snippets if isinstance(item, dict)])
        
        # Clean formatting (strip line breaks, excessive spaces)
        cleaned_text = re.sub(r'\s+', ' ', full_text).strip()
        word_count = len(cleaned_text.split())
        
        entry = {
            "id": video_id,
            "url": f"https://www.youtube.com/watch?v={video_id}",
            "title": meta["title"],
            "author": meta["author"],
            "wordCount": word_count,
            "transcript": cleaned_text,
            "ingestedAt": datetime.now(timezone.utc).isoformat()
        }
        
        # Save to database
        existing_data = []
        if os.path.exists(RESEARCH_FILE):
            try:
                with open(RESEARCH_FILE, 'r', encoding='utf-8') as f:
                    existing_data = json.load(f)
            except Exception:
                existing_data = []
                
        # Upsert
        existing_data = [item for item in existing_data if item.get("id") != video_id]
        existing_data.insert(0, entry)
        
        with open(RESEARCH_FILE, 'w', encoding='utf-8') as f:
            json.dump(existing_data, f, indent=2, ensure_ascii=False)
            
        # Also write Markdown Context blob
        with open(RESEARCH_MD_FILE, 'w', encoding='utf-8') as f:
            f.write("# Content Engine Research & Competitor Ingestion Blob\n\n")
            f.write(f"*Last Updated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}*\n\n")
            for item in existing_data:
                f.write(f"## {item['title']}\n")
                f.write(f"- **Source**: [{item['author']}]({item['url']}) | **Words**: {item['wordCount']}\n\n")
                f.write(f"### Full Transcript\n```text\n{item['transcript']}\n```\n\n---\n\n")
                
        return {"success": True, "data": entry, "totalIngested": len(existing_data)}
        
    except Exception as e:
        return {"success": False, "error": f"Failed to get transcript for {video_id}: {str(e)}"}

if __name__ == "__main__":
    if len(sys.argv) > 1:
        target = sys.argv[1]
    else:
        try:
            target = sys.stdin.read().strip()
        except Exception:
            target = ""
            
    if not target:
        print(json.dumps({"success": False, "error": "No URL or Video ID provided"}))
        sys.exit(1)
        
    result = ingest_video(target)
    # Output cleanly as UTF-8
    sys.stdout.buffer.write(json.dumps(result, indent=2, ensure_ascii=False).encode('utf-8'))
    sys.stdout.buffer.write(b'\n')
