# Installation Guide

Complete installation guide for the LiDAR Forest Analysis Platform.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start with Docker](#quick-start-with-docker)
- [Manual Installation](#manual-installation)
- [Configuration](#configuration)
- [Verification](#verification)
- [Production Deployment](#production-deployment)

---

## Prerequisites

### Required Software

| Software | Minimum Version | Purpose |
|----------|-----------------|---------|
| Docker | 24.0+ | Container runtime |
| Docker Compose | 2.20+ | Container orchestration |
| Git | 2.30+ | Source code management |

### System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| CPU | 4 cores | 8+ cores |
| RAM | 8 GB | 16+ GB |
| Storage | 50 GB | 100+ GB SSD |
| OS | macOS 12+, Ubuntu 20.04+, Windows 11 (WSL2) | Ubuntu 22.04 LTS |

### Port Requirements

Ensure these ports are available:

| Port | Service | Description |
|------|---------|-------------|
| 3000 | Frontend | React application |
| 4000 | Backend | Node.js API + Public REST API |
| 8000 | Processing | Python processing API |
| 5432 | PostgreSQL | Database |
| 6379 | Redis | Cache & queue |
| 9000 | MinIO API | Object storage |
| 9001 | MinIO Console | Storage admin UI |
| 8080 | Adminer | Database admin (dev only) |
| 8081 | Redis Commander | Redis admin (dev only) |
| 8082 | Swagger UI | API documentation (dev only) |

---

## Quick Start with Docker

### Step 1: Clone the Repository

```bash
git clone https://github.com/yourusername/geospatial-analysis-sensing.git
cd geospatial-analysis-sensing
```

### Step 2: Configure Environment

```bash
# Copy the example environment file
cp .env.example .env

# Edit configuration (optional for development)
nano .env  # or your preferred editor
```

For development, the defaults work out of the box. For production, update:
- `POSTGRES_PASSWORD` - Strong database password
- `JWT_SECRET` - Minimum 32-character random string
- `MINIO_ROOT_PASSWORD` - Strong storage password

### Step 3: Start Infrastructure Services

```bash
# Start PostgreSQL, Redis, and MinIO
docker compose up -d

# Verify services are healthy
docker compose ps
```

Expected output:
```
NAME               STATUS         PORTS
lidar-minio        Up (healthy)   0.0.0.0:9000-9001->9000-9001/tcp
lidar-postgres     Up (healthy)   0.0.0.0:5432->5432/tcp
lidar-redis        Up (healthy)   0.0.0.0:6379->6379/tcp
```

### Step 4: Initialize Storage

Create the required S3 bucket:

```bash
# Access MinIO console at http://localhost:9001
# Login: minioadmin / minioadmin (or your configured credentials)
# Create bucket: lidar-uploads

# Or use the MinIO CLI:
docker exec lidar-minio mc alias set local http://localhost:9000 minioadmin minioadmin
docker exec lidar-minio mc mb local/lidar-uploads
```

### Step 5: Start Application Services

```bash
# Build and start all services
docker compose --profile full up -d --build

# Watch the logs
docker compose --profile full logs -f
```

### Step 6: Verify Installation

```bash
# Check all services
docker compose --profile full ps

# Test API health
curl http://localhost:4000/health
curl http://localhost:8000/health
```

### Step 7: Access the Application

| Service | URL | Credentials |
|---------|-----|-------------|
| Frontend | http://localhost:3000 | Create account |
| Backend API | http://localhost:4000 | N/A |
| Public API (v1) | http://localhost:4000/api/v1 | API Key |
| Processing API | http://localhost:8000 | N/A |
| API Documentation | http://localhost:8082 | N/A (dev profile) |
| MinIO Console | http://localhost:9001 | minioadmin/minioadmin |
| Adminer | http://localhost:8080 | lidar/lidar_dev_password (dev profile) |
| Redis Commander | http://localhost:8081 | N/A (dev profile) |

### Step 8: Create an API Key

To use the Public REST API, create an API key:

1. Log in to the frontend at http://localhost:3000
2. Navigate to Settings > Developer > API Keys
3. Click "Create API Key" and select permissions
4. Copy and save your API key (it won't be shown again)

Test your API key:
```bash
curl -H "Authorization: Bearer lf_live_your_key" \
  http://localhost:4000/api/v1/projects
```

---

## Manual Installation

For development without Docker, or for custom deployments.

### 1. Database Setup

```bash
# Install PostgreSQL 15+ with PostGIS
# macOS:
brew install postgresql@15 postgis

# Ubuntu:
sudo apt install postgresql-15 postgresql-15-postgis-3

# Create database and user
sudo -u postgres psql <<EOF
CREATE USER lidar WITH PASSWORD 'lidar_dev_password';
CREATE DATABASE lidar_forest OWNER lidar;
\c lidar_forest
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS uuid-ossp;
GRANT ALL PRIVILEGES ON DATABASE lidar_forest TO lidar;
EOF
```

### 2. Redis Setup

```bash
# macOS:
brew install redis
brew services start redis

# Ubuntu:
sudo apt install redis-server
sudo systemctl enable redis-server
```

### 3. Python Processing Service

```bash
cd src/processing

# Create virtual environment
python3.11 -m venv venv
source venv/bin/activate

# Install system dependencies (Ubuntu)
sudo apt install libgdal-dev gdal-bin libgeos-dev libproj-dev libpdal-dev pdal

# Install Python dependencies
pip install -e ".[dev]"

# Run the service
uvicorn lidar_processing.main:app --host 0.0.0.0 --port 8000 --reload
```

### 4. Node.js Backend

```bash
cd src/backend

# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Run database migrations
npx prisma migrate deploy

# Start development server
npm run dev
```

### 5. React Frontend

```bash
cd src/frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

---

## Configuration

### Environment Variables Reference

#### Database

| Variable | Default | Description |
|----------|---------|-------------|
| `POSTGRES_USER` | lidar | Database username |
| `POSTGRES_PASSWORD` | lidar_dev_password | Database password |
| `POSTGRES_DB` | lidar_forest | Database name |
| `POSTGRES_PORT` | 5432 | Database port |
| `DATABASE_URL` | (constructed) | Full connection string |

#### Redis

| Variable | Default | Description |
|----------|---------|-------------|
| `REDIS_URL` | redis://localhost:6379 | Redis connection URL |
| `REDIS_PORT` | 6379 | Redis port |

#### Storage (S3/MinIO)

| Variable | Default | Description |
|----------|---------|-------------|
| `S3_ENDPOINT` | http://localhost:9000 | S3 API endpoint |
| `S3_ACCESS_KEY` | minioadmin | Access key |
| `S3_SECRET_KEY` | minioadmin | Secret key |
| `S3_BUCKET` | lidar-uploads | Bucket name |
| `S3_REGION` | us-east-1 | AWS region |

#### Authentication

| Variable | Default | Description |
|----------|---------|-------------|
| `JWT_SECRET` | (required) | JWT signing secret (min 32 chars) |
| `JWT_EXPIRES_IN` | 7d | Token expiration time |

#### Public API

| Variable | Default | Description |
|----------|---------|-------------|
| `API_RATE_LIMIT_FREE` | 60 | Free tier requests/minute |
| `API_RATE_LIMIT_STARTER` | 120 | Starter tier requests/minute |
| `API_RATE_LIMIT_PRO` | 300 | Professional tier requests/minute |
| `API_RATE_LIMIT_ENTERPRISE` | 1000 | Enterprise tier requests/minute |

#### Webhooks

| Variable | Default | Description |
|----------|---------|-------------|
| `WEBHOOK_TIMEOUT_MS` | 30000 | Webhook delivery timeout |
| `WEBHOOK_RETRY_COUNT` | 5 | Maximum retry attempts |

#### Processing

| Variable | Default | Description |
|----------|---------|-------------|
| `PROCESSING_WORKERS` | 4 | Number of worker threads |
| `MAX_UPLOAD_SIZE_MB` | 500 | Maximum upload file size |
| `LOG_LEVEL` | INFO | Logging verbosity |

#### Application Ports

| Variable | Default | Description |
|----------|---------|-------------|
| `FRONTEND_PORT` | 3000 | Frontend port |
| `BACKEND_PORT` | 4000 | Backend API port |
| `PROCESSING_PORT` | 8000 | Processing API port |

### Docker Compose Profiles

| Profile | Services | Use Case |
|---------|----------|----------|
| (default) | postgres, redis, minio | Infrastructure only |
| `full` | + processing, backend, frontend, webhook-worker | Full application |
| `dev` | + adminer, redis-commander, swagger-ui | Development tools |

Usage:
```bash
# Infrastructure only
docker compose up -d

# Full application
docker compose --profile full up -d

# With development tools (includes API docs)
docker compose --profile full --profile dev up -d

# View API documentation
open http://localhost:8082  # Swagger UI
```

---

## Verification

### Health Checks

```bash
# Check all container health
docker compose --profile full ps

# Check individual service health
curl -s http://localhost:4000/health | jq
curl -s http://localhost:8000/health | jq

# Database connection test
docker exec lidar-postgres pg_isready -U lidar -d lidar_forest
```

### Run Tests

```bash
# Backend tests
docker exec lidar-backend npm test

# Processing tests
docker exec lidar-processing pytest

# Frontend tests (if running locally)
cd src/frontend && npm test
```

### Sample Data Processing

```bash
# Upload a sample LAS file via the API
curl -X POST http://localhost:8000/api/v1/analyze \
  -F "file=@data/sample.las" \
  -F "project_id=TEST001"
```

---

## Production Deployment

### Security Checklist

- [ ] Change all default passwords in `.env`
- [ ] Generate strong `JWT_SECRET` (32+ random characters)
- [ ] Use HTTPS with valid SSL certificates
- [ ] Enable firewall rules for exposed ports
- [ ] Configure database backups
- [ ] Set up log aggregation and monitoring
- [ ] Review and restrict CORS settings

### Generate Secure Secrets

```bash
# Generate JWT secret
openssl rand -base64 48

# Generate database password
openssl rand -base64 24

# Generate MinIO credentials
openssl rand -base64 24
```

### Production Docker Compose

Create `docker-compose.prod.yml`:

```yaml
version: '3.8'

services:
  postgres:
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - /var/lib/lidar/postgres:/var/lib/postgresql/data

  processing:
    deploy:
      resources:
        limits:
          memory: 16G
        reservations:
          memory: 4G

  frontend:
    ports:
      - "443:443"
    volumes:
      - ./nginx/ssl:/etc/nginx/ssl:ro
```

Deploy with:
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile full up -d
```

### Kubernetes Deployment

For Kubernetes deployments, see the `k8s/` directory (if available) or contact the DevOps team.

---

## Common Installation Issues

See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for solutions to common problems.

### Quick Fixes

**Port already in use:**
```bash
# Find process using port
lsof -i :5432

# Kill process or change port in .env
```

**Docker build fails:**
```bash
# Clear Docker cache
docker system prune -a
docker compose build --no-cache
```

**Database connection refused:**
```bash
# Wait for PostgreSQL to be healthy
docker compose up -d postgres
sleep 10
docker compose --profile full up -d
```

---

## Next Steps

1. **Create an account** at http://localhost:3000
2. **Upload sample data** from the `data/` directory
3. **Create an API key** in Settings > Developer > API Keys
4. **Explore the Public API** at http://localhost:8082 (Swagger UI, dev profile)
5. **Install an SDK** for programmatic access:
   ```bash
   # JavaScript/TypeScript
   npm install @lidarforest/sdk

   # Python
   pip install lidarforest
   ```
6. **Set up webhooks** for real-time event notifications
7. **Read the SDK documentation** in `sdks/javascript/README.md` or `sdks/python/README.md`
