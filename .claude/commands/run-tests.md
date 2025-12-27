# Run Tests

Execute the test suite for the LiDAR Forest Analysis Platform.

## Workflow

1. **Check Environment**
   - Verify Node.js, Python, and database are available
   - Ensure test dependencies are installed

2. **Run Unit Tests**
   - Frontend: `vitest` for React components
   - Backend: `jest` for Node.js services
   - Processing: `pytest` for Python modules

3. **Run Integration Tests**
   - API endpoint tests
   - Database integration tests
   - Processing pipeline tests

4. **Run E2E Tests** (optional)
   - Playwright for critical user flows
   - Upload → Process → Report workflow

5. **Generate Coverage Report**
   - Combine coverage from all test suites
   - Identify uncovered code paths

## Usage

```
/run-tests [scope] [--coverage] [--e2e]
```

## Options

- `scope` - Test scope: `all`, `frontend`, `backend`, `processing`
- `--coverage` - Generate coverage report
- `--e2e` - Include E2E tests (slower)

## Commands Executed

```bash
# Frontend
cd src/frontend && npm test

# Backend
cd src/backend && npm test

# Processing
cd src/processing && pytest

# E2E
npm run test:e2e

# Coverage
npm run test:coverage
```

## Agents Used

- `@qa-testing` - For test strategy and debugging failures
