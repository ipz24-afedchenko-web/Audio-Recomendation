"""
AI-powered metadata extraction service.

Uses Google Gemini API to parse filenames and MusicBrainz API to fetch metadata.
"""

import os
import re
import time
import json
import logging
from typing import Optional, Dict, Any
from pathlib import Path

import musicbrainzngs
from google import genai
from google.genai import types

from app.utils.audio_utils import GENRE_VOCABULARY, _normalize_genre

logger = logging.getLogger(__name__)


class AITagger:
    """
    AI-powered music metadata tagger.

    Combines Gemini API for filename parsing and MusicBrainz API for metadata lookup.
    """

    def __init__(self):
        """Initialize AI tagger with API configurations."""
        # Configure Gemini
        self.gemini_api_key = os.getenv("GEMINI_API_KEY")
        if not self.gemini_api_key:
            raise ValueError("GEMINI_API_KEY environment variable is required")

        self.gemini_client = genai.Client(api_key=self.gemini_api_key)
        self.gemini_model = "gemini-flash-latest"  # Use latest flash for higher free tier limits

        # Configure MusicBrainz
        musicbrainzngs.set_useragent(
            "MusicGenreClassifier",
            "1.0",
            "https://github.com/yourusername/music-genre-classifier"
        )

        # Rate limiting for MusicBrainz (1 req/sec max)
        self.last_mb_request_time = 0
        self.mb_rate_limit = 1.0  # seconds between requests

    def parse_filename(self, filename: str) -> Dict[str, str]:
        """
        Parse a music filename into artist and title using Gemini AI.

        Args:
            filename: Audio filename (with or without extension)

        Returns:
            Dictionary with 'artist' and 'title' keys

        Example:
            >>> tagger.parse_filename("Pink_Floyd-Comfortably_Numb.mp3")
            {"artist": "Pink Floyd", "title": "Comfortably Numb"}
        """
        # Remove file extension
        name_without_ext = Path(filename).stem

        # Try simple pattern matching first (faster)
        parsed = self._try_simple_parse(name_without_ext)
        if parsed:
            return parsed

        # Fall back to AI parsing for complex filenames
        try:
            prompt = f"""Parse this music filename into artist and title.
Remove any extraneous information like quality indicators (320kbps, FLAC),
years, brackets, numbers, or file metadata. Return clean, readable names.

Filename: {name_without_ext}

Return only the artist and title."""

            max_retries = 3
            retry_delay = 5.0
            
            for attempt in range(max_retries):
                try:
                    time.sleep(4.1)  # Gemini 1.5 Flash free tier is 15 RPM. Sleep ~4s to stay under limit.
                    response = self.gemini_client.models.generate_content(
                        model=self.gemini_model,
                        contents=prompt,
                        config=types.GenerateContentConfig(
                            response_mime_type="application/json",
                            response_schema={
                                "type": "object",
                                "properties": {
                                    "artist": {"type": "string"},
                                    "title": {"type": "string"},
                                    "album": {"type": "string"}
                                },
                                "required": ["artist", "title"]
                            }
                        )
                    )
                    break
                except Exception as e:
                    err_str = str(e)
                    if "429" in err_str and attempt < max_retries - 1:
                        logger.warning(f"Gemini API rate limit hit in parse_filename. Retrying in {retry_delay}s...")
                        time.sleep(retry_delay)
                        retry_delay *= 2
                    else:
                        raise e

            result = json.loads(response.text)
            return {
                "artist": result.get("artist", "Unknown Artist"),
                "title": result.get("title", "Unknown Title")
            }

        except Exception as e:
            # Fallback to simple split if AI fails
            return self._fallback_parse(name_without_ext)

    def _try_simple_parse(self, filename: str) -> Optional[Dict[str, str]]:
        """Try to parse filename using common patterns."""
        # Pattern 1: Artist - Title
        match = re.match(r'^(.+?)\s*-\s*(.+?)$', filename)
        if match:
            artist, title = match.groups()
            # Clean up
            artist = self._clean_string(artist)
            title = self._clean_string(title)
            if artist and title:
                return {"artist": artist, "title": title}

        return None

    def _fallback_parse(self, filename: str) -> Dict[str, str]:
        """Fallback parsing when all else fails."""
        parts = re.split(r'[-_]', filename, 1)
        if len(parts) >= 2:
            return {
                "artist": self._clean_string(parts[0]),
                "title": self._clean_string(parts[1])
            }
        return {
            "artist": "Unknown Artist",
            "title": self._clean_string(filename)
        }

    def _clean_string(self, s: str) -> str:
        """Clean up a string by removing special characters and extra whitespace."""
        # Remove common quality indicators and metadata
        s = re.sub(r'\[(.*?)\]', '', s)  # Remove [...]
        s = re.sub(r'\((.*?)\)', '', s)  # Remove (...)
        s = re.sub(r'\d{2,4}kbps', '', s, flags=re.IGNORECASE)
        s = re.sub(r'(FLAC|MP3|WAV|M4A)', '', s, flags=re.IGNORECASE)
        s = re.sub(r'[_\.]', ' ', s)  # Replace _ and . with space
        s = re.sub(r'\s+', ' ', s)  # Normalize whitespace
        return s.strip()

    def fetch_metadata(
        self,
        artist: str,
        title: str,
        limit: int = 5
    ) -> Optional[Dict[str, Any]]:
        """
        Fetch metadata using iTunes Search API.
        It is free, requires no auth, and has excellent genre tagging.
        """
        try:
            # Clean up query
            query = f"{artist} {title}".strip()
            if not query:
                return None
                
            url = "https://itunes.apple.com/search"
            params = {
                "term": query,
                "entity": "song",
                "limit": 1
            }
            
            headers = {"User-Agent": "MusicGenreClassifier/1.0"}
            response = httpx.get(url, params=params, headers=headers, timeout=10.0)
            
            if response.status_code != 200:
                logger.warning("iTunes API returned %s", response.status_code)
                return None
                
            data = response.json()
            if not data.get("results"):
                return None
                
            track = data["results"][0]
            
            metadata = {
                "artist": track.get("artistName", artist),
                "title": track.get("trackName", title),
                "genre": track.get("primaryGenreName"),
                "album": track.get("collectionName"),
                "year": None
            }
            
            # Extract year from releaseDate
            if track.get("releaseDate"):
                try:
                    metadata["year"] = int(track["releaseDate"][:4])
                except (ValueError, IndexError):
                    pass

            return metadata

        except Exception as e:
            logger.error("iTunes API error: %s", str(e))
            return None

    def _map_musicbrainz_tags_to_genre(self, tags_str: str, allowed_genres: list[str]) -> Optional[str]:
        if not tags_str:
            return None
        tags = [t.strip().lower() for t in tags_str.split(',') if t.strip()]
        
        # Exact matches first
        for tag in tags:
            for g in allowed_genres:
                if tag == g.lower():
                    return g.lower()
                    
        # Substring match (tag contains the genre, e.g., 'pop rock' contains 'rock')
        for tag in tags:
            for g in allowed_genres:
                if g.lower() in tag:
                    return g.lower()
                    
        return None

    def fetch_genre_with_ai(
        self,
        artist: str,
        title: str,
        allowed_genres: Optional[list[str]] = None,
    ) -> Optional[str]:
        """
        Use Gemini to predict the music genre based on artist and title.

        When ``allowed_genres`` is provided, the prompt constrains Gemini to
        pick from that list and normalises the result against it, so the
        returned value is always one of the allowed items (or ``None``).

        Returns:
            A single genre string matching an allowed genre, or ``None``.
        """
        if allowed_genres is None:
            allowed_genres = GENRE_VOCABULARY

        genres_list = ", ".join(allowed_genres)

        try:
            prompt = f"""What is the most specific music genre of the song "{title}" by "{artist}"?
Choose only from this list: {genres_list}.
Return a single genre name from the list. If none of the genres fit, return the closest match.
No explanation, no extra text."""

            max_retries = 3
            retry_delay = 5.0
            
            for attempt in range(max_retries):
                try:
                    time.sleep(4.1)  # Gemini 1.5 Flash free tier is 15 RPM. Sleep ~4s to stay under limit.
                    response = self.gemini_client.models.generate_content(
                        model=self.gemini_model,
                        contents=prompt,
                        config=types.GenerateContentConfig(
                            response_mime_type="application/json",
                            response_schema={
                                "type": "object",
                                "properties": {
                                    "genre": {"type": "string"}
                                },
                                "required": ["genre"]
                            }
                        )
                    )
                    break
                except Exception as e:
                    err_str = str(e)
                    if "429" in err_str:
                        logger.warning(f"Gemini API rate limit hit in fetch_genre (Attempt {attempt+1}/{max_retries}).")
                        if attempt == max_retries - 1:
                            logger.warning(f"Gemini exhausted. Falling back to MusicBrainz for '{title}'.")
                            mb_meta = self.fetch_metadata(artist, title)
                            if mb_meta and mb_meta.get("genre"):
                                return self._map_musicbrainz_tags_to_genre(mb_meta["genre"], allowed_genres)
                            return None
                        
                        time.sleep(retry_delay)
                        retry_delay *= 2
                    else:
                        raise e
            result = json.loads(response.text)
            raw = result.get("genre", "").strip().lower()
            if not raw:
                return None

            # Try exact match first, then synonym normalisation.
            if raw in allowed_genres:
                return raw

            normalized = _normalize_genre(raw)
            if normalized in allowed_genres:
                return normalized

            # Fuzzy: find the closest match in the vocabulary.
            for g in allowed_genres:
                if raw in g or g in raw:
                    return g

            return None
        except Exception as e:
            logger.error("Gemini genre prediction error: %s", str(e))
            # Fallback on other errors too
            mb_meta = self.fetch_metadata(artist, title)
            if mb_meta and mb_meta.get("genre"):
                return self._map_musicbrainz_tags_to_genre(mb_meta["genre"], allowed_genres)
            return None

    def _respect_rate_limit(self):
        """Ensure we don't exceed MusicBrainz rate limit (1 req/sec)."""
        current_time = time.time()
        time_since_last_request = current_time - self.last_mb_request_time

        if time_since_last_request < self.mb_rate_limit:
            sleep_time = self.mb_rate_limit - time_since_last_request
            time.sleep(sleep_time)

        self.last_mb_request_time = time.time()

    def auto_tag(self, filename: str) -> Dict[str, Any]:
        """
        Complete auto-tagging workflow: parse filename + fetch metadata.

        Args:
            filename: Audio filename

        Returns:
            Dictionary with artist, title, genre, album, year
        """
        # Step 1: Parse filename
        parsed = self.parse_filename(filename)

        # Step 2: Fetch metadata from MusicBrainz
        metadata = self.fetch_metadata(
            artist=parsed["artist"],
            title=parsed["title"]
        )

        # Step 3: Merge results
        if metadata:
            # Step 4: If no genre from MusicBrainz, use Gemini as fallback
            if not metadata.get("genre"):
                ai_genre = self.fetch_genre_with_ai(
                    artist=metadata.get("artist", parsed["artist"]),
                    title=metadata.get("title", parsed["title"])
                )
                if ai_genre:
                    metadata["genre"] = ai_genre
            return metadata
        else:
            # MusicBrainz found nothing — use Gemini for genre at minimum
            ai_genre = self.fetch_genre_with_ai(
                artist=parsed["artist"],
                title=parsed["title"]
            )
            return {
                "artist": parsed["artist"],
                "title": parsed["title"],
                "genre": ai_genre,
                "album": None,
                "year": None
            }


# Singleton instance + the env key it was created with.  We rebind the
# instance only if the env var actually changes (e.g. tests / rotations),
# NOT on every request — the previous implementation called os.getenv on
# every get_ai_tagger() invocation, which was both wasteful and a TOCTOU
# footgun.
_tagger_instance: Optional[AITagger] = None
_tagger_env_key: Optional[str] = None


def get_ai_tagger() -> AITagger:
    """
    Return the process-wide AITagger instance, rebuilding it only when
    ``GEMINI_API_KEY`` actually changes since the last call.
    """
    global _tagger_instance, _tagger_env_key
    current_key = os.getenv("GEMINI_API_KEY")
    if _tagger_instance is None or _tagger_env_key != current_key:
        _tagger_instance = AITagger()
        _tagger_env_key = current_key
    return _tagger_instance
