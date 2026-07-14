import sys
import logging

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(name)s: %(message)s')
logger = logging.getLogger("fix_genres")

from app.database import SessionLocal
from app.models.music import Music
from app.services.ai_tagger import AITagger
from app.utils.audio_utils import genre_to_title_case

def main():
    db = SessionLocal()
    try:
        tagger = AITagger()
        
        # We will only fix tracks labeled as "Jazz" for now, or tracks where genre is None
        bad_tracks = db.query(Music).filter((Music.genre == "Jazz") | (Music.genre.is_(None))).all()
        logger.info(f"Found {len(bad_tracks)} tracks needing genre re-classification.")
        
        fixed = 0
        for track in bad_tracks:
            try:
                artist_name = track.artist or "Unknown"
                title = track.title or "Unknown"
                
                logger.info(f"Fetching genre for {title} by {artist_name}...")
                genre = tagger.fetch_genre_with_ai(artist_name, title, allowed_genres=None)
                
                if genre:
                    track.genre = genre_to_title_case(genre)
                    db.commit()
                    fixed += 1
                    logger.info(f"Updated {title} to {track.genre}")
                else:
                    logger.warning(f"Failed to fetch genre for {title}")
                    
            except Exception as e:
                logger.error(f"Error for {track.title}: {e}")
                
        logger.info(f"Successfully fixed {fixed} genres.")
        
    finally:
        db.close()

if __name__ == "__main__":
    main()
    from app.services.train_models import train_clusters
    train_clusters()