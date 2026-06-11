# Database Schema Documentation

## Overview

The Audio-Based Music Recommender uses PostgreSQL as its primary database with SQLAlchemy 2.0 as the ORM. The database consists of 4 main tables that handle user management, music metadata, audio feature analysis, and recommendation tracking.

## Entity-Relationship Diagram

```
┌─────────────────┐
│     users       │
│─────────────────│
│ id (PK)         │
│ email           │◄──────┐
│ username        │       │
│ hashed_password │       │
│ is_active       │       │
│ is_superuser    │       │
│ created_at      │       │
│ updated_at      │       │
└─────────────────┘       │
         │                │
         │ 1:N            │
         │                │
         ▼                │
┌─────────────────────────┴───┐          ┌────────────────────────┐
│        music                │          │   recommendations      │
│─────────────────────────────│          │────────────────────────│
│ id (PK)                     │          │ id (PK)                │
│ title                       │◄─────────│ user_id (FK)           │
│ artist                      │          │ source_music_id (FK)   │
│ album                       │◄─────────│ recommended_music_id   │
│ genre                       │          │   (FK)                 │
│ duration                    │          │ similarity_score       │
│ file_path                   │          │ algorithm              │
│ file_size                   │          │ created_at             │
│ user_id (FK)                │          └────────────────────────┘
│ created_at                  │
│ updated_at                  │
└─────────────────────────────┘
         │
         │ 1:1
         │
         ▼
┌────────────────────────────────┐
│      audio_features            │
│────────────────────────────────│
│ id (PK)                        │
│ music_id (FK, UNIQUE)          │
│ tempo                          │
│ duration                       │
│ key                            │
│ mode                           │
│ loudness                       │
│ energy                         │
│ valence                        │
│ spectral_centroid_mean/std     │
│ spectral_bandwidth_mean/std    │
│ spectral_rolloff_mean/std      │
│ mfcc_mean (JSON)               │
│ mfcc_std (JSON)                │
│ zero_crossing_rate_mean/std    │
│ chroma_stft_mean/std (JSON)    │
│ cluster_id                     │
└────────────────────────────────┘
```

## Table Schemas

### 1. users

Stores user account information and authentication data.

| Column          | Type                | Constraints           | Description                      |
|-----------------|---------------------|-----------------------|----------------------------------|
| id              | Integer             | PRIMARY KEY           | Unique user identifier           |
| email           | String              | UNIQUE, NOT NULL      | User email address               |
| username        | String              | UNIQUE, NOT NULL      | User display name                |
| hashed_password | String              | NOT NULL              | Bcrypt hashed password           |
| is_active       | Boolean             | DEFAULT TRUE          | Account activation status        |
| is_superuser    | Boolean             | DEFAULT FALSE         | Admin privileges flag            |
| created_at      | DateTime(tz)        | DEFAULT now()         | Account creation timestamp       |
| updated_at      | DateTime(tz)        | ON UPDATE             | Last modification timestamp      |

**Indexes:**
- `ix_users_id` on `id`
- `ix_users_email` on `email` (unique)
- `ix_users_username` on `username` (unique)

**Relationships:**
- One-to-many with `music` (user can upload multiple tracks)
- One-to-many with `recommendations` (user can have multiple recommendation sessions)

---

### 2. music

Stores music track metadata and file information.

| Column      | Type          | Constraints           | Description                        |
|-------------|---------------|-----------------------|------------------------------------|
| id          | Integer       | PRIMARY KEY           | Unique music track identifier      |
| title       | String        | NOT NULL              | Track title                        |
| artist      | String        | NULL                  | Artist name                        |
| album       | String        | NULL                  | Album name                         |
| genre       | String        | NULL                  | Genre classification               |
| duration    | Float         | NULL                  | Track duration in seconds          |
| file_path   | String        | NOT NULL              | Path to audio file on disk         |
| file_size   | Integer       | NULL                  | File size in bytes                 |
| user_id     | Integer       | FOREIGN KEY, NOT NULL | Owner user reference               |
| created_at  | DateTime(tz)  | DEFAULT now()         | Upload timestamp                   |
| updated_at  | DateTime(tz)  | ON UPDATE             | Last modification timestamp        |

**Indexes:**
- `ix_music_id` on `id`
- `ix_music_title` on `title`
- `ix_music_genre` on `genre`

**Relationships:**
- Many-to-one with `users` (belongs to one user)
- One-to-one with `audio_features` (has one feature set)
- One-to-many with `recommendations` as source (track used for recommendations)
- Many-to-many with `recommendations` as target (track recommended to others)

---

### 3. audio_features

Stores extracted audio analysis features for each music track.

| Column                      | Type     | Constraints           | Description                                    |
|-----------------------------|----------|-----------------------|------------------------------------------------|
| id                          | Integer  | PRIMARY KEY           | Unique feature set identifier                  |
| music_id                    | Integer  | FK, UNIQUE, NOT NULL  | Reference to music track                       |
| **Temporal Features**       |          |                       |                                                |
| tempo                       | Float    | NULL                  | Beats per minute (BPM)                         |
| duration                    | Float    | NULL                  | Track duration in seconds                      |
| **Tonal Features**          |          |                       |                                                |
| key                         | Integer  | NULL                  | Musical key (0-11: C, C#, ..., B)              |
| mode                        | Integer  | NULL                  | Mode (0=minor, 1=major)                        |
| **Energy & Dynamics**       |          |                       |                                                |
| loudness                    | Float    | NULL                  | Average loudness in dB                         |
| energy                      | Float    | NULL                  | Energy measure (0.0-1.0)                       |
| **Mood/Emotion**            |          |                       |                                                |
| valence                     | Float    | NULL                  | Musical positivity (0.0-1.0)                   |
| **Spectral Features**       |          |                       |                                                |
| spectral_centroid_mean      | Float    | NULL                  | Mean spectral centroid                         |
| spectral_centroid_std       | Float    | NULL                  | Std dev of spectral centroid                   |
| spectral_bandwidth_mean     | Float    | NULL                  | Mean spectral bandwidth                        |
| spectral_bandwidth_std      | Float    | NULL                  | Std dev of spectral bandwidth                  |
| spectral_rolloff_mean       | Float    | NULL                  | Mean spectral rolloff point                    |
| spectral_rolloff_std        | Float    | NULL                  | Std dev of spectral rolloff                    |
| **Timbre (MFCCs)**          |          |                       |                                                |
| mfcc_mean                   | JSON     | NULL                  | Array of 20 MFCC means                         |
| mfcc_std                    | JSON     | NULL                  | Array of 20 MFCC std deviations                |
| **Rhythm**                  |          |                       |                                                |
| zero_crossing_rate_mean     | Float    | NULL                  | Mean zero-crossing rate                        |
| zero_crossing_rate_std      | Float    | NULL                  | Std dev of zero-crossing rate                  |
| **Harmony**                 |          |                       |                                                |
| chroma_stft_mean            | JSON     | NULL                  | Array of 12 chroma feature means               |
| chroma_stft_std             | JSON     | NULL                  | Array of 12 chroma feature std devs            |
| **ML Clustering**           |          |                       |                                                |
| cluster_id                  | Integer  | NULL                  | K-means cluster assignment                     |

**Indexes:**
- `ix_audio_features_id` on `id`
- `ix_audio_features_cluster_id` on `cluster_id`

**Relationships:**
- One-to-one with `music` (belongs to one track)

**JSON Field Formats:**
- `mfcc_mean`, `mfcc_std`: `[float, float, ..., float]` (20 values)
- `chroma_stft_mean`, `chroma_stft_std`: `[float, float, ..., float]` (12 values)

---

### 4. recommendations

Tracks recommendation history and similarity scores between tracks.

| Column                | Type          | Constraints           | Description                              |
|-----------------------|---------------|-----------------------|------------------------------------------|
| id                    | Integer       | PRIMARY KEY           | Unique recommendation identifier         |
| user_id               | Integer       | FOREIGN KEY, NOT NULL | User who requested recommendation        |
| source_music_id       | Integer       | FOREIGN KEY, NOT NULL | Track used as recommendation seed        |
| recommended_music_id  | Integer       | FOREIGN KEY, NOT NULL | Track being recommended                  |
| similarity_score      | Float         | NOT NULL              | Similarity score (0.0-1.0)               |
| algorithm             | Integer       | DEFAULT 1             | Algorithm used (1=cosine, 2=euclidean, 3=kmeans) |
| created_at            | DateTime(tz)  | DEFAULT now()         | Recommendation generation timestamp      |

**Indexes:**
- `ix_recommendations_id` on `id`

**Relationships:**
- Many-to-one with `users` (belongs to one user)
- Many-to-one with `music` as source (references source track)
- Many-to-one with `music` as target (references recommended track)

---

## Relationships Summary

```
User (1) ──< (N) Music (1) ── (1) AudioFeatures
User (1) ──< (N) Recommendations >── (N) Music
```

1. **User → Music**: One user can upload many tracks (1:N)
2. **Music → AudioFeatures**: Each track has exactly one feature set (1:1)
3. **User → Recommendations**: One user can request many recommendations (1:N)
4. **Music → Recommendations**: One track can be both source and target of multiple recommendations (N:N via junction table)

---

## Database Configuration

### Connection String Format

```
postgresql://<username>:<password>@<host>:<port>/<database_name>
```

**Example (.env file)**:
```bash
DATABASE_URL=postgresql://postgres:password@localhost:5432/music_recommender_db
```

### SQLAlchemy Settings

- **Pool Size**: 10 connections
- **Max Overflow**: 20 connections
- **Pool Pre-Ping**: Enabled (checks connection health)
- **Echo**: Enabled in debug mode (logs SQL queries)

---

## Migrations with Alembic

### Initialize Database

```bash
cd backend

# Apply all migrations
alembic upgrade head
```

### Create New Migration

```bash
# Auto-generate migration from model changes
alembic revision --autogenerate -m "description"

# Create empty migration
alembic revision -m "description"
```

### Migration Commands

```bash
# Upgrade to latest
alembic upgrade head

# Upgrade one version
alembic upgrade +1

# Downgrade one version
alembic downgrade -1

# Show current version
alembic current

# Show migration history
alembic history
```

---

## Setup Instructions

### 1. Install PostgreSQL

**Windows**:
- Download from [postgresql.org](https://www.postgresql.org/download/windows/)
- Install with default settings
- Remember the postgres user password

**Linux**:
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
```

**macOS**:
```bash
brew install postgresql
brew services start postgresql
```

### 2. Create Database

```bash
# Connect to PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE music_recommender_db;

# Create user (optional)
CREATE USER music_user WITH PASSWORD 'secure_password';
GRANT ALL PRIVILEGES ON DATABASE music_recommender_db TO music_user;

# Exit
\q
```

### 3. Configure Backend

Create `backend/.env`:
```bash
DATABASE_URL=postgresql://postgres:your_password@localhost:5432/music_recommender_db
SECRET_KEY=generate-a-random-secret-key-here
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440
DEBUG=True
UPLOAD_DIR=uploads
MAX_UPLOAD_SIZE=52428800
```

### 4. Run Migrations

```bash
cd backend
python -m venv venv
venv\Scripts\activate  # Windows
source venv/bin/activate  # Linux/Mac

pip install -r requirements.txt
alembic upgrade head
```

---

## Common Queries

### Get all music for a user with features

```python
from sqlalchemy.orm import joinedload

music_list = db.query(Music)\
    .filter(Music.user_id == user_id)\
    .options(joinedload(Music.audio_features))\
    .all()
```

### Get recommendations for a track

```python
recommendations = db.query(Recommendation)\
    .filter(Recommendation.source_music_id == music_id)\
    .order_by(Recommendation.similarity_score.desc())\
    .limit(10)\
    .all()
```

### Find tracks in the same cluster

```python
from sqlalchemy import and_

cluster_tracks = db.query(Music)\
    .join(AudioFeatures)\
    .filter(and_(
        AudioFeatures.cluster_id == target_cluster_id,
        Music.id != excluded_music_id
    ))\
    .all()
```

---

## Data Validation

### Constraints
- User email must be unique and valid format (handled by Pydantic)
- Audio features must reference an existing music track
- Recommendations cannot have same source and target
- Similarity scores must be between 0.0 and 1.0

### Cascading Deletes
- Deleting a user deletes all their music and recommendations
- Deleting music deletes associated audio_features and recommendations

---

## Performance Considerations

### Indexes
All foreign keys and frequently queried columns are indexed:
- User lookups by email/username (auth)
- Music lookups by title/genre (search)
- Audio features by cluster_id (recommendations)

### Query Optimization
- Use `joinedload()` for eager loading relationships
- Limit recommendation queries to top N results
- Consider caching popular recommendations in Redis (future)

### Storage
- Audio files stored on disk (not in database)
- JSON fields for variable-length arrays (MFCCs, chroma)
- Consider moving to S3 for production (future)

---

## Backup Strategy

```bash
# Backup database
pg_dump -U postgres music_recommender_db > backup.sql

# Restore database
psql -U postgres music_recommender_db < backup.sql
```

---

## Next Steps

Refer to `STATE.md` for current implementation status.

Next module: **STEP 3 - BACKEND API** (FastAPI routes and services)
