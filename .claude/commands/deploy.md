# Deploy

Deploy the LiDAR Forest Analysis Platform to staging or production.

## Workflow

1. **Pre-Deployment Checks**
   - Run full test suite
   - Check for security vulnerabilities
   - Verify environment configuration

2. **Build Artifacts**
   - Build frontend (React → static assets)
   - Build backend (TypeScript → JavaScript)
   - Build processing (Python → Docker image)

3. **Deploy Infrastructure**
   - Invoke `@devops-infrastructure` agent
   - Apply Terraform/Kubernetes changes
   - Update database migrations

4. **Deploy Services**
   - Push Docker images to registry
   - Update Kubernetes deployments
   - Rolling update with health checks

5. **Post-Deployment**
   - Run smoke tests
   - Verify monitoring and alerts
   - Update deployment log

## Usage

```
/deploy [environment] [--skip-tests] [--dry-run]
```

## Options

- `environment` - Target: `staging` or `production`
- `--skip-tests` - Skip pre-deployment tests (not recommended)
- `--dry-run` - Show what would be deployed without executing

## Environments

### Staging
- URL: staging.lidarforestry.com
- Auto-deploy on merge to `main`
- Used for QA and demos

### Production
- URL: app.lidarforestry.com
- Manual approval required
- Blue-green deployment

## Commands Executed

```bash
# Build
npm run build
docker build -t lidar-api .
docker build -t lidar-processing -f Dockerfile.processing .

# Deploy to staging
kubectl apply -f k8s/staging/

# Deploy to production
kubectl apply -f k8s/production/
```

## Agents Used

- `@devops-infrastructure` - Deployment orchestration
- `@security-testing` - Pre-deploy security scan
- `@performance-testing` - Post-deploy validation

## Rollback

```bash
# If issues detected
kubectl rollout undo deployment/lidar-api
kubectl rollout undo deployment/lidar-processing
```
