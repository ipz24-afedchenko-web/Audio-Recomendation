"""
AI-powered metadata extraction service.

Uses Google Gemini API to parse filenames and MusicBrainz API to fetch metadata.
"""

import os
import re
import time
import json
from typing import Optional, Dict, Any
from pathlib import Path

import musicbrainzngs
from google import genai
from google.genai import types


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
        self.gemini_model = "gemini-2.5-flash"  # Confirmed available model

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

            response = self.gemini_client.models.generate_content(
                model=self.gemini_model,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema={
                        "type": "object",
                        "properties": {
                            "artist": {"type": "string"},
                            "title": {"type": "string"}
                        },
                        "required": ["artist", "title"]
                    }
                )
            )

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
        Fetch metadata from MusicBrainz API.

        Args:
            artist: Artist name
            title: Track title
            limit: Maximum number of results to fetch

        Returns:
            Dictionary with metadata (genre, album, year) or None if not found
        """
        # Rate limiting
        self._respect_rate_limit()

        try:
            result = musicbrainzngs.search_recordings(
                artist=artist,
                recording=title,
                limit=limit,
            )

            if not result.get('recording-list'):
                return None

            # Get the best match (first result)
            best_match = result['recording-list'][0]

            metadata = {
                "artist": best_match.get('artist-credit-phrase', artist),
                "title": best_match.get('title', title),
                "genre": None,
                "album": None,
                "year": None
            }

            # Extract genres from tags — sort by vote count (count attr), take top 3
            if 'tag-list' in best_match:
                tags = best_match['tag-list']
                # Sort by vote count descending (MusicBrainz returns count as string)
                tags_sorted = sorted(
                    tags,
                    key=lambda t: int(t.get('count', 0)),
                    reverse=True
                )
                tag_names = [t['name'] for t in tags_sorted if t.get('name')]
                if tag_names:
                    metadata["genre"] = ", ".join(tag_names[:3])

            # Also check releases for genre tags if recording has none
            if not metadata["genre"] and 'release-list' in best_match:
                for release in best_match['release-list'][:3]:
                    if 'tag-list' in release:
                        tags = release['tag-list']
                        tags_sorted = sorted(
                            tags,
                            key=lambda t: int(t.get('count', 0)),
                            reverse=True
                        )
                        tag_names = [t['name'] for t in tags_sorted if t.get('name')]
                        if tag_names:
                            metadata["genre"] = ", ".join(tag_names[:3])
                            break

            # Extract album and year
            if 'release-list' in best_match and best_match['release-list']:
                release = best_match['release-list'][0]
                metadata["album"] = release.get('title')
                if 'date' in release:
                    # Extract year from date (YYYY-MM-DD format)
                    try:
                        metadata["year"] = int(release['date'][:4])
                    except (ValueError, IndexError):
                        pass

            return metadata

        except Exception as e:
            # Log error but don't crash
            print(f"MusicBrainz API error: {e}")
            return None

    def fetch_genre_with_ai(self, artist: str, title: str) -> Optional[str]:
        """
        Use Gemini to predict the music genre based on artist and title.
        Called as a fallback when MusicBrainz has no tags.

        Returns:
            Genre string (e.g. "rock, alternative") or None
        """
        try:
            prompt = f"""What is the music genre of the song "{title}" by "{artist}"?
Return only the genre name(s), comma-separated (e.g. "rock, alternative rock").
Use standard genre names. Return at most 3 genres. No explanation."""

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
            result = json.loads(response.text)
            genre = result.get("genre", "").strip()
            return genre if genre else None
        except Exception as e:
            print(f"Gemini genre prediction error: {e}")
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


# Singleton instance
_tagger_instance: Optional[AITagger] = None


def get_ai_tagger() -> AITagger:
    """Get or create the AI tagger singleton instance."""
    global _tagger_instance
    if _tagger_instance is None or not os.getenv("GEMINI_API_KEY"):
        _tagger_instance = AITagger()
    return _tagger_instance
