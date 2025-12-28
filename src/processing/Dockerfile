# Multi-stage build for Python processing worker
# Stage 1: Base with system dependencies
FROM python:3.11-slim-bookworm AS base

# Install system dependencies for geospatial libraries
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libgdal-dev \
    gdal-bin \
    libgeos-dev \
    libproj-dev \
    proj-bin \
    proj-data \
    libpdal-dev \
    pdal \
    git \
    wget \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Set GDAL environment variables
ENV GDAL_CONFIG=/usr/bin/gdal-config
ENV CPLUS_INCLUDE_PATH=/usr/include/gdal
ENV C_INCLUDE_PATH=/usr/include/gdal

# Stage 2: Production
FROM base AS production

WORKDIR /app

# Create non-root user
RUN useradd -m -u 1001 worker

# Copy pyproject.toml and install dependencies
COPY pyproject.toml ./

# Install Python dependencies
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir .

# Copy source code
COPY src/ ./src/

# Create directories for data
RUN mkdir -p /app/data /app/logs && \
    chown -R worker:worker /app

# Switch to non-root user
USER worker

# Health check via Redis ping (assumes worker process checks health)
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD python -c "import redis; r = redis.Redis(host='redis', port=6379); r.ping()" || exit 1

# Start worker
CMD ["python", "-m", "processing.worker"]

# Stage 3: Development
FROM base AS development

WORKDIR /app

# Copy pyproject.toml and install with dev dependencies
COPY pyproject.toml ./

# Install Python dependencies including dev
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -e ".[dev]"

# Copy source code
COPY . .

# Expose port for debugging
EXPOSE 5678

# Start worker with hot reload using watchfiles
CMD ["python", "-m", "processing.worker"]
