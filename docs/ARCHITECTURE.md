# System Architecture

## Overview

Audio-Based Music Recommender is a full-stack web application that analyzes audio files and provides music recommendations based on acoustic similarity. The system uses machine learning (K-means clustering and cosine similarity) to group and recommend music.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                          │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │           React Frontend (Port 3000)                  │   │
│  │  - Login/Register pages                               │   │
│  │  - Dashboard with visualizations                      │   │
│  │  - Upload & Analyze interface                         │   │
│  │  - Recommendations display                            │   │
│  │  - react-plotly.js for charts                         │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP/REST API
                              │ (axios)
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                       API LAYER                              │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │         FastAPI Backend (Port 8000)                   │   │
│  │                                                        │   │
│  │  Routes:                                              │   │
│  │  - /api/auth      → Authentication (JWT)             │   │
│  │  - /api/music     → Music CRUD operations            │   │
│  │  - /api/analyze   → Audio analysis                   │   │
│  │  - /api/recommend → Get recommendations              │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │                   │
                    ▼                   ▼
┌──────────────────────────┐  ┌────────────────────────────┐
│    SERVICE LAYER         │  │   ML/ANALYSIS LAYER        │
│                          │  │                            │
│  - UserService           │  │  - AudioAnalyzer           │
│  - MusicService          │  │    (librosa)               │
│  - RecommendationService │  │  - MLRecommender           │
│  - AuthService (JWT)     │  │    (K-means, cosine sim)   │
└──────────────────────────┘  │  - GenreClassifier         │
                              └────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│                    DATA LAYER                                │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │         PostgreSQL Database                           │   │
│  │                                                        │   │
│  │  Tables:                                              │   │
│  │  - users           → User accounts                   │   │
│  │  - music           → Music metadata                  │   │
│  │  - audio_features  → Extracted audio parameters      │   │
│  │  - recommendations → User recommendations history    │   │
│  │                                                        │   │
│  │  ORM: SQLAlchemy                                      │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Technology Stack

### Frontend
- **Framework**: React 18
- **Build Tool**: Vite
- **Routing**: react-router-dom v6
- **HTTP Client**: axios
- **Visualization**: react-plotly.js + plotly.js
- **Styling**: CSS3 (to be implemented)

### Backend
- **Framework**: FastAPI
- **Server**: Uvicorn (ASGI)
- **ORM**: SQLAlchemy 2.0
- **Database**: PostgreSQL 15+
- **Migrations**: Alembic
- **Authentication**: JWT (python-jose)
- **Password Hashing**: passlib with bcrypt

### ML & Audio Processing
- **Audio Analysis**: librosa
- **ML Framework**: scikit-learn
- **Algorithms**:
  - K-means clustering for music grouping
  - Cosine similarity for recommendations
  - Genre classification (supervised learning)
- **Data Processing**: numpy, pandas, scipy

### Deployment
- **Containerization**: Docker + Docker Compose
- **Deployment Targets**: AWS (ECS/EC2), Heroku, or Render
- **Database Hosting**: AWS RDS, Heroku Postgres, or Render PostgreSQL

## Data Flow

### 1. User Registration/Login
```
User → Frontend → POST /api/auth/register or /login
                → Backend validates & creates JWT
                → Returns token
                → Frontend stores token (localStorage)
```

### 2. Music Upload & Analysis
```
User uploads audio file
    ↓
Frontend → POST /api/music/upload (multipart/form-data)
    ↓
Backend saves file & metadata → music table
    ↓
AudioAnalyzer extracts features:
    - Tempo (BPM)
    - Key & Mode
    - Loudness (dB)
    - Spectral features (MFCCs)
    - Energy, Valence
    - Timbre characteristics
    ↓
Features saved → audio_features table
    ↓
Response with music_id & initial features
```

### 3. Get Recommendations
```
User requests recommendations
    ↓
Frontend → GET /api/recommend/{music_id}
    ↓
Backend:
    1. Fetch audio_features for music_id
    2. MLRecommender finds similar tracks:
       - K-means cluster assignment
       - Cosine similarity within cluster
    3. Rank top N similar tracks
    4. Save to recommendations table
    ↓
Return list of recommended music with similarity scores
```

### 4. Dashboard Visualization
```
Frontend → GET /api/music/user/{user_id}
        → GET /api/analyze/features/{music_id}
    ↓
Backend returns music list & feature data
    ↓
Frontend renders:
    - Audio feature radar charts
    - Cluster visualizations
    - Genre distribution
    - Recommendation network
```

## Security

### Authentication
- JWT tokens with expiration (24h default)
- Password hashing with bcrypt (12 rounds)
- Token stored in localStorage (frontend)
- Protected routes with dependency injection

### API Security
- CORS configuration for frontend origin
- Request validation with Pydantic models
- SQL injection prevention via SQLAlchemy ORM
- File upload validation (size, type)

### Database
- Connection pooling via SQLAlchemy
- Prepared statements (ORM)
- Environment-based credentials (.env)

## Scalability Considerations

### Current Design (MVP)
- Single server deployment
- Synchronous audio processing
- In-cluster recommendations only

### Future Enhancements
- **Async Processing**: Celery + Redis for background audio analysis
- **Caching**: Redis for feature vectors and recommendations
- **CDN**: S3 + CloudFront for audio file storage
- **Microservices**: Separate audio analysis service
- **Load Balancing**: Nginx reverse proxy, multiple backend instances
- **Database**: Read replicas, connection pooling

## Module Dependencies

```
frontend/
├── pages/          → Uses components/, services/
├── components/     → Reusable UI (independent)
├── services/       → API calls via axios
└── utils/          → Helpers (independent)

backend/
├── routes/         → Uses services/, models/
├── services/       → Business logic, uses models/, utils/
├── models/         → SQLAlchemy ORM (database schema)
└── utils/          → Audio analysis, ML recommender
```

## API Communication

- **Base URL**: `http://localhost:8000/api`
- **Auth Header**: `Authorization: Bearer <JWT_TOKEN>`
- **Content Types**: 
  - `application/json` (metadata)
  - `multipart/form-data` (file uploads)

## Error Handling

### Backend
- HTTP status codes (400, 401, 404, 500)
- Structured error responses: `{"detail": "error message"}`
- Logging via Python logging module

### Frontend
- Axios interceptors for global error handling
- User-friendly error messages
- Redirect to login on 401 Unauthorized

## Development Workflow

1. **Local Development**:
   - Backend: `uvicorn app.main:app --reload` (port 8000)
   - Frontend: `npm run dev` (port 3000)
   - Database: PostgreSQL on localhost:5432

2. **Testing**:
   - Backend: pytest with test database
   - Frontend: Manual testing (unit tests TBD)

3. **Deployment**:
   - Build Docker images
   - Push to registry
   - Deploy with docker-compose or cloud platform

## Configuration

### Environment Variables

**Backend (.env)**:
```
DATABASE_URL=postgresql://user:pass@localhost:5432/music_db
SECRET_KEY=<random-secret-key>
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440
```

**Frontend (.env)**:
```
VITE_API_BASE_URL=http://localhost:8000/api
```

## Next Steps

Refer to `STATE.md` for current implementation status and next tasks.
