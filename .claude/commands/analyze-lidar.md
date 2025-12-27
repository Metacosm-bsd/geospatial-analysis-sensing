# Analyze LiDAR Data

Start a LiDAR analysis workflow for forest inventory.

## Workflow

1. **Validate Input**
   - Check LAS/LAZ file exists and is valid
   - Verify coordinate reference system
   - Assess point density and coverage

2. **Process Point Cloud**
   - Invoke `@lidar-processing` agent for:
     - Ground classification
     - Height normalization
     - CHM generation

3. **Detect Trees**
   - Run tree segmentation algorithm
   - Extract tree metrics (height, crown diameter)
   - Validate detection accuracy

4. **Classify Species** (optional)
   - Invoke `@ml-model-ops` for species classification
   - Apply regional species models
   - Calculate confidence scores

5. **Calculate Carbon** (optional)
   - Invoke `@carbon-accounting` for:
     - Biomass estimation (FIA equations)
     - Carbon stock calculation
     - Uncertainty quantification

6. **Generate Report**
   - Invoke `@report-generation` for:
     - Stand summaries
     - Species composition
     - PDF/Excel export

## Usage

```
/analyze-lidar [file_path] [--species] [--carbon] [--report]
```

## Options

- `--species` - Enable species classification
- `--carbon` - Enable carbon stock estimation
- `--report` - Generate inventory report

## Example

```
/analyze-lidar data/sample_forest.laz --species --carbon --report
```
