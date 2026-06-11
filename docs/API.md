# API Documentation

## Overview

The Audio-Based Music Recommender API provides RESTful endpoints for user authentication, music upload and management, audio feature analysis, and music recommendations.

**Base URL**: `http://localhost:8000`

**API Documentation**: `http://localhost:8000/api/docs` (Swagger UI)

**Alternative Docs**: `http://localhost:8000/api/redoc` (ReDoc)

---

## Authentication

All endpoints except `/api/auth/register` and `/api/auth/login` require authentication via JWT Bearer token.

**Header Format**:
```
Authorization: Bearer <access_token>
```

---

## Endpoints

### Authentication Endpoints

#### POST /api/auth/register

Register a new user account.

**Request Body**:
```json
{
  "email": "user@example.com",
  "username": "username",
  "password": "password123"
}
```

**Validation**:
- Email must be valid format and unique
- Username must be unique
- Password minimum 8 characters

**Response** (201 Created):
```json
{
  "id": 1,
  "email": "user@example.com",
  "username": "username",
  "is_active": true,
  "created_at": "2026-06-11T16:45:00.000Z"
}
```

**Errors**:
- `400 Bad Request`: Email or username already exists
- `422 Unprocessable Entity`: Validation error

---

#### POST /api/auth/login

Login with username and password to obtain JWT token.

**Request Body** (form-data):
```
username: username
password: password123
```

**Response** (200 OK):
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer"
}
```

**Token Expiration**: 24 hours (1440 minutes) by default

**Errors**:
- `401 Unauthorized`: Incorrect username or password

---

#### GET /api/auth/me

Get current authenticated user information.

**Authentication**: Required

**Response** (200 OK):
```json
{
  "id": 1,
  "email": "user@example.com",
  "username": "username",
  "is_active": true,
  "created_at": "2026-06-11T16:45:00.000Z"
}
```

**Errors**:
- `401 Unauthorized`: Invalid or expired token

---

### Music Endpoints

#### POST /api/music/upload

Upload a new music file with metadata.

**Authentication**: Required

**Request** (multipart/form-data):
```
file: <audio_file>  (required)
title: "Track Title"  (required)
artist: "Artist Name"  (optional)
album: "Album Name"  (optional)
genre: "Genre"  (optional)
```

**Allowed File Types**: `.mp3`, `.wav`, `.flac`, `.ogg`

**Max File Size**: 50 MB (52,428,800 bytes)

**Response** (201 Created):
```json
{
  "id": 1,
  "title": "Track Title",
  "artist": "Artist Name",
  "album": "Album Name",
  "genre": "Rock",
  "duration": null,
  "file_path": "uploads/uuid.mp3",
  "file_size": 5242880,
  "user_id": 1,
  "created_at": "2026-06-11T16:50:00.000Z"
}
```

**Errors**:
- `400 Bad Request`: Invalid file type or file too large
- `401 Unauthorized`: Not authenticated
- `500 Internal Server Error`: Failed to save file

---

#### GET /api/music/{music_id}

Get music track by ID.

**Authentication**: Required

**Path Parameters**:
- `music_id` (integer): Music track ID

**Response** (200 OK):
```json
{
  "id": 1,
  "title": "Track Title",
  "artist": "Artist Name",
  "album": "Album Name",
  "genre": "Rock",
  "duration": 240.5,
  "file_path": "uploads/uuid.mp3",
  "file_size": 5242880,
  "user_id": 1,
  "created_at": "2026-06-11T16:50:00.000Z"
}
```

**Errors**:
- `401 Unauthorized`: Not authenticated
- `403 Forbidden`: Not authorized to access this music
- `404 Not Found`: Music not found

---

#### GET /api/music/user/{user_id}

Get all music tracks for a specific user.

**Authentication**: Required

**Path Parameters**:
- `user_id` (integer): User ID

**Query Parameters**:
- `skip` (integer, default: 0): Number of records to skip
- `limit` (integer, default: 100): Maximum records to return

**Response** (200 OK):
```json
[
  {
    "id": 1,
    "title": "Track Title",
    "artist": "Artist Name",
    "album": "Album Name",
    "genre": "Rock",
    "duration": 240.5,
    "file_path": "uploads/uuid.mp3",
    "file_size": 5242880,
    "user_id": 1,
    "created_at": "2026-06-11T16:50:00.000Z"
  }
]
```

**Authorization**: Users can only access their own music unless superuser.

**Errors**:
- `401 Unauthorized`: Not authenticated
- `403 Forbidden`: Not authorized to access this user's music

---

#### PUT /api/music/{music_id}

Update music track metadata.

**Authentication**: Required

**Path Parameters**:
- `music_id` (integer): Music track ID

**Request Body**:
```json
{
  "title": "Updated Title",
  "artist": "Updated Artist",
  "album": "Updated Album",
  "genre": "Updated Genre"
}
```

All fields are optional. Only provided fields will be updated.

**Response** (200 OK):
```json
{
  "id": 1,
  "title": "Updated Title",
  "artist": "Updated Artist",
  "album": "Updated Album",
  "genre": "Updated Genre",
  "duration": 240.5,
  "file_path": "uploads/uuid.mp3",
  "file_size": 5242880,
  "user_id": 1,
  "created_at": "2026-06-11T16:50:00.000Z"
}
```

**Errors**:
- `401 Unauthorized`: Not authenticated
- `403 Forbidden`: Not authorized to update this music
- `404 Not Found`: Music not found

---

#### DELETE /api/music/{music_id}

Delete a music track and its audio file.

**Authentication**: Required

**Path Parameters**:
- `music_id` (integer): Music track ID

**Response** (204 No Content): Empty response

**Side Effects**:
- Deletes music record from database
- Deletes audio file from disk
- Cascades to delete associated audio_features and recommendations

**Errors**:
- `401 Unauthorized`: Not authenticated
- `403 Forbidden`: Not authorized to delete this music
- `404 Not Found`: Music not found

---

### Analysis Endpoints

#### POST /api/analyze/{music_id}

Analyze a music track and extract audio features.

**Authentication**: Required

**Path Parameters**:
- `music_id` (integer): Music track ID

**Response** (200 OK):
```json
{
  "id": 1,
  "music_id": 1,
  "tempo": 120.5,
  "duration": 240.5,
  "key": 7,
  "mode": 1,
  "loudness": -8.5,
  "energy": 0.75,
  "valence": 0.62,
  "spectral_centroid_mean": 2500.3,
  "spectral_centroid_std": 450.2,
  "spectral_bandwidth_mean": 1800.5,
  "spectral_bandwidth_std": 320.1,
  "spectral_rolloff_mean": 4200.8,
  "spectral_rolloff_std": 680.4,
  "mfcc_mean": [12.3, -5.6, 8.9, ...],
  "mfcc_std": [2.1, 1.8, 2.3, ...],
  "zero_crossing_rate_mean": 0.045,
  "zero_crossing_rate_std": 0.012,
  "chroma_stft_mean": [0.8, 0.3, 0.5, ...],
  "chroma_stft_std": [0.1, 0.05, 0.08, ...],
  "cluster_id": null
}
```

**Note**: Full audio analysis implementation will be added in STEP 4. Currently returns placeholder values.

**Errors**:
- `400 Bad Request`: Music already analyzed
- `401 Unauthorized`: Not authenticated
- `403 Forbidden`: Not authorized to analyze this music
- `404 Not Found`: Music not found

---

#### GET /api/analyze/features/{music_id}

Get audio features for a music track.

**Authentication**: Required

**Path Parameters**:
- `music_id` (integer): Music track ID

**Response** (200 OK):
```json
{
  "id": 1,
  "music_id": 1,
  "tempo": 120.5,
  "duration": 240.5,
  "key": 7,
  "mode": 1,
  "loudness": -8.5,
  "energy": 0.75,
  "valence": 0.62,
  "spectral_centroid_mean": 2500.3,
  "spectral_centroid_std": 450.2,
  "spectral_bandwidth_mean": 1800.5,
  "spectral_bandwidth_std": 320.1,
  "spectral_rolloff_mean": 4200.8,
  "spectral_rolloff_std": 680.4,
  "mfcc_mean": [12.3, -5.6, 8.9, ...],
  "mfcc_std": [2.1, 1.8, 2.3, ...],
  "zero_crossing_rate_mean": 0.045,
  "zero_crossing_rate_std": 0.012,
  "chroma_stft_mean": [0.8, 0.3, 0.5, ...],
  "chroma_stft_std": [0.1, 0.05, 0.08, ...],
  "cluster_id": 2
}
```

**Errors**:
- `401 Unauthorized`: Not authenticated
- `403 Forbidden`: Not authorized to access this music's features
- `404 Not Found`: Music not found or not analyzed yet

---

### Recommendation Endpoints

#### GET /api/recommend/{music_id}

Get music recommendations based on a source track.

**Authentication**: Required

**Path Parameters**:
- `music_id` (integer): Source music track ID

**Query Parameters**:
- `limit` (integer, default: 10, range: 1-50): Maximum recommendations

**Response** (200 OK):
```json
[
  {
    "id": 1,
    "user_id": 1,
    "source_music_id": 1,
    "recommended_music_id": 5,
    "similarity_score": 0.95,
    "algorithm": 1,
    "created_at": "2026-06-11T17:00:00.000Z",
    "recommended_music": {
      "id": 5,
      "title": "Similar Track",
      "artist": "Another Artist",
      "album": "Another Album",
      "genre": "Rock",
      "duration": 235.8,
      "file_path": "uploads/uuid2.mp3",
      "file_size": 4987654,
      "user_id": 2,
      "created_at": "2026-06-10T12:30:00.000Z"
    }
  }
]
```

**Algorithm Types**:
- `1`: Cosine similarity
- `2`: Euclidean distance
- `3`: K-means clustering

**Note**: ML recommendation implementation will be added in STEP 5. Currently returns existing recommendations from database.

**Errors**:
- `400 Bad Request`: Source music not analyzed
- `401 Unauthorized`: Not authenticated
- `404 Not Found`: Source music not found

---

#### GET /api/recommend/user/{user_id}

Get all recommendations for a specific user.

**Authentication**: Required

**Path Parameters**:
- `user_id` (integer): User ID

**Query Parameters**:
- `skip` (integer, default: 0): Number of records to skip
- `limit` (integer, default: 100): Maximum records to return

**Response** (200 OK):
```json
[
  {
    "id": 1,
    "user_id": 1,
    "source_music_id": 1,
    "recommended_music_id": 5,
    "similarity_score": 0.95,
    "algorithm": 1,
    "created_at": "2026-06-11T17:00:00.000Z"
  }
]
```

**Authorization**: Users can only access their own recommendations unless superuser.

**Errors**:
- `401 Unauthorized`: Not authenticated
- `403 Forbidden`: Not authorized to access this user's recommendations

---

## Response Codes

| Code | Meaning |
|------|---------|
| 200 | OK - Request successful |
| 201 | Created - Resource created successfully |
| 204 | No Content - Request successful, no response body |
| 400 | Bad Request - Invalid input or business logic error |
| 401 | Unauthorized - Missing or invalid authentication |
| 403 | Forbidden - Authenticated but not authorized |
| 404 | Not Found - Resource doesn't exist |
| 422 | Unprocessable Entity - Validation error |
| 500 | Internal Server Error - Server error |

---

## Error Response Format

All error responses follow this format:

```json
{
  "detail": "Error message describing what went wrong"
}
```

For validation errors (422):

```json
{
  "detail": [
    {
      "loc": ["body", "email"],
      "msg": "value is not a valid email address",
      "type": "value_error.email"
    }
  ]
}
```

---

## Usage Examples

### Complete Workflow

1. **Register a user**:
```bash
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","username":"user","password":"password123"}'
```

2. **Login to get token**:
```bash
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=user&password=password123"
```

3. **Upload music**:
```bash
curl -X POST http://localhost:8000/api/music/upload \
  -H "Authorization: Bearer <token>" \
  -F "file=@song.mp3" \
  -F "title=My Song" \
  -F "artist=Artist Name" \
  -F "genre=Rock"
```

4. **Analyze music**:
```bash
curl -X POST http://localhost:8000/api/analyze/1 \
  -H "Authorization: Bearer <token>"
```

5. **Get recommendations**:
```bash
curl -X GET http://localhost:8000/api/recommend/1?limit=10 \
  -H "Authorization: Bearer <token>"
```

---

## Rate Limiting

Currently no rate limiting is implemented. This should be added in production.

---

## CORS

The API allows requests from:
- `http://localhost:3000` (React dev)
- `http://localhost:5173` (Vite dev)
- `http://127.0.0.1:3000`
- `http://127.0.0.1:5173`

For production, configure allowed origins in `app/main.py`.

---

## Development

### Running the Server

```bash
cd backend
python -m venv venv
venv\Scripts\activate  # Windows
pip install -r requirements.txt

# Create .env file
cp .env.example .env
# Edit .env with your database credentials

# Run migrations
alembic upgrade head

# Start server
uvicorn app.main:app --reload
```

Server runs on `http://localhost:8000`

API docs: `http://localhost:8000/api/docs`

---

## Next Steps

Refer to `STATE.md` for current implementation status.

Next module: **STEP 4 - AUDIO ANALYSIS** (librosa integration for feature extraction)
