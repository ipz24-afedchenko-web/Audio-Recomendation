# Deployment Guide - Audio-Based Music Recommender

This guide covers deploying the application using Docker, Docker Compose, and various cloud platforms.

---

## Table of Contents

1. [Quick Start with Docker Compose](#quick-start-with-docker-compose)
2. [Manual Docker Deployment](#manual-docker-deployment)
3. [Environment Configuration](#environment-configuration)
4. [Cloud Platform Deployment](#cloud-platform-deployment)
5. [Production Considerations](#production-considerations)
6. [Troubleshooting](#troubleshooting)

---

## Quick Start with Docker Compose

The easiest way to run the entire stack locally or on a server.

### Prerequisites

- Docker 20.10+
- Docker Compose 2.0+

### Steps

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd Music_genre_classifier
   ```

2. **Create environment file** (optional, uses defaults otherwise):
   ```bash
   cp backend/.env.example backend/.env
   # Edit backend/.env with your settings
   ```

3. **Start all services**:
   ```bash
   docker-compose up -d
   ```

4. **Check status**:
   ```bash
   docker-compose ps
   ```

5. **Access the application**:
   - Frontend: http://localhost
   - Backend API: http://localhost:8000
   - API Docs: http://localhost:8000/api/docs

6. **View logs**:
   ```bash
   docker-compose logs -f
   ```

7. **Stop services**:
   ```bash
   docker-compose down
   ```

8. **Stop and remove volumes** (deletes database data):
   ```bash
   docker-compose down -v
   ```

---

## Manual Docker Deployment

Deploy backend and frontend separately with custom configurations.

### Backend Deployment

1. **Build the image**:
   ```bash
   cd backend
   docker build -t music-recommender-backend .
   ```

2. **Run the container**:
   ```bash
   docker run -d \
     --name music-backend \
     -p 8000:8000 \
     -e DATABASE_URL="postgresql://user:password@host:5432/music_db" \
     -e SECRET_KEY="your-secret-key" \
     -v $(pwd)/uploads:/app/uploads \
     -v $(pwd)/models:/app/models \
     music-recommender-backend
   ```

3. **Check logs**:
   ```bash
   docker logs -f music-backend
   ```

### Frontend Deployment

1. **Build the image**:
   ```bash
   cd frontend
   docker build -t music-recommender-frontend .
   ```

2. **Run the container**:
   ```bash
   docker run -d \
     --name music-frontend \
     -p 80:80 \
     music-recommender-frontend
   ```

3. **Check logs**:
   ```bash
   docker logs -f music-frontend
   ```

---

## Environment Configuration

### Backend Environment Variables

Create `backend/.env` file:

```env
# Database
DATABASE_URL=postgresql://postgres:postgres@db:5432/music_db

# JWT Authentication
SECRET_KEY=change-this-to-a-secure-random-key-in-production
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# File Upload
MAX_UPLOAD_SIZE_MB=50
UPLOAD_DIR=/app/uploads

# ML Configuration
N_CLUSTERS=10
N_RECOMMENDATIONS=10
MODEL_DIR=/app/models
```

### Frontend Environment Variables

For production builds, create `frontend/.env.production`:

```env
VITE_API_URL=https://your-backend-api.com
```

---

## Cloud Platform Deployment

### AWS (Elastic Beanstalk + RDS)

1. **Install AWS CLI and EB CLI**:
   ```bash
   pip install awscli awsebcli
   ```

2. **Initialize Elastic Beanstalk**:
   ```bash
   eb init -p docker music-recommender
   ```

3. **Create RDS PostgreSQL database**:
   - Go to AWS RDS Console
   - Create PostgreSQL 15 instance
   - Note the endpoint URL

4. **Configure environment variables**:
   ```bash
   eb setenv DATABASE_URL="postgresql://user:pass@rds-endpoint:5432/music_db" \
            SECRET_KEY="your-production-secret-key"
   ```

5. **Deploy backend**:
   ```bash
   cd backend
   eb create music-recommender-backend
   eb deploy
   ```

6. **Deploy frontend** (using S3 + CloudFront):
   ```bash
   cd frontend
   npm run build
   aws s3 sync dist/ s3://your-bucket-name
   ```

### Heroku

1. **Install Heroku CLI**:
   ```bash
   # Download from https://devcenter.heroku.com/articles/heroku-cli
   ```

2. **Login to Heroku**:
   ```bash
   heroku login
   ```

3. **Create apps**:
   ```bash
   heroku create music-recommender-backend
   heroku create music-recommender-frontend
   ```

4. **Add PostgreSQL addon**:
   ```bash
   heroku addons:create heroku-postgresql:essential-0 -a music-recommender-backend
   ```

5. **Set environment variables**:
   ```bash
   heroku config:set SECRET_KEY="your-secret-key" -a music-recommender-backend
   ```

6. **Deploy backend**:
   ```bash
   cd backend
   heroku container:login
   heroku container:push web -a music-recommender-backend
   heroku container:release web -a music-recommender-backend
   ```

7. **Deploy frontend**:
   ```bash
   cd frontend
   heroku container:push web -a music-recommender-frontend
   heroku container:release web -a music-recommender-frontend
   ```

### Render

1. **Create account** at https://render.com

2. **Deploy backend**:
   - Click "New +" → "Web Service"
   - Connect your Git repository
   - Settings:
     - Name: music-recommender-backend
     - Environment: Docker
     - Region: Choose closest
     - Instance Type: Starter ($7/month)
   - Environment Variables:
     ```
     DATABASE_URL=<provided-by-render-postgres>
     SECRET_KEY=<generate-random-key>
     ```

3. **Create PostgreSQL database**:
   - Click "New +" → "PostgreSQL"
   - Name: music-db
   - Copy the Internal Database URL
   - Paste it as DATABASE_URL in backend service

4. **Deploy frontend**:
   - Click "New +" → "Static Site"
   - Connect repository
   - Settings:
     - Name: music-recommender-frontend
     - Build Command: `npm install && npm run build`
     - Publish Directory: `dist`
   - Environment Variables:
     ```
     VITE_API_URL=https://music-recommender-backend.onrender.com
     ```

### DigitalOcean (App Platform)

1. **Create account** at https://digitalocean.com

2. **Deploy with App Platform**:
   - Click "Create" → "Apps"
   - Connect your repository
   - Select "Docker Compose" deployment
   - Configure resources:
     - Backend: 1GB RAM, 1 vCPU
     - Frontend: 512MB RAM
     - Database: PostgreSQL managed database

3. **Set environment variables** in the dashboard

4. **Deploy** - automatic from Git pushes

---

## Production Considerations

### Security

1. **Change default credentials**:
   - Generate a strong SECRET_KEY:
     ```python
     import secrets
     print(secrets.token_urlsafe(32))
     ```
   - Update PostgreSQL username/password

2. **Use HTTPS**:
   - Configure SSL certificates (Let's Encrypt recommended)
   - Update CORS settings in backend to only allow your frontend domain

3. **Environment variables**:
   - Never commit `.env` files
   - Use platform-specific secret management (AWS Secrets Manager, etc.)

4. **Rate limiting**:
   - Add rate limiting middleware to FastAPI
   - Consider using nginx or API gateway

### Performance

1. **Database**:
   - Enable connection pooling (already in SQLAlchemy)
   - Add database indexes for frequently queried fields
   - Regular VACUUM and ANALYZE operations

2. **File storage**:
   - Use S3 or similar object storage for audio files instead of local storage
   - Implement CDN for static assets

3. **Caching**:
   - Add Redis for caching recommendations and audio features
   - Cache ML model predictions

4. **Scaling**:
   - Backend: Horizontal scaling with load balancer
   - Database: Read replicas for queries
   - ML models: Separate worker service with job queue

### Monitoring

1. **Logging**:
   - Centralized logging (ELK stack, CloudWatch, Datadog)
   - Structured JSON logs

2. **Metrics**:
   - Application metrics (response time, error rate)
   - System metrics (CPU, memory, disk)
   - Business metrics (uploads, recommendations generated)

3. **Health checks**:
   - Backend: `/api/health` endpoint (add if missing)
   - Database: Connection test
   - ML models: Model loading verification

### Backup

1. **Database backups**:
   - Automated daily backups
   - Test restore procedures
   - Off-site backup storage

2. **File backups**:
   - Regular backups of uploaded audio files
   - ML model checkpoints

---

## Troubleshooting

### Container won't start

```bash
# Check logs
docker-compose logs backend
docker-compose logs frontend

# Check if ports are available
netstat -an | grep 8000
netstat -an | grep 80

# Rebuild without cache
docker-compose build --no-cache
docker-compose up -d
```

### Database connection errors

```bash
# Check database is running
docker-compose ps db

# Check connection from backend container
docker-compose exec backend psql $DATABASE_URL -c "SELECT 1"

# Restart database
docker-compose restart db
```

### Migration errors

```bash
# Run migrations manually
docker-compose exec backend alembic upgrade head

# Check migration status
docker-compose exec backend alembic current

# Rollback if needed
docker-compose exec backend alembic downgrade -1
```

### Frontend can't reach backend

1. Check VITE_API_URL environment variable
2. Verify CORS settings in backend
3. Check network connectivity between containers
4. Inspect browser console for errors

### Audio analysis fails

1. Check ffmpeg is installed in container:
   ```bash
   docker-compose exec backend ffmpeg -version
   ```

2. Verify file upload size limits

3. Check uploaded file format is supported

### Out of memory errors

- Increase Docker memory limits
- Reduce N_CLUSTERS in ML configuration
- Process audio files in smaller batches

---

## Updating the Application

### With Docker Compose

```bash
# Pull latest code
git pull origin main

# Rebuild and restart
docker-compose down
docker-compose build
docker-compose up -d

# Run new migrations
docker-compose exec backend alembic upgrade head
```

### Rolling back

```bash
# Stop services
docker-compose down

# Checkout previous version
git checkout <previous-commit-hash>

# Rebuild and restart
docker-compose build
docker-compose up -d

# Rollback migrations if needed
docker-compose exec backend alembic downgrade <revision>
```

---

## Cost Estimation

### Render (Recommended for small projects)

- Backend: $7/month (Starter instance)
- Frontend: $0 (Static site free tier)
- Database: $7/month (Starter PostgreSQL)
- **Total**: ~$14/month

### Heroku

- Backend: $7/month (Eco dyno)
- Frontend: $0 (Static hosting via CDN)
- Database: $5/month (Essential PostgreSQL)
- **Total**: ~$12/month

### AWS (Production scale)

- EC2 t3.small: ~$15/month
- RDS db.t3.micro: ~$15/month
- S3 + CloudFront: ~$5/month
- **Total**: ~$35/month

### DigitalOcean

- Basic Droplet: $6/month
- Managed PostgreSQL: $15/month
- **Total**: ~$21/month

---

## Support

For deployment issues:
- Check application logs first
- Review this documentation
- Check Docker/platform-specific documentation
- Open an issue in the repository

---

**Last Updated**: 2026-06-11
