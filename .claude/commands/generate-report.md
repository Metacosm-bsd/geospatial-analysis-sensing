# Generate Report

Generate a professional forest inventory report from analysis results.

## Workflow

1. **Validate Analysis**
   - Confirm analysis is complete
   - Check tree detection and metrics are available

2. **Compile Data**
   - Invoke `@report-generation` agent
   - Aggregate stand-level summaries
   - Calculate species composition
   - Generate diameter distributions

3. **Apply Standards**
   - Invoke `@regulatory-compliance` for FIA compliance
   - Use correct species codes and units
   - Include required metadata

4. **Generate Outputs**
   - PDF report with charts and maps
   - Excel workbook with data tables
   - Shapefile with tree points and stands

5. **Quality Check**
   - Validate calculations
   - Check formatting and presentation
   - Verify export file integrity

## Usage

```
/generate-report [analysis_id] [--format] [--standard]
```

## Options

- `--format` - Output format: `pdf`, `excel`, `shapefile`, `all` (default: all)
- `--standard` - Reporting standard: `fia`, `fri`, `vcs` (default: fia)

## Report Sections

### PDF Report
- Executive Summary
- Methodology
- Stand Summary Tables
- Species Composition
- Diameter Distribution Charts
- Maps (CHM, species, density)
- Appendix: Tree List

### Excel Workbook
- Summary sheet
- Stand Table
- Species Composition
- Diameter Distribution
- Tree List
- Metadata

## Agents Used

- `@report-generation` - Report templates and formatting
- `@regulatory-compliance` - Standards compliance
- `@forestry-expert` - Calculation validation
