"""Build the narrated tour from the staged recording (no project credentials).

Local tooling: pip install edge-tts==7.3.1 imageio-ffmpeg==0.8.0
Run from any directory: python frontend/scripts/narrate-walkthrough.py
Only the public narration text is sent to the online speech service.
"""
import asyncio
import json
import subprocess
import wave
from pathlib import Path

import edge_tts
import imageio_ffmpeg

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "frontend/public/assets/tutorial"
WORK = ROOT / "tmp/tutorial/narration"
VOICE = "en-IN-NeerjaNeural"
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
# Boundaries measured in the encoded recording, not recorder wall-clock time.
SCENES = [
    (0, 5.8, "Welcome to Ledgerly. Sign in with Google or email to open your private workspace."),
    (5.8, 12, "Your workspace starts with sample purchase orders. Use synthetic invoices for this demo."),
    (12, 19.2, "Open the sample walkthrough and choose Approve a valid invoice. Use sample selects the PDF without uploading it."),
    (19.2, 25.2, "Check the filename, then start the workflow. Scanned documents may take longer."),
    (25.2, 31.2, "Ready for approval means the checks passed. A person still needs to review the invoice."),
    (31.2, 36.4, "Inspect the vendor, duplicate and purchase order checks. Expand a rule to see its reasoning."),
    (36.4, 43.4, "Compare the extracted values and source excerpts with the original PDF."),
    (43.4, 51.8, "Add a meaningful review note with at least five characters. Then approve after checking the evidence."),
    (51.8, 57.2, "If checks remain unresolved, request information or reject the invoice instead."),
    (57.2, 64.2, "Open Purchase orders. Approving sixty thousand rupees leaves forty thousand on this sample order. No payment is sent."),
    (64.2, 71.08, "Now try the duplicate, overage, missing information and scanned samples. Your workspace history affects the results."),
]


def run(*args):
    subprocess.run([FFMPEG, "-hide_banner", "-loglevel", "error", "-y", *map(str, args)], check=True)


def timestamp(seconds):
    millis = round(seconds * 1000)
    return f"{millis // 3600000:02}:{millis // 60000 % 60:02}:{millis // 1000 % 60:02}.{millis % 1000:03}"


async def main():
    WORK.mkdir(parents=True, exist_ok=True)
    cues, timeline, cursor = ["WEBVTT", ""], [], 0.0
    for index, (start, end, text) in enumerate(SCENES):
        speech = WORK / f"{index:02}.mp3"
        await edge_tts.Communicate(text, VOICE).save(str(speech))
        pcm = WORK / f"{index:02}.wav"
        run("-i", speech, "-ar", "24000", "-ac", "1", pcm)
        with wave.open(str(pcm)) as audio:
            spoken = audio.getnframes() / audio.getframerate()
        # Keep the original screen timing; hold its last frame if speech needs more time.
        duration = max(end - start, spoken + 0.8)
        duration = round(duration * 25 + 0.5) / 25
        run("-ss", start, "-t", end - start, "-i", ASSETS / "ledgerly-walkthrough.webm",
            "-i", speech, "-filter_complex",
            f"[0:v]fps=25,tpad=stop_mode=clone:stop_duration={duration},trim=duration={duration},setpts=PTS-STARTPTS[v];"
            f"[1:a]adelay=300:all=1,apad,atrim=duration={duration},asetpts=PTS-STARTPTS[a]",
            "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-preset", "fast", "-crf", "23",
            "-pix_fmt", "yuv420p", "-c:a", "aac", "-ar", "48000", "-b:a", "128k", WORK / f"{index:02}.mp4")
        cues += [f"{timestamp(cursor + 0.3)} --> {timestamp(cursor + 0.3 + spoken)}", text, ""]
        timeline.append({"start": round(cursor, 3), "duration": duration, "speech_seconds": round(spoken, 3), "text": text})
        cursor += duration
        print(f"Scene {index + 1}: {duration:.2f}s; speech {spoken:.2f}s", flush=True)
    listing = WORK / "concat.txt"
    listing.write_text("\n".join(f"file '{i:02}.mp4'" for i in range(len(SCENES))), encoding="utf-8")
    run("-f", "concat", "-safe", "0", "-i", listing, "-c:v", "copy", "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
        "-c:a", "aac", "-ar", "48000", "-b:a", "128k", "-movflags", "+faststart", ASSETS / "ledgerly-walkthrough-narrated.mp4")
    (ASSETS / "narration.vtt").write_text("\n".join(cues), encoding="utf-8")
    (WORK / "timeline.json").write_text(json.dumps({"voice": VOICE, "duration": cursor, "scenes": timeline}, indent=2), encoding="utf-8")
    print(f"Narrated tour: {cursor:.2f}s", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
