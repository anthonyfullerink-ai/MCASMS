#!/usr/bin/env python3
"""
Veo 3.1 Automated 9:16 Vertical Video Reel Generator for Missed Call Auto SMS
Uses Google Veo (veo-3.1-fast-generate-preview) via Google GenAI SDK.
"""

import os
import sys
import time
import json
from pathlib import Path

# Load .env if present
def load_env():
    env_file = Path(__file__).resolve().parent.parent / '.env'
    if env_file.exists():
        with open(env_file, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    k, v = line.split('=', 1)
                    k, v = k.strip(), v.strip()
                    if (v.startswith('"') and v.endswith('"')) or (v.startswith("'") and v.endswith("'")):
                        v = v[1:-1]
                    if k not in os.environ:
                        os.environ[k] = v

load_env()

def generate_reel(prompt: str, output_path: str = "assets/ads/veo_generated_reel.mp4", aspect_ratio: str = "9:16"):
    """
    Generates a 9:16 vertical video reel using Google's Veo 3.1 model.
    """
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        print(json.dumps({"success": False, "error": "GEMINI_API_KEY environment variable is not set."}))
        return False

    out_file = Path(output_path)
    out_file.parent.mkdir(parents=True, exist_ok=True)

    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=api_key)
        print(f"🎬 [Veo 3.1] Submitting 9:16 vertical reel request...")
        print(f"📝 Prompt: '{prompt[:120]}...'")

        operation = client.models.generate_videos(
            model="veo-3.1-fast-generate-preview",
            prompt=prompt,
            config=types.GenerateVideosConfig(
                aspect_ratio=aspect_ratio,
                resolution="720p",
            ),
        )

        start_time = time.time()
        while not operation.done:
            elapsed = int(time.time() - start_time)
            print(f"⏳ Generating video reel... ({elapsed}s elapsed)", end="\r", flush=True)
            time.sleep(15)
            operation = client.operations.get(operation)

        print("\n✨ Video reel generation completed!")

        if operation.error:
            print(f"❌ [Generation Error] {operation.error}")
            return False

        generated_video = operation.response.generated_videos[0]
        video_bytes = client.files.download(file=generated_video.video)

        with open(out_file, "wb") as f:
            f.write(video_bytes)

        abs_path = str(out_file.resolve())
        print(f"🎉 Success! 9:16 Reel saved to: {abs_path}")
        print(json.dumps({"success": True, "filePath": abs_path, "relative": str(out_file)}))
        return True

    except Exception as e:
        print(f"\n❌ [Error] Failed to generate video with Veo 3.1: {e}")
        return False

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python generate_veo_reel.py \"prompt\" [output_path.mp4] [aspect_ratio]")
        sys.exit(1)

    user_prompt = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else "assets/ads/veo_generated_reel.mp4"
    ratio = sys.argv[3] if len(sys.argv) > 3 else "9:16"

    success = generate_reel(user_prompt, out, ratio)
    sys.exit(0 if success else 1)
