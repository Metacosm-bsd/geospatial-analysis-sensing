# Troubleshooting Guide

Solutions to common issues when installing and running the LiDAR Forest Analysis Platform.

## Table of Contents

- [Docker Issues](#docker-issues)
- [Database Issues](#database-issues)
- [Processing Service Issues](#processing-service-issues)
- [Backend API Issues](#backend-api-issues)
- [Frontend Issues](#frontend-issues)
- [Network & Connectivity Issues](#network--connectivity-issues)
- [Performance Issues](#performance-issues)
- [Platform-Specific Issues](#platform-specific-issues)

---

## Docker Issues

### Container Won't Start

**Symptom:** `docker compose up` exits immediately or container restarts continuously.

**Diagnosis:**
```bash
# Check container status
docker compose ps -a

# View container logs
docker compose logs [service_name]

# Check Docker daemon status
docker info
```

**Solutions:**

1. **Port conflict:**
   ```bash
   # Find what's using the port
   lsof -i :5432  # or any port

   # Change port in .env
   POSTGRES_PORT=5433
   ```

2. **Insufficient resources:**
   ```bash
   # Check Docker resource limits
   docker system info | grep -i memory

   # Increase in Docker Desktop settings:
   # Settings > Resources > Memory: 8GB minimum
   ```

3. **Corrupted image:**
   ```bash
   # Remove and rebuild
   docker compose down -v
   docker system prune -a
   docker compose build --no-cache
   docker compose up -d
   ```

### Build Failures

**Symptom:** `docker compose build` fails with errors.

**Common Causes:**

1. **Network timeout during package installation:**
   ```bash
   # Retry with longer timeout
   docker compose build --no-cache --progress=plain

   # Or use a different DNS
   # Add to /etc/docker/daemon.json:
   # {"dns": ["8.8.8.8", "8.8.4.4"]}
   ```

2. **Missing build context:**
   ```bash
   # Ensure all files exist
   ls -la src/processing/Dockerfile
   ls -la src/backend/Dockerfile
   ls -la src/frontend/Dockerfile
   ```

3. **Disk space:**
   ```bash
   # Check available space
   df -h

   # Clean Docker cache
   docker system prune -a --volumes
   ```

### Docker Compose Version Issues

**Symptom:** "unsupported compose file version" or similar errors.

**Solution:**
```bash
# Check version
docker compose version

# Update Docker Compose (if standalone)
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Or use Docker Desktop which includes Compose V2
```

---

## Database Issues

### Connection Refused

**Symptom:** "connection refused" or "could not connect to server"

**Diagnosis:**
```bash
# Check if PostgreSQL is running
docker compose ps postgres

# Check PostgreSQL logs
docker compose logs postgres

# Test connection
docker exec lidar-postgres pg_isready -U lidar -d lidar_forest
```

**Solutions:**

1. **Container not started:**
   ```bash
   docker compose up -d postgres
   # Wait for health check
   sleep 15
   docker compose ps postgres  # Should show "healthy"
   ```

2. **Wrong credentials:**
   ```bash
   # Verify .env settings match
   grep POSTGRES .env

   # Reset database (WARNING: deletes data)
   docker compose down -v
   docker compose up -d postgres
   ```

3. **Network issue:**
   ```bash
   # Verify network exists
   docker network ls | grep lidar

   # Recreate network
   docker compose down
   docker network rm lidar-network 2>/dev/null
   docker compose up -d
   ```

### PostGIS Extension Missing

**Symptom:** "extension postgis does not exist"

**Solution:**
```bash
# Connect to database and create extension
docker exec -it lidar-postgres psql -U lidar -d lidar_forest -c "CREATE EXTENSION IF NOT EXISTS postgis;"

# Or check init script ran
docker compose logs postgres | grep -i postgis
```

### Migration Failures

**Symptom:** Prisma migration errors

**Solutions:**
```bash
# Reset migrations (WARNING: deletes data)
docker exec lidar-backend npx prisma migrate reset --force

# Generate fresh migration
docker exec lidar-backend npx prisma migrate dev --name init

# Check migration status
docker exec lidar-backend npx prisma migrate status
```

---

## Processing Service Issues

### GDAL/PDAL Not Found

**Symptom:** "gdal not found" or "pdal not found" errors

**In Docker:**
```bash
# Rebuild processing container
docker compose build --no-cache processing

# Verify installation
docker exec lidar-processing pdal --version
docker exec lidar-processing gdalinfo --version
```

**Local Development:**
```bash
# macOS
brew install gdal pdal

# Ubuntu
sudo apt install libgdal-dev gdal-bin libpdal-dev pdal

# Verify
pdal --version
gdalinfo --version
```

### Out of Memory During Processing

**Symptom:** Container killed or "MemoryError"

**Solutions:**

1. **Increase container memory:**
   ```yaml
   # In docker-compose.yml, processing service:
   deploy:
     resources:
       limits:
         memory: 16G
       reservations:
         memory: 4G
   ```

2. **Reduce worker count:**
   ```bash
   # In .env
   PROCESSING_WORKERS=2
   ```

3. **Process smaller files:**
   Split large LAS files into tiles before processing.

### LAS File Processing Errors

**Symptom:** "Invalid LAS file" or "unsupported format"

**Diagnosis:**
```bash
# Validate LAS file with PDAL
docker exec lidar-processing pdal info /app/sample_data/your_file.las
```

**Common Fixes:**

1. **Unsupported LAS version:**
   ```bash
   # Convert to supported format
   pdal translate input.las output.las --writers.las.minor_version=4
   ```

2. **Compressed LAZ file:**
   LAZ files should be supported. If not:
   ```bash
   # Decompress first
   laszip -i input.laz -o output.las
   ```

3. **Corrupted file:**
   ```bash
   # Validate header
   pdal info --metadata your_file.las
   ```

### Health Check Failing

**Symptom:** Processing container shows "unhealthy"

**Diagnosis:**
```bash
# Check what's happening
docker compose logs processing --tail 100

# Test health endpoint manually
docker exec lidar-processing curl http://localhost:8000/health
```

**Solutions:**

1. **Service starting slowly:**
   ```yaml
   # Increase start_period in docker-compose.yml
   healthcheck:
     start_period: 120s
   ```

2. **Dependency not ready:**
   ```bash
   # Ensure dependencies are healthy first
   docker compose up -d postgres redis minio
   sleep 30
   docker compose --profile full up -d
   ```

---

## Backend API Issues

### JWT Token Errors

**Symptom:** "invalid token" or "jwt malformed"

**Solutions:**

1. **Secret mismatch:**
   ```bash
   # Ensure same secret in .env
   JWT_SECRET=your_32_character_minimum_secret

   # Restart backend
   docker compose restart backend
   ```

2. **Token expired:**
   ```bash
   # Increase expiration in .env
   JWT_EXPIRES_IN=30d
   ```

3. **Clear old tokens:**
   - Log out and log back in
   - Clear browser localStorage

### Prisma Client Errors

**Symptom:** "PrismaClient is unable to be run"

**Solution:**
```bash
# Regenerate Prisma client
docker exec lidar-backend npx prisma generate

# Or rebuild container
docker compose build --no-cache backend
docker compose up -d backend
```

### File Upload Failures

**Symptom:** Uploads fail or timeout

**Solutions:**

1. **Increase limits:**
   ```bash
   # In .env
   MAX_UPLOAD_SIZE_MB=1000
   ```

2. **Check S3/MinIO:**
   ```bash
   # Verify bucket exists
   docker exec lidar-minio mc ls local/

   # Create if missing
   docker exec lidar-minio mc mb local/lidar-uploads
   ```

---

## Frontend Issues

### Blank Page or Build Errors

**Symptom:** White screen, 404, or build failures

**Diagnosis:**
```bash
# Check frontend logs
docker compose logs frontend

# Check if nginx is running
docker exec lidar-frontend nginx -t
```

**Solutions:**

1. **Build failure:**
   ```bash
   # Rebuild with verbose output
   docker compose build --no-cache frontend --progress=plain
   ```

2. **Environment variables not set:**
   ```bash
   # Verify API URLs are correct
   grep VITE .env

   # Rebuild to pick up changes
   docker compose build frontend
   docker compose up -d frontend
   ```

3. **Browser cache:**
   - Hard refresh: Ctrl+Shift+R (Windows/Linux) or Cmd+Shift+R (Mac)
   - Clear browser cache

### API Connection Errors

**Symptom:** "Network Error" or CORS errors in console

**Solutions:**

1. **Check API URLs:**
   ```bash
   # Frontend should reach backend at correct URL
   VITE_API_URL=http://localhost:4000

   # For Docker internal networking
   VITE_API_URL=http://backend:4000
   ```

2. **CORS configuration:**
   Add allowed origins in backend configuration.

3. **Firewall blocking:**
   ```bash
   # macOS
   sudo pfctl -d  # Disable firewall temporarily for testing

   # Ubuntu
   sudo ufw allow 3000
   sudo ufw allow 4000
   ```

---

## Network & Connectivity Issues

### Services Can't Communicate

**Symptom:** One service can't reach another

**Diagnosis:**
```bash
# Check network connectivity
docker exec lidar-backend ping postgres
docker exec lidar-backend ping processing

# Verify all on same network
docker network inspect lidar-network
```

**Solutions:**

1. **Network not created:**
   ```bash
   docker network create lidar-network
   docker compose up -d
   ```

2. **Container not on network:**
   ```bash
   docker network connect lidar-network lidar-backend
   ```

### DNS Resolution Failures

**Symptom:** "could not resolve host"

**Solution:**
```bash
# Add to Docker daemon config (/etc/docker/daemon.json):
{
  "dns": ["8.8.8.8", "8.8.4.4"]
}

# Restart Docker
sudo systemctl restart docker
```

---

## Performance Issues

### Slow Processing

**Diagnosis:**
```bash
# Monitor resource usage
docker stats

# Check processing logs for timing
docker compose logs processing | grep -i "processing time"
```

**Optimizations:**

1. **Increase workers:**
   ```bash
   PROCESSING_WORKERS=8
   ```

2. **Allocate more memory:**
   ```yaml
   # In docker-compose.yml
   deploy:
     resources:
       limits:
         memory: 16G
   ```

3. **Use SSD storage:**
   Ensure Docker volumes are on SSD.

### High Memory Usage

**Diagnosis:**
```bash
# Check memory by container
docker stats --no-stream

# Monitor over time
docker stats
```

**Solutions:**

1. **Limit container memory:**
   ```yaml
   deploy:
     resources:
       limits:
         memory: 4G
   ```

2. **Reduce Redis memory:**
   ```bash
   # In Redis config
   maxmemory 512mb
   maxmemory-policy allkeys-lru
   ```

---

## Platform-Specific Issues

### macOS

**Docker Desktop resource limits:**
1. Open Docker Desktop
2. Settings > Resources
3. Increase Memory to 8GB+
4. Increase CPUs to 4+
5. Click "Apply & Restart"

**File sharing slow:**
Add project directory to Docker Desktop > Settings > Resources > File Sharing

### Windows (WSL2)

**WSL2 memory limits:**
Create `%UserProfile%\.wslconfig`:
```ini
[wsl2]
memory=8GB
processors=4
```
Then restart WSL: `wsl --shutdown`

**Line ending issues:**
```bash
# Configure git
git config --global core.autocrlf input

# Fix existing files
find . -type f -name "*.sh" -exec dos2unix {} \;
```

### Linux

**Permission issues:**
```bash
# Add user to docker group
sudo usermod -aG docker $USER
newgrp docker

# Fix socket permissions
sudo chmod 666 /var/run/docker.sock
```

**SELinux blocking:**
```bash
# Check if SELinux is blocking
sudo ausearch -m AVC -ts recent

# Temporary disable (not recommended for production)
sudo setenforce 0
```

---

## Getting Help

### Collect Diagnostic Information

When reporting issues, include:

```bash
# System info
docker version
docker compose version
uname -a

# Container status
docker compose --profile full ps -a

# All logs
docker compose --profile full logs > docker-logs.txt

# Environment (remove secrets!)
env | grep -E '^(POSTGRES|REDIS|S3|JWT|VITE)' | sed 's/=.*/=***/'
```

### Support Resources

- **GitHub Issues:** Report bugs and feature requests
- **Documentation:** `docs/` directory
- **API Docs:** http://localhost:8000/docs

### Log Locations

| Service | Container Logs | Files |
|---------|---------------|-------|
| PostgreSQL | `docker compose logs postgres` | `/var/lib/postgresql/data/log/` |
| Processing | `docker compose logs processing` | stdout only |
| Backend | `docker compose logs backend` | stdout only |
| Frontend | `docker compose logs frontend` | `/var/log/nginx/` |
