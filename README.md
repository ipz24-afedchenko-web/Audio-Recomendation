# Audio-Based Music Recommender

A web application that analyzes audio parameters and recommends similar music using machine learning.

## Features

- Audio analysis using sound parameters (loudness, tempo, key, timbre, energy, valence)
- K-means clustering for music grouping
- Machine learning-based recommendations with genre classification
- AI-powered metadata extraction (Gemini + MusicBrainz)
- User authentication with JWT
- Modern React frontend with Plotly visualizations
- FastAPI backend with PostgreSQL database
- Docker deployment ready

## Project Structure

```
Music_genre_classifier/
├── backend/           # FastAPI backend
│   ├── app/
│   │   ├── models/    # SQLAlchemy models
│   │   ├── routes/    # API endpoints
│   │   ├── services/  # Business logic
│   │   └── utils/     # Helper functions
│   └── tests/         # Backend tests
├── frontend/          # React frontend
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── services/
│   │   └── utils/
│   └── public/
└── docs/              # Documentation

```

## Quick Start

### With Docker (Recommended)

```bash
docker-compose up -d
```

Frontend: http://localhost  
Backend API: http://localhost:8000  
API Docs: http://localhost:8000/api/docs

See `docs/DEPLOY.md` for detailed deployment instructions.

## Documentation

- [ARCHITECTURE.md](docs/ARCHITECTURE.md) - System architecture
- [DATABASE.md](docs/DATABASE.md) - Database schema
- [API.md](docs/API.md) - API endpoints
- [AUDIO_ANALYSIS.md](docs/AUDIO_ANALYSIS.md) - Audio analysis parameters
- [ML_RECOMMENDER.md](docs/ML_RECOMMENDER.md) - Recommendation logic
- [FRONTEND.md](docs/FRONTEND.md) - Frontend components
- [DEPLOY.md](docs/DEPLOY.md) - Deployment guide
- [AI_INTEGRATION.md](docs/AI_INTEGRATION.md) - AI metadata extraction
- [STATE.md](STATE.md) - Current project status

## Technology Stack

### Backend
- FastAPI
- PostgreSQL
- SQLAlchemy
- librosa (audio analysis)
- scikit-learn (ML)

### Frontend
- React
- react-plotly.js (visualizations)
- Axios

### Deployment
- Docker
- Docker Compose
- AWS/Heroku/Render ready

## Development Setup

### Prerequisites
- Python 3.10+
- Node.js 18+
- PostgreSQL 15+

### Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv
venv\Scripts\activate  # Windows
source venv/bin/activate  # Linux/Mac

# Install dependencies
pip install -r requirements.txt

# Create .env file
cp .env.example .env
# Edit .env with your database credentials

# Run migrations
alembic upgrade head

# Start server
uvicorn app.main:app --reload
```

Backend API: http://localhost:8000  
API Docs: http://localhost:8000/api/docs

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start dev server
npm run dev
```

Frontend: http://localhost:5173

## Current Status

**Progress**: 100% (8 of 8 steps complete) ✅

- ✅ Step 1: Project setup
- ✅ Step 2: Database models
- ✅ Step 3: Backend API
- ✅ Step 4: Audio analysis
- ✅ Step 5: ML recommender
- ✅ Step 6: Frontend
- ✅ Step 7: Deployment
- ✅ Step 8: AI metadata extraction

See [STATE.md](STATE.md) for detailed status.

## License

MIT
