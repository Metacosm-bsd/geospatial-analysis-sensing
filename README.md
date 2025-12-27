# LiDAR Forest Analysis Platform

Cloud-based platform that transforms LiDAR point cloud data into professional forest inventory reports, carbon stock estimates, and 3D visualizations—in minutes, not weeks.

## Features

- **Automated Tree Detection** - AI-powered individual tree identification with 90%+ accuracy
- **Species Classification** - Machine learning for 80%+ species classification accuracy
- **Carbon Stock Estimation** - VCS/CAR/ACR-compliant carbon calculations with uncertainty quantification
- **Professional Reports** - FIA-compliant inventory reports with PDF, Excel, and Shapefile exports
- **3D Visualization** - Interactive point cloud viewer with tree annotations
- **Cloud Collaboration** - Share analyses with teams and clients

## Quick Start

### Prerequisites

- Node.js 20+
- Python 3.11+
- PostgreSQL 15+ with PostGIS
- Docker (optional)

### Installation

```bash
# Clone the repository
git clone https://github.com/Metacosm-bsd/geospatial-analysis-sensing.git
cd geospatial-analysis-sensing

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
npm run db:migrate
```

### Running Locally

```bash
# Start all services
npm run dev

# Or run individually:
npm run frontend    # React app on :3000
npm run backend     # API on :4000
python -m processing.worker  # Processing worker
```

## Technology Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, Three.js, Tailwind CSS |
| Backend | Node.js, NestJS, TypeScript, PostgreSQL/PostGIS |
| Processing | Python, NumPy, PDAL, laspy, scikit-learn, PyTorch |
| Infrastructure | Kubernetes, Docker, AWS S3, Redis |
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
│   └── processing/      # Python LiDAR processing
├── docs/
│   ├── PRODUCT_OWNER_GUIDE.md   # Business context and roadmap
│   ├── subagent-specifications.md  # Agent documentation
│   └── DEVELOPMENT.md   # Development guide
├── data/                # Sample data files
├── tests/               # Test files
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

## API Overview

```bash
# Upload LiDAR file
POST /api/v1/uploads

# Start analysis
POST /api/v1/analyses
{
  "fileId": "file_123",
  "options": {
    "detectTrees": true,
    "classifySpecies": true,
    "estimateCarbon": true
  }
}

# Get results
GET /api/v1/analyses/{id}/trees
GET /api/v1/analyses/{id}/report
```

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

## Documentation

- **[Product Owner Guide](docs/PRODUCT_OWNER_GUIDE.md)** - Market opportunity, business model, roadmap
- **[Agent Specifications](docs/subagent-specifications.md)** - Detailed agent documentation
- **[Development Guide](docs/DEVELOPMENT.md)** - Setup, workflow, and contribution guide
- **[CLAUDE.md](CLAUDE.md)** - Claude Code project context

## Accuracy Targets

| Metric | Target |
|--------|--------|
| Tree detection (>15cm DBH) | 90%+ |
| Species classification | 80%+ |
| Height estimation | ±0.5m |
| Crown diameter | ±1.0m |
| Processing time (100ha) | <5 min |

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see [LICENSE](LICENSE) for details.

## Contact

- Product: product@lidarforestry.com
- Support: support@lidarforestry.com
- Sales: sales@lidarforestry.com
