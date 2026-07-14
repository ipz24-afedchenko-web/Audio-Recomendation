import logging
logging.basicConfig(level=logging.INFO)

from app.database import SessionLocal
from app.models.music import Music
from app.routes.spotify import _analyze_spotify_preview_task

db = SessionLocal()
tracks = db.query(Music).filter(Music.analysis_status == 'analyzing', Music.source == 'spotify').all()
db.close()

print(f"Found {len(tracks)} stuck tracks.")

for i, t in enumerate(tracks):
    print(f"Processing {i+1}/{len(tracks)}: {t.title} by {t.artist}")
    try:
        _analyze_spotify_preview_task(t.id, t.preview_url, t.title, t.artist, [])
    except Exception as e:
        print(f"Error: {e}")
