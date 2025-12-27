# LiDAR Forest Analysis Platform

## Project Overview

Cloud-based platform that transforms LiDAR point cloud data into professional forest inventory reports, carbon stock estimates, and 3D visualizations. Designed for consulting foresters, forest management companies, and carbon project developers.

**Value Proposition:** Professional-grade forest inventory from LiDAR data in minutes, not weeks—at a fraction of the cost.

## Technology Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 18+, TypeScript, Three.js, Tailwind CSS |
| **Backend** | Node.js, Express/NestJS, TypeScript |
| **Database** | PostgreSQL 15+ with PostGIS |
| **Processing** | Python 3.11+, NumPy, PDAL, laspy, scikit-learn |
| **Infrastructure** | Kubernetes, Docker, AWS S3, Redis |
| **CI/CD** | GitHub Actions |

## Project Structure

```
geospatial-analysis-sensing/
├── .claude/
│   ├── agents/          # 16 specialized AI agents
│   ├── commands/        # Custom slash commands
│   └── settings.json    # Claude Code configuration
├── src/                 # Source code (to be implemented)
│   ├── frontend/        # React application
│   ├── backend/         # Node.js API services
│   └── processing/      # Python LiDAR processing
├── data/                # Sample data files
├── docs/                # Documentation
│   ├── PRODUCT_OWNER_GUIDE.md
│   ├── subagent-specifications.md
│   └── DEVELOPMENT.md
├── tests/               # Test files
├── CLAUDE.md            # This file
└── README.md            # Project README
```

## Agent System

This project uses 16 specialized Claude Code agents. Invoke them based on task type:

### Quick Reference

| Task | Agent | Invoke With |
|------|-------|-------------|
| Tree measurements, species, carbon formulas | `forestry-expert` | Domain questions |
| Point cloud processing, tree detection | `lidar-processing` | LiDAR algorithms |
| Coordinates, spatial queries, maps | `gis-spatial` | GIS work |
| FIA/VCS/CAR standards, accessibility | `regulatory-compliance` | Compliance |
| Node.js APIs, PostgreSQL, auth | `backend-engineering` | Backend code |
| React components, Three.js, UI | `frontend-engineering` | Frontend code |
| Python processing, ML pipelines | `data-processing` | Data pipelines |
| ML training, species classification | `ml-model-ops` | ML models |
| Carbon calculations, VCS/CAR | `carbon-accounting` | Carbon credits |
| FIA reports, PDF/Excel exports | `report-generation` | Reports |
| API design, integrations, SDKs | `api-integration` | APIs |
| Test strategy, automation | `qa-testing` | Testing |
| Security audits, OWASP | `security-testing` | Security |
| Load testing, optimization | `performance-testing` | Performance |
| UX design, user research | `ux-product` | UX/Product |
| Kubernetes, CI/CD, monitoring | `devops-infrastructure` | DevOps |

### Agent Invocation

Agents are automatically invoked based on task context. You can also request specific agents:
- "Use the lidar-processing agent to design tree segmentation"
- "Have carbon-accounting validate this calculation"

## Development Workflow

### Starting a New Feature

1. **Plan**: Use `@ux-product` for user workflows, `@forestry-expert` for domain validation
2. **Design API**: Use `@backend-engineering` and `@api-integration`
3. **Implement Backend**: Use `@backend-engineering` and `@data-processing`
4. **Implement Frontend**: Use `@frontend-engineering`
5. **Test**: Use `@qa-testing` for test strategy
6. **Security Review**: Use `@security-testing`
7. **Deploy**: Use `@devops-infrastructure`

### Key Commands

```bash
# Development
npm run dev              # Start frontend dev server
npm run api              # Start backend API
python -m processing     # Run processing pipeline

# Testing
npm test                 # Run frontend tests
pytest                   # Run Python tests
npm run e2e              # Run E2E tests

# Building
npm run build            # Build for production
docker build .           # Build container
```

## Coding Standards

### TypeScript/JavaScript
- Use TypeScript strict mode
- Prefer functional components with hooks
- Use Zod for runtime validation
- Follow ESLint configuration

### Python
- Type hints required
- Use Black for formatting
- Follow PEP 8 guidelines
- Docstrings for public functions

### Database
- Use Prisma migrations
- PostGIS for spatial data
- Index spatial columns with GiST

## Key Accuracy Targets

| Metric | Target |
|--------|--------|
| Tree detection (>15cm DBH) | 90%+ |
| Species classification | 80%+ |
| Height estimation | ±0.5m |
| Crown diameter | ±1.0m |
| Processing time (100ha) | <5 min |

## Documentation

- **[Product Owner Guide](docs/PRODUCT_OWNER_GUIDE.md)** - Business context, roadmap, market
- **[Agent Specifications](docs/subagent-specifications.md)** - Detailed agent documentation
- **[Development Guide](docs/DEVELOPMENT.md)** - Setup and development workflow

## Common Patterns

### LiDAR Processing Pipeline
```
Upload LAS/LAZ → Validate → Normalize → Detect Trees → Classify Species → Calculate Metrics → Generate Report
```

### Carbon Calculation
```
Tree Detection → Species Classification → Biomass (FIA equations) → Carbon (×0.47) → CO₂e (×44/12)
```

### Report Generation
```
Analysis Results → Stand Summaries → Species Tables → Charts → PDF/Excel Export
```
