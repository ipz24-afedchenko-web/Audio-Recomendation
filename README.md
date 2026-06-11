<<<<<<< HEAD
# Audio-Based Music Recommender

A web application that analyzes audio parameters and recommends similar music using machine learning.

## Features

- Audio analysis using sound parameters (loudness, tempo, key, timbre, energy, valence)
- K-means clustering for music grouping
- Machine learning-based recommendations
- User authentication with JWT
- Modern React frontend with visualizations
- FastAPI backend with PostgreSQL database

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

See `docs/DEPLOY.md` for deployment instructions.

## Documentation

- [ARCHITECTURE.md](docs/ARCHITECTURE.md) - System architecture
- [DATABASE.md](docs/DATABASE.md) - Database schema
- [API.md](docs/API.md) - API endpoints
- [AUDIO_ANALYSIS.md](docs/AUDIO_ANALYSIS.md) - Audio analysis parameters
- [ML_RECOMMENDER.md](docs/ML_RECOMMENDER.md) - Recommendation logic
- [FRONTEND.md](docs/FRONTEND.md) - Frontend components
- [DEPLOY.md](docs/DEPLOY.md) - Deployment guide
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

## License

MIT
=======
# Music_genre_classifier
>>>>>>> 7673073eadb93535840612205ed45948b6a53165
