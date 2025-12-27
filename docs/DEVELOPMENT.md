# Development Guide

Guide for setting up and developing the LiDAR Forest Analysis Platform.

## Table of Contents

1. [Environment Setup](#environment-setup)
2. [Project Structure](#project-structure)
3. [Working with Claude Code Agents](#working-with-claude-code-agents)
4. [Development Workflow](#development-workflow)
5. [Testing](#testing)
6. [Code Standards](#code-standards)
7. [Common Tasks](#common-tasks)

---

## Environment Setup

### Prerequisites

| Requirement | Version | Purpose |
|-------------|---------|---------|
| Node.js | 20+ | Frontend and backend |
| Python | 3.11+ | LiDAR processing |
| PostgreSQL | 15+ | Database |
| PostGIS | 3.3+ | Spatial operations |
| Redis | 7+ | Caching and queues |
| Docker | 24+ | Containerization |

### Initial Setup

```bash
# Clone repository
git clone https://github.com/Metacosm-bsd/geospatial-analysis-sensing.git
cd geospatial-analysis-sensing

# Create Python virtual environment
python -m venv .venv
source .venv/bin/activate  # or .venv\Scripts\activate on Windows

# Install Python dependencies
pip install -r requirements.txt

# Install Node dependencies
npm install

# Set up database
createdb lidar_forest
psql lidar_forest -c "CREATE EXTENSION postgis;"

# Copy environment file
cp .env.example .env
# Edit .env with your configuration

# Run database migrations
npm run db:migrate
```

### Environment Variables

Create a `.env` file with:

```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/lidar_forest

# Redis
REDIS_URL=redis://localhost:6379

# AWS S3 (or compatible)
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
S3_BUCKET=lidar-uploads
S3_REGION=us-west-2

# Authentication
JWT_SECRET=your_jwt_secret
JWT_EXPIRY=24h

# Processing
MAX_FILE_SIZE_GB=10
PROCESSING_WORKERS=4
```

---

## Project Structure

```
geospatial-analysis-sensing/
├── .claude/
│   ├── agents/              # 16 specialized AI agents
│   │   ├── forestry-expert/
│   │   ├── lidar-processing/
│   │   ├── backend-engineering/
│   │   └── ...
│   ├── commands/            # Custom slash commands
│   │   ├── analyze-lidar.md
│   │   ├── run-tests.md
│   │   └── ...
│   └── settings.json        # Claude Code configuration
├── src/
│   ├── frontend/            # React application
│   │   ├── components/      # UI components
│   │   ├── hooks/           # Custom React hooks
│   │   ├── pages/           # Page components
│   │   ├── services/        # API clients
│   │   └── store/           # State management
│   ├── backend/             # Node.js API
│   │   ├── controllers/     # Request handlers
│   │   ├── services/        # Business logic
│   │   ├── models/          # Database models
│   │   ├── routes/          # API routes
│   │   └── middleware/      # Express middleware
│   └── processing/          # Python processing
│       ├── algorithms/      # LiDAR algorithms
│       ├── models/          # ML models
│       ├── pipelines/       # Processing pipelines
│       └── utils/           # Utilities
├── docs/                    # Documentation
├── tests/                   # Test files
├── k8s/                     # Kubernetes manifests
└── scripts/                 # Utility scripts
```

---

## Working with Claude Code Agents

### Agent Categories

| Category | Agents | When to Use |
|----------|--------|-------------|
| **Domain** | forestry-expert, lidar-processing, gis-spatial, regulatory-compliance | Forestry questions, algorithms, standards |
| **Engineering** | backend-engineering, frontend-engineering, data-processing | Writing code |
| **ML** | ml-model-ops, carbon-accounting | Model training, carbon calculations |
| **Quality** | qa-testing, security-testing, performance-testing | Testing and security |
| **Product** | ux-product, report-generation, api-integration | UX, reports, APIs |
| **Ops** | devops-infrastructure | Deployment, infrastructure |

### Agent Invocation

Agents are automatically invoked based on context. You can also request specific agents:

```
"Use the forestry-expert agent to validate this DBH calculation"
"Have backend-engineering design the file upload API"
"Ask carbon-accounting to verify VCS compliance"
```

### Agent Collaboration Patterns

**Feature Development:**
```
ux-product → backend-engineering → frontend-engineering → qa-testing
```

**LiDAR Pipeline:**
```
lidar-processing → data-processing → ml-model-ops → report-generation
```

**Carbon Project:**
```
forestry-expert → carbon-accounting → regulatory-compliance → report-generation
```

---

## Development Workflow

### Starting a Feature

1. **Create branch**
   ```bash
   git checkout -b feature/tree-detection-v2
   ```

2. **Plan with agents**
   - Use `@ux-product` for user flow
   - Use `@forestry-expert` for domain validation

3. **Implement**
   - Use appropriate engineering agents
   - Follow code standards

4. **Test**
   - Use `@qa-testing` for test strategy
   - Run `/run-tests`

5. **Security review**
   - Use `@security-testing` for audit

6. **Create PR**
   - Include agent recommendations in PR description

### Running the Platform

```bash
# Start all services (development)
npm run dev

# Individual services
npm run frontend       # Port 3000
npm run backend        # Port 4000
npm run worker         # Processing worker

# With Docker
docker-compose up
```

### Database Operations

```bash
# Create migration
npm run db:migration:create -- --name add_species_table

# Run migrations
npm run db:migrate

# Reset database
npm run db:reset

# Seed sample data
npm run db:seed
```

---

## Testing

### Test Structure

```
tests/
├── unit/
│   ├── frontend/        # React component tests
│   ├── backend/         # Service unit tests
│   └── processing/      # Python unit tests
├── integration/
│   ├── api/             # API endpoint tests
│   └── processing/      # Pipeline tests
└── e2e/
    └── workflows/       # End-to-end tests
```

### Running Tests

```bash
# All tests
npm test

# Frontend only
cd src/frontend && npm test

# Backend only
cd src/backend && npm test

# Python only
pytest src/processing

# E2E tests
npm run test:e2e

# With coverage
npm run test:coverage
```

### Test Data

Sample LiDAR files are in `data/samples/`:
- `small_plot.laz` - 1 hectare, 100K points
- `medium_stand.laz` - 10 hectares, 1M points
- `large_forest.laz` - 100 hectares, 10M points

---

## Code Standards

### TypeScript

```typescript
// Use strict TypeScript
// Prefer interfaces over types for objects
interface TreeDetectionResult {
  id: string;
  location: [number, number];
  height: number;
  crownDiameter: number;
  species?: string;
  confidence?: number;
}

// Use Zod for validation
const TreeSchema = z.object({
  height: z.number().positive(),
  dbh: z.number().positive().optional(),
});
```

### Python

```python
# Use type hints
def detect_trees(
    points: np.ndarray,
    min_height: float = 5.0,
    min_distance: float = 2.0,
) -> list[TreeDetection]:
    """
    Detect individual trees from normalized point cloud.

    Args:
        points: Nx3 array of (x, y, z) coordinates
        min_height: Minimum tree height in meters
        min_distance: Minimum distance between trees

    Returns:
        List of detected trees with metrics
    """
    ...
```

### Commits

Follow conventional commits:

```
feat: add species classification for Douglas Fir
fix: correct DBH estimation for multi-stem trees
docs: update agent invocation examples
test: add integration tests for upload API
refactor: optimize point cloud filtering
```

---

## Common Tasks

### Add a New Species Model

1. Collect training data (field-verified labels)
2. Use `@ml-model-ops` to design model
3. Train and validate with `@forestry-expert`
4. Deploy with `@devops-infrastructure`

### Implement New Report Format

1. Define format with `@report-generation`
2. Validate with `@regulatory-compliance`
3. Implement export logic
4. Test with sample data

### Add API Endpoint

1. Design with `@api-integration`
2. Implement with `@backend-engineering`
3. Add tests with `@qa-testing`
4. Document in OpenAPI spec

### Optimize Processing Performance

1. Profile with `@performance-testing`
2. Optimize with `@data-processing`
3. Validate accuracy with `@forestry-expert`
4. Benchmark improvements

---

## Troubleshooting

### Common Issues

**Database connection failed:**
```bash
# Check PostgreSQL is running
pg_isready -h localhost

# Check PostGIS extension
psql lidar_forest -c "SELECT PostGIS_Version();"
```

**Processing worker not starting:**
```bash
# Check Redis connection
redis-cli ping

# Check Python environment
which python
python --version
```

**Large file upload fails:**
```bash
# Check S3 configuration
aws s3 ls s3://$S3_BUCKET

# Check file size limits
echo $MAX_FILE_SIZE_GB
```

### Getting Help

1. Check existing documentation in `docs/`
2. Ask Claude Code with relevant agent
3. Search issues on GitHub
4. Contact team via Slack
