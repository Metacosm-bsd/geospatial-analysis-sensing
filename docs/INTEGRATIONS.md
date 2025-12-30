# Third-Party Integrations Guide

This document covers all third-party integrations available in the LiDAR Forest Analysis Platform.

## Table of Contents

1. [Forest Planning Software](#forest-planning-software)
   - [Forest Metrix](#forest-metrix)
   - [Trimble Forestry](#trimble-forestry)
2. [Carbon Registries](#carbon-registries)
   - [Verra VCS](#verra-vcs)
   - [Climate Action Reserve (CAR)](#climate-action-reserve-car)
3. [GIS Platforms](#gis-platforms)
   - [ArcGIS Online](#arcgis-online)
   - [QGIS](#qgis)
4. [Growth Models](#growth-models)
   - [FVS (Forest Vegetation Simulator)](#fvs-forest-vegetation-simulator)

---

## Forest Planning Software

### Forest Metrix

Forest Metrix is a cloud-based forest inventory management platform. Our integration supports bidirectional data exchange.

#### Configuration

```typescript
import { ForestMetrixClient, ForestMetrixService } from '@/integrations/forest-metrix';

const client = new ForestMetrixClient({
  baseUrl: process.env.FOREST_METRIX_API_URL,
  clientId: process.env.FOREST_METRIX_CLIENT_ID,
  clientSecret: process.env.FOREST_METRIX_CLIENT_SECRET,
});

const service = new ForestMetrixService(client);
```

#### Export to Forest Metrix

```typescript
// Export a project with all analyses
const result = await service.exportProject(projectId);

console.log('Exported:', result.exportedItems);
console.log('Forest Metrix Project ID:', result.syncedProjectId);
```

#### Import from Forest Metrix

```typescript
// Import inventory data from Forest Metrix
const result = await service.importProject(forestMetrixProjectId, userId);

console.log('Created Project:', result.localProjectId);
console.log('Imported Trees:', result.syncedItems);
```

#### Data Mapping

| LiDAR Forest Field | Forest Metrix Field |
|-------------------|---------------------|
| `tree.dbh` (cm) | `diameter_inches` |
| `tree.height` (m) | `total_height_feet` |
| `tree.speciesCode` | `fia_species_code` |
| `tree.crownDiameter` (m) | `crown_diameter_feet` |
| `tree.healthStatus` | `tree_class` |

---

### Trimble Forestry

Trimble Forestry integration supports CFD (Cruise Field Data) file format for field data collection workflows.

#### Configuration

```typescript
import { TrimbleClient, TrimbleService } from '@/integrations/trimble';

const client = new TrimbleClient({
  baseUrl: process.env.TRIMBLE_API_URL,
  apiKey: process.env.TRIMBLE_API_KEY,
});

const service = new TrimbleService(client);
```

#### Export to CFD Format

```typescript
// Export analysis as CFD XML file
const cfdXml = await service.exportToCFDFile(analysisId);

// Or export with full metadata
const result = await service.exportAnalysis(analysisId);
console.log('Cruise ID:', result.cruiseId);
```

#### Import from CFD File

```typescript
// Import CFD file contents
const cfdXml = await fs.readFile('cruise_data.cfd', 'utf-8');
const result = await service.importFromCFDFile(cfdXml, targetProjectId);

console.log('Imported Trees:', result.treesCreated);
```

#### CFD File Structure

```xml
<?xml version="1.0" encoding="UTF-8"?>
<CruiseFieldData version="3.0">
  <CruiseInfo>
    <CruiseId>CRUISE123</CruiseId>
    <CruiseName>Example Cruise</CruiseName>
  </CruiseInfo>
  <Plots>
    <Plot id="1">
      <Trees>
        <Tree id="1">
          <Species>DF</Species>
          <DBH>24.5</DBH>
          <Height>120</Height>
        </Tree>
      </Trees>
    </Plot>
  </Plots>
</CruiseFieldData>
```

---

## Carbon Registries

### Verra VCS

Verra VCS (Verified Carbon Standard) export generates Project Description Documents (PDD) and Monitoring Reports.

#### Configuration

```typescript
import { VerraExportService } from '@/integrations/carbon-registries';

const verraService = new VerraExportService();
```

#### Generate PDD

```typescript
// Generate Project Description Document
const pdd = await verraService.generatePDD(projectId);

console.log('Project:', pdd.projectName);
console.log('Methodology:', pdd.methodology);
console.log('Area:', pdd.projectArea, 'hectares');
```

#### Generate Monitoring Report

```typescript
// Generate monitoring report for verification
const report = await verraService.generateMonitoringReport(analysisId, {
  start: '2024-01-01',
  end: '2024-12-31',
});

console.log('Net Reductions:', report.emissionReductions.netReductions, 'tCO2e');
console.log('Buffer Pool:', report.permanenceRiskAssessment.bufferContribution, '%');
```

#### Request Credit Issuance

```typescript
// Generate issuance request after verification
const issuance = await verraService.generateIssuanceRequest(monitoringReport);

console.log('Credits Requested:', issuance.creditsRequested);
console.log('Net to Issue:', issuance.netCreditsToIssue);
```

#### Supported Methodologies

- **VM0003** - Methodology for IFM through Extension of Rotation Age
- **VM0010** - Methodology for IFM on Non-Federal U.S. Forestlands
- **VM0012** - Improved Forest Management in Temperate/Boreal Forests

---

### Climate Action Reserve (CAR)

CAR integration exports data in compliance with the Forest Project Protocol.

#### Configuration

```typescript
import { CARExportService } from '@/integrations/carbon-registries';

const carService = new CARExportService();
```

#### Generate Project Application

```typescript
const application = await carService.generateProjectApplication(projectId);

console.log('Forest Area:', application.forestArea, 'acres');
console.log('Protocol:', application.protocol);
```

#### Generate Inventory Report

```typescript
const report = await carService.generateInventoryReport(analysisId, {
  start: '2024-01-01',
  end: '2024-12-31',
});

console.log('Carbon Pools:', report.carbonPools.totalOnsite, 'tCO2e');
console.log('Uncertainty:', report.uncertaintyAssessment.totalUncertainty, '%');
```

#### Export Complete Data Package

```typescript
const package = await carService.exportDataPackage(projectId);

// Includes:
// - application: Project application data
// - inventoryData: Tree list and summaries
// - spatialData: GIS requirements
// - supportingDocs: Required documentation list
```

#### CAR Carbon Pools

| Pool | Description |
|------|-------------|
| Standing Live Trees | Above and below ground biomass |
| Standing Dead Trees | Snags and stumps |
| Lying Dead Wood | Coarse woody debris |
| Shrubs & Understory | Non-tree vegetation |
| Forest Floor Litter | Fine organic matter |

---

## GIS Platforms

### ArcGIS Online

Publish tree inventory and project boundaries to ArcGIS Online Feature Services.

#### Configuration

```typescript
import { ArcGISClient, ArcGISService } from '@/integrations/gis';

const client = new ArcGISClient({
  portalUrl: 'https://www.arcgis.com',
  clientId: process.env.ARCGIS_CLIENT_ID,
  clientSecret: process.env.ARCGIS_CLIENT_SECRET,
});

const service = new ArcGISService(client);
```

#### Publish Tree Inventory

```typescript
const result = await service.publishTreeInventory(analysisId, {
  title: 'Forest Inventory 2024',
  description: 'LiDAR-derived tree inventory',
  folderId: 'your-folder-id', // optional
  tags: ['forestry', 'lidar', 'inventory'],
});

console.log('Service URL:', result.serviceUrl);
console.log('Item ID:', result.itemId);
console.log('Published Trees:', result.featureCount);
```

#### Publish Project Boundary

```typescript
const result = await service.publishProjectBoundary(projectId, {
  title: 'Project Boundary',
  description: 'Project area boundary',
});

console.log('Boundary Service:', result.serviceUrl);
```

#### Layer Schema

Tree inventory layers include these fields:

| Field | Type | Description |
|-------|------|-------------|
| OBJECTID | Integer | Unique identifier |
| tree_id | String | Tree ID from analysis |
| species | String | Species code |
| dbh_cm | Double | Diameter at breast height |
| height_m | Double | Total height |
| crown_diameter_m | Double | Crown diameter |
| carbon_tonnes | Double | Carbon content |
| health_status | String | Tree health |

---

### QGIS

Export data to QGIS-compatible formats and generate plugin for direct integration.

#### Configuration

```typescript
import { QGISExportService } from '@/integrations/gis';

const qgisService = new QGISExportService();
```

#### Export to GeoPackage

```typescript
const result = await qgisService.exportToGeoPackage(projectId, outputPath, {
  includeTrees: true,
  includeBoundary: true,
  includeAnalysisPolygons: true,
  coordinateSystem: 'EPSG:4326',
});

console.log('GeoPackage:', result.geoPackagePath);
console.log('Layers:', result.layers);
```

#### Export to Shapefile

```typescript
const result = await qgisService.exportToShapefile(projectId, outputDir);

console.log('Zip file:', result.zipPath);
// Contains: trees.shp, boundary.shp, analysis.shp
```

#### Generate Project File

```typescript
const qgsXml = qgisService.generateProjectFile({
  name: 'Forest Analysis',
  crs: 'EPSG:4326',
  layers: [
    {
      name: 'Trees',
      source: 'trees.gpkg|layername=trees',
      type: 'point',
      style: treeStyle,
    },
    {
      name: 'Boundary',
      source: 'boundary.gpkg|layername=boundary',
      type: 'polygon',
      style: boundaryStyle,
    },
  ],
});
```

#### QGIS Plugin

Generate a QGIS plugin skeleton for direct platform integration:

```typescript
const plugin = qgisService.generatePluginSkeleton();

// Creates these files:
// - __init__.py
// - metadata.txt
// - lidar_forest_plugin.py
// - dialog.py
// - dialog.ui
```

Install the plugin by copying files to `~/.local/share/QGIS/QGIS3/profiles/default/python/plugins/lidar_forest/`.

---

## Growth Models

### FVS (Forest Vegetation Simulator)

FVS is the USDA Forest Service's official growth and yield model. Our integration generates input files and parses output.

#### Configuration

```typescript
import { FVSService, selectFVSVariant } from '@/integrations/fvs';

// Auto-select variant based on location
const variant = selectFVSVariant('WA'); // Returns 'PN' for Pacific Northwest

const fvsService = new FVSService(variant, {
  carbonReports: true,
  fireAndFuels: false,
});
```

#### Export to FVS Format

```typescript
const result = await fvsService.exportToFVS(analysisId, {
  projectionYears: 100,
  managementScenario: 'baseline',
});

console.log('Tree file:', result.treeFilePath);
console.log('Keyword file:', result.keywordFilePath);
console.log('Run script:', result.runScript);
```

#### Available Management Scenarios

```typescript
const scenarios = fvsService.getPresetScenarios();

// Returns:
// - No Action: Natural growth
// - Commercial Thinning: Thin to 60 BA from below
// - Pre-Commercial Thinning: Early density reduction
// - Variable Retention Harvest: 70% harvest, 30% retention
// - Selection Harvest: Uneven-aged management
// - Carbon Maximization: Extended rotation
```

#### Generate Multiple Scenarios

```typescript
const result = await fvsService.generateGrowthScenarios(analysisId, [
  {
    name: 'Baseline',
    description: 'No management',
    managementActions: [],
  },
  {
    name: 'Thin_2030',
    description: 'Commercial thin in 2030',
    managementActions: fvsService.getPresetScenarios()[1].keywords,
  },
]);

console.log('Scenario files:', result.scenarioFiles);
```

#### Import FVS Results

```typescript
const results = await fvsService.importFVSResults(
  analysisId,
  '/path/to/fvs_output.txt'
);

console.log('Projections:', results.projections.length, 'stands');
console.log('Peak Carbon:', results.summary.peakCarbon, 'at year', results.summary.peakCarbonYear);
```

#### FVS Variants

| Variant | Region | States |
|---------|--------|--------|
| PN | Pacific Northwest | WA, OR |
| CA | California | CA |
| NE | Northeast | ME, NH, VT, MA, NY, PA, etc. |
| SN | Southern | VA, NC, SC, GA, FL, AL, MS, TX, etc. |
| LS | Lake States | MN, WI, MI |
| CR | Central Rockies | CO, WY |
| BM | Blue Mountains | OR, WA (east) |
| IE | Inland Empire | ID, MT (west) |

#### Tree File Format

FVS tree files use fixed-width columns:

```
! FVS Tree List File
! Variant: PN
STAND001
   1   1 DF  24.5 120  40 00000 00000 00000     0    10.0   0.0  0.00   0 C
   1   2 WH  18.2  95  35 00000 00000 00000     0    10.0   0.0  0.00   0 I
-999
```

#### Keyword File Format

```
STDIDENT          Stand identifier
STAND001
INVYEAR           Inventory year
2024
NUMCYCLE          Number of projection cycles
10
TIMEINT           Time interval between cycles
0  10
CARBREPT          Enable carbon reporting
PROCESS           Process the simulation
STOP              End of simulation
```

---

## Environment Variables

Create a `.env` file with these integration credentials:

```bash
# Forest Metrix
FOREST_METRIX_API_URL=https://api.forestmetrix.com/v1
FOREST_METRIX_CLIENT_ID=your_client_id
FOREST_METRIX_CLIENT_SECRET=your_client_secret

# Trimble Forestry
TRIMBLE_API_URL=https://api.trimbleforestry.com/v1
TRIMBLE_API_KEY=your_api_key

# ArcGIS Online
ARCGIS_CLIENT_ID=your_client_id
ARCGIS_CLIENT_SECRET=your_client_secret

# FVS (optional - for remote execution)
FVS_HOME=/usr/local/fvs
```

---

## Error Handling

All integration services throw typed errors:

```typescript
try {
  await service.exportProject(projectId);
} catch (error) {
  if (error instanceof IntegrationAuthError) {
    // Handle authentication failures
    console.error('Auth failed:', error.message);
  } else if (error instanceof IntegrationDataError) {
    // Handle data validation errors
    console.error('Invalid data:', error.details);
  } else if (error instanceof IntegrationNetworkError) {
    // Handle network issues
    console.error('Network error:', error.statusCode);
  }
}
```

---

## Rate Limiting

Most third-party APIs have rate limits:

| Service | Rate Limit | Strategy |
|---------|------------|----------|
| Forest Metrix | 100 req/min | Exponential backoff |
| Trimble | 60 req/min | Queue with delay |
| ArcGIS Online | 2000 req/min | Batch requests |

---

## Support

For integration issues:

1. Check environment variables are set correctly
2. Verify API credentials are valid
3. Review rate limiting quotas
4. Check file format compatibility

For FVS-specific questions, refer to the [FVS User Guide](https://www.fs.usda.gov/fvs/).
