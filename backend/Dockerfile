# Backend Dockerfile for FastAPI application
FROM python:3.10-slim

# Set working directory
WORKDIR /app

# Install system dependencies for audio processing
RUN apt-get update && apt-get install -y \
    libsndfile1 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Run lint check (non-blocking — reports issues without failing the build)
RUN ruff check . --exit-zero

# Create directory for uploaded audio files
RUN mkdir -p /app/uploads

# Create directory for ML models
RUN mkdir -p /app/models

# Expose port
EXPOSE 8000

# Run migrations and start server
CMD ["sh", "-c", "mkdir -p /app/data/uploads /app/data/models && ln -sfn /app/data/uploads /app/uploads && ln -sfn /app/data/models /app/models && alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1"]
