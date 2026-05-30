import sys
import os
import subprocess

try:
    import yt_dlp
except ImportError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "yt-dlp"])
    import yt_dlp

URL = "https://youtube.com/shorts/rDDQdk5-qxo"
ydl_opts = {
    'format': 'bestaudio/best',
    'outtmpl': 'downloaded_audio.%(ext)s',
    'postprocessors': [{
        'key': 'FFmpegExtractAudio',
        'preferredcodec': 'mp3',
        'preferredquality': '192',
    }],
}

with yt_dlp.YoutubeDL(ydl_opts) as ydl:
    ydl.download([URL])

print("Download complete.")
