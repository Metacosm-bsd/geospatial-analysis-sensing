# LiDAR Forest Analysis Platform

Cloud-based platform that transforms LiDAR point cloud data into professional forest inventory reports, carbon stock estimates, and 3D visualizations—in minutes, not weeks.

## Features

- **Automated Tree Detection** - AI-powered individual tree identification with 90%+ accuracy
- **Species Classification** - Machine learning for 80%+ species classification accuracy
- **Carbon Stock Estimation** - VCS/CAR/ACR-compliant carbon calculations with uncertainty quantification
- **Professional Reports** - FIA-compliant inventory reports with PDF, Excel, and Shapefile exports
- **3D Visualization** - Interactive point cloud viewer with tree annotations
- **Cloud Collaboration** - Team workspaces with role-based permissions
- **Public REST API** - Full programmatic access with JavaScript and Python SDKs
- **Webhooks** - Real-time event notifications for integrations

## Quick Start

### Docker (Recommended)

```bash
# Clone the repository
git clone https://github.com/Metacosm-bsd/geospatial-analysis-sensing.git
cd geospatial-analysis-sensing

# Copy environment file
cp .env.example .env

# Start infrastructure (PostgreSQL, Redis, MinIO)
docker compose up -d

# Start all services
docker compose --profile full up -d

# With development tools (Adminer, Redis Commander, Swagger UI)
docker compose --profile full --profile dev up -d
```

### Manual Installation

```bash
# Install frontend dependencies
cd src/frontend && npm install

# Install backend dependencies
cd ../backend && npm install

# Install Python processing dependencies
cd ../processing && pip install -r requirements.txt

# Set up database
createdb lidar_forest
psql lidar_forest -c "CREATE EXTENSION postgis;"

# Run migrations
cd ../backend && npx prisma migrate deploy

# Start services
npm run dev
```

## Access Points

| Service | URL | Description |
|---------|-----|-------------|
| Frontend | http://localhost:3000 | React web application |
| Backend API | http://localhost:4000 | Internal REST API |
| Public API | http://localhost:4000/api/v1 | Public REST API (API key auth) |
| Processing API | http://localhost:8000 | Python processing service |
| API Documentation | http://localhost:8082 | Swagger UI (dev profile) |
| MinIO Console | http://localhost:9001 | Object storage admin |

## Public API

The Public API provides programmatic access to all platform features. Authentication uses API keys with tiered rate limits.

### Authentication

```bash
# Using Authorization header (recommended)
curl -H "Authorization: Bearer lf_live_your_api_key" \
  https://api.lidarforest.com/api/v1/projects

# Using X-API-Key header
curl -H "X-API-Key: lf_live_your_api_key" \
  https://api.lidarforest.com/api/v1/projects
```

### Rate Limits

| Tier | Requests/Minute | Requests/Day | Price |
|------|-----------------|--------------|-------|
| Free | 60 | 10,000 | $0 |
| Starter | 120 | 50,000 | $49/mo |
| Professional | 300 | 200,000 | $199/mo |
| Enterprise | 1,000 | Unlimited | Custom |

### Quick Examples

```bash
# List projects
curl -H "Authorization: Bearer $API_KEY" \
  https://api.lidarforest.com/api/v1/projects

# Start an analysis
curl -X POST -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"projectId":"...", "name":"Analysis", "type":"FULL_INVENTORY", "fileIds":["..."]}' \
  https://api.lidarforest.com/api/v1/analyses

# Get detected trees
curl -H "Authorization: Bearer $API_KEY" \
  https://api.lidarforest.com/api/v1/analyses/{id}/trees
```

### SDKs

Official SDKs are available for JavaScript/TypeScript and Python:

**JavaScript/TypeScript**
```bash
npm install @lidarforest/sdk
```

```typescript
import { LidarForest } from '@lidarforest/sdk';

const client = new LidarForest({ apiKey: 'lf_live_xxx' });

// List projects
const { data: projects } = await client.projects.list();

// Start analysis and wait for completion
const { data: analysis } = await client.analyses.create({
  projectId: 'xxx',
  name: 'Full Analysis',
  type: 'FULL_INVENTORY',
  fileIds: ['xxx'],
});

const completed = await client.analyses.waitForCompletion(analysis.id);
```

**Python**
```bash
pip install lidarforest
```

```python
from lidarforest import LidarForest
from lidarforest.models import CreateAnalysisInput, AnalysisType

client = LidarForest(api_key='lf_live_xxx')

# List projects
projects, pagination = client.projects.list()

# Start analysis and wait for completion
analysis = client.analyses.create(CreateAnalysisInput(
    project_id='xxx',
    name='Full Analysis',
    type=AnalysisType.FULL_INVENTORY,
    file_ids=['xxx'],
))

completed = client.analyses.wait_for_completion(analysis.id)
```

### Webhooks

Receive real-time notifications for events:

```bash
# Create webhook
curl -X POST -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://your-server.com/webhook", "events":["analysis.completed"]}' \
  https://api.lidarforest.com/api/webhooks
```

Available events:
- `project.created`, `project.updated`, `project.deleted`
- `file.uploaded`, `file.processed`, `file.deleted`
- `analysis.started`, `analysis.completed`, `analysis.failed`
- `report.generated`, `report.downloaded`
- `member.invited`, `member.joined`, `member.removed`

## Technology Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, Three.js, Tailwind CSS |
| Backend | Node.js, Express, TypeScript, PostgreSQL/PostGIS |
| Processing | Python, NumPy, PDAL, laspy, scikit-learn, PyTorch |
| Infrastructure | Docker, Kubernetes, AWS S3, Redis |
| CI/CD | GitHub Actions |

## Project Structure

```
geospatial-analysis-sensing/
├── .claude/
│   ├── agents/          # 16 AI agents for development assistance
│   ├── commands/        # Custom Claude Code commands
│   └── settings.json    # Claude Code configuration
├── src/
│   ├── frontend/        # React application
│   ├── backend/         # Node.js API services
│   │   ├── openapi.yaml # OpenAPI specification
│   │   └── src/
│   │       ├── routes/public-api/  # Public REST API
│   │       ├── services/           # Business logic
│   │       └── middleware/         # Auth, rate limiting
│   └── processing/      # Python LiDAR processing
├── sdks/
│   ├── javascript/      # Official JavaScript SDK
│   └── python/          # Official Python SDK
├── docs/
│   ├── INSTALLATION.md  # Installation guide
│   ├── TROUBLESHOOTING.md # Troubleshooting guide
│   ├── PRODUCT_OWNER_GUIDE.md   # Business context
│   └── DEVELOPMENT.md   # Development guide
├── docker-compose.yml   # Container orchestration
├── CLAUDE.md            # Claude Code project context
└── README.md            # This file
```

## Claude Code Agents

This project includes 16 specialized AI agents for development assistance:

### Domain Expertise
| Agent | Purpose |
|-------|---------|
| `forestry-expert` | Tree measurements, species parameters, carbon formulas |
| `lidar-processing` | Point cloud algorithms, tree segmentation, CHM |
| `gis-spatial` | Coordinate systems, spatial queries, mapping |
| `regulatory-compliance` | FIA, VCS, CAR, accessibility standards |

### Technical Engineering
| Agent | Purpose |
|-------|---------|
| `backend-engineering` | Node.js APIs, PostgreSQL, authentication |
| `frontend-engineering` | React components, Three.js, accessibility |
| `data-processing` | Python pipelines, ML models |
| `ml-model-ops` | Model training, hyperparameter tuning, MLOps |

### Specialized
| Agent | Purpose |
|-------|---------|
| `carbon-accounting` | VCS/CAR/ACR calculations, uncertainty |
| `report-generation` | FIA reports, PDF/Excel exports |
| `api-integration` | REST APIs, webhooks, SDKs |

### Quality & Operations
| Agent | Purpose |
|-------|---------|
| `qa-testing` | Test strategy, automation |
| `security-testing` | OWASP, vulnerability assessment |
| `performance-testing` | Load testing, optimization |
| `ux-product` | User research, UX design |
| `devops-infrastructure` | Kubernetes, CI/CD, monitoring |

## Testing

```bash
# Frontend tests
cd src/frontend && npm test

# Backend tests
cd src/backend && npm test

# Python tests
cd src/processing && pytest

# E2E tests
npm run test:e2e
```

## Accuracy Targets

| Metric | Target |
|--------|--------|
| Tree detection (>15cm DBH) | 90%+ |
| Species classification | 80%+ |
| Height estimation | ±0.5m |
| Crown diameter | ±1.0m |
| Processing time (100ha) | <5 min |

## Documentation

- **[Installation Guide](docs/INSTALLATION.md)** - Complete setup instructions
- **[Troubleshooting](docs/TROUBLESHOOTING.md)** - Common issues and solutions
- **[Product Owner Guide](docs/PRODUCT_OWNER_GUIDE.md)** - Market opportunity, business model
- **[Development Guide](docs/DEVELOPMENT.md)** - Setup, workflow, contribution guide
- **[CLAUDE.md](CLAUDE.md)** - Claude Code project context
- **[JavaScript SDK](sdks/javascript/README.md)** - JavaScript/TypeScript SDK documentation
- **[Python SDK](sdks/python/README.md)** - Python SDK documentation

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see [LICENSE](LICENSE) for details.

## Contact

- Product: product@lidarforest.com
- Support: support@lidarforest.com
- Sales: sales@lidarforest.com
- API Support: api@lidarforest.com
