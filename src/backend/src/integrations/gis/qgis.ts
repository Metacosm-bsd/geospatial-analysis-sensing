/**
 * QGIS Integration
 * Export data in QGIS-compatible formats and generate plugin code
 * Sprint 61-66: Third-Party Integrations
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import archiver from 'archiver';

const prisma = new PrismaClient();

// ============================================================================
// Types
// ============================================================================

export interface QGISExportOptions {
  format: 'geopackage' | 'shapefile' | 'geojson';
  includeStyles?: boolean;
  coordinateSystem?: string; // Default: EPSG:4326
  layers?: ('trees' | 'plots' | 'boundary' | 'stands')[];
}

export interface QGISLayerStyle {
  name: string;
  type: 'point' | 'polygon' | 'line';
  style: {
    fillColor?: string;
    strokeColor?: string;
    strokeWidth?: number;
    symbol?: string;
    size?: number;
    labelField?: string;
  };
}

export interface QGISProject {
  name: string;
  crs: string;
  layers: QGISLayer[];
  styles: QGISLayerStyle[];
}

export interface QGISLayer {
  name: string;
  source: string;
  type: 'vector' | 'raster';
  geometryType: 'Point' | 'Polygon' | 'LineString';
  fields: Array<{ name: string; type: string }>;
}

// ============================================================================
// QGIS Export Service
// ============================================================================

export class QGISExportService {
  // ==========================================================================
  // Export to GeoPackage
  // ==========================================================================

  async exportToGeoPackage(
    projectId: string,
    outputPath: string,
    options: QGISExportOptions = { format: 'geopackage' }
  ): Promise<{ filePath: string; layerCount: number; featureCount: number }> {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        analyses: {
          include: {
            trees: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    const analysis = project.analyses[0];
    const trees = analysis?.trees || [];

    // Generate GeoJSON data
    const treesGeoJSON = this.treesToGeoJSON(trees);
    const boundaryGeoJSON = project.boundaryGeoJSON;

    let layerCount = 0;
    let featureCount = 0;

    // For now, export as GeoJSON (would use GDAL/OGR for actual GeoPackage)
    const exportData = {
      type: 'FeatureCollection',
      name: project.name,
      crs: {
        type: 'name',
        properties: { name: options.coordinateSystem || 'urn:ogc:def:crs:EPSG::4326' },
      },
      features: treesGeoJSON.features,
    };

    // Write to file
    const filePath = outputPath.endsWith('.geojson')
      ? outputPath
      : `${outputPath}/${project.name.replace(/\s+/g, '_')}_trees.geojson`;

    await fs.promises.writeFile(filePath, JSON.stringify(exportData, null, 2));

    layerCount = 1;
    featureCount = treesGeoJSON.features.length;

    return { filePath, layerCount, featureCount };
  }

  // ==========================================================================
  // Export to Shapefile
  // ==========================================================================

  async exportToShapefile(
    projectId: string,
    outputDir: string
  ): Promise<{ zipPath: string; layers: string[] }> {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        analyses: {
          include: { trees: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    const analysis = project.analyses[0];
    const trees = analysis?.trees || [];

    // Create output directory
    const shapefileDir = path.join(outputDir, `${project.name.replace(/\s+/g, '_')}_shapefiles`);
    await fs.promises.mkdir(shapefileDir, { recursive: true });

    const layers: string[] = [];

    // Export trees as GeoJSON (shapefile generation would require GDAL)
    const treesGeoJSON = this.treesToGeoJSON(trees);
    const treesPath = path.join(shapefileDir, 'trees.geojson');
    await fs.promises.writeFile(treesPath, JSON.stringify(treesGeoJSON, null, 2));
    layers.push('trees');

    // Export boundary if available
    if (project.boundaryGeoJSON) {
      const boundaryGeoJSON = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: project.boundaryGeoJSON,
            properties: {
              project_id: project.id,
              project_name: project.name,
            },
          },
        ],
      };
      const boundaryPath = path.join(shapefileDir, 'boundary.geojson');
      await fs.promises.writeFile(boundaryPath, JSON.stringify(boundaryGeoJSON, null, 2));
      layers.push('boundary');
    }

    // Create ZIP archive
    const zipPath = path.join(outputDir, `${project.name.replace(/\s+/g, '_')}_shapefiles.zip`);
    await this.createZipArchive(shapefileDir, zipPath);

    return { zipPath, layers };
  }

  // ==========================================================================
  // Generate QGIS Project File (.qgs)
  // ==========================================================================

  generateProjectFile(config: QGISProject): string {
    const qgsXml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE qgis PUBLIC 'http://mrcc.com/qgis.dtd' 'SYSTEM'>
<qgis version="3.22" projectname="${config.name}">
  <homePath path=""/>
  <title>${config.name}</title>
  <autotransaction active="0"/>
  <evaluateDefaultValues active="0"/>
  <trust active="0"/>
  <projectCrs>
    <spatialrefsys>
      <wkt>GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]</wkt>
      <proj4>+proj=longlat +datum=WGS84 +no_defs</proj4>
      <srsid>3452</srsid>
      <srid>4326</srid>
      <authid>EPSG:4326</authid>
      <description>WGS 84</description>
    </spatialrefsys>
  </projectCrs>
  <layer-tree-group>
    <customproperties/>
    ${config.layers
      .map(
        (layer, index) => `
    <layer-tree-layer checked="Qt::Checked" expanded="1" id="${layer.name}_${index}" name="${layer.name}" source="${layer.source}">
      <customproperties/>
    </layer-tree-layer>`
      )
      .join('')}
  </layer-tree-group>
  <projectlayers>
    ${config.layers
      .map(
        (layer, index) => `
    <maplayer autoRefreshEnabled="0" geometry="${layer.geometryType}" hasScaleBasedVisibilityFlag="0" id="${layer.name}_${index}" labelsEnabled="0" readOnly="0" refreshOnNotifyEnabled="0" refreshOnNotifyMessage="" simplifyAlgorithm="0" simplifyDrawingHints="1" simplifyDrawingTol="1" simplifyLocal="1" simplifyMaxScale="1" type="vector" wkbType="${layer.geometryType}">
      <extent/>
      <id>${layer.name}_${index}</id>
      <datasource>${layer.source}</datasource>
      <layername>${layer.name}</layername>
      <srs>
        <spatialrefsys>
          <authid>EPSG:4326</authid>
        </spatialrefsys>
      </srs>
      <provider encoding="UTF-8">ogr</provider>
    </maplayer>`
      )
      .join('')}
  </projectlayers>
  <visibility-presets/>
  <transformContext/>
  <Annotations/>
  <Layouts/>
</qgis>`;

    return qgsXml;
  }

  // ==========================================================================
  // Generate QGIS Style File (.qml)
  // ==========================================================================

  generateStyleFile(style: QGISLayerStyle): string {
    const fillColor = style.style.fillColor || '#3388ff';
    const strokeColor = style.style.strokeColor || '#000000';
    const strokeWidth = style.style.strokeWidth || 0.5;
    const size = style.style.size || 3;

    if (style.type === 'point') {
      return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE qgis PUBLIC 'http://mrcc.com/qgis.dtd' 'SYSTEM'>
<qgis version="3.22" styleCategories="AllStyleCategories">
  <renderer-v2 type="singleSymbol">
    <symbols>
      <symbol type="marker" name="0" clip_to_extent="1" force_rhr="0">
        <layer class="SimpleMarker" enabled="1" pass="0" locked="0">
          <prop k="color" v="${fillColor}"/>
          <prop k="outline_color" v="${strokeColor}"/>
          <prop k="outline_width" v="${strokeWidth}"/>
          <prop k="size" v="${size}"/>
          <prop k="name" v="circle"/>
        </layer>
      </symbol>
    </symbols>
  </renderer-v2>
  ${
    style.style.labelField
      ? `
  <labeling type="simple">
    <settings>
      <text-style fieldName="${style.style.labelField}" fontSize="10"/>
      <placement dist="2" priority="5"/>
    </settings>
  </labeling>`
      : ''
  }
</qgis>`;
    }

    // Polygon style
    return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE qgis PUBLIC 'http://mrcc.com/qgis.dtd' 'SYSTEM'>
<qgis version="3.22" styleCategories="AllStyleCategories">
  <renderer-v2 type="singleSymbol">
    <symbols>
      <symbol type="fill" name="0" clip_to_extent="1" force_rhr="0">
        <layer class="SimpleFill" enabled="1" pass="0" locked="0">
          <prop k="color" v="${fillColor}"/>
          <prop k="outline_color" v="${strokeColor}"/>
          <prop k="outline_width" v="${strokeWidth}"/>
          <prop k="style" v="solid"/>
        </layer>
      </symbol>
    </symbols>
  </renderer-v2>
</qgis>`;
  }

  // ==========================================================================
  // Generate QGIS Plugin Skeleton
  // ==========================================================================

  generatePluginSkeleton(): { files: Record<string, string> } {
    const files: Record<string, string> = {};

    // metadata.txt
    files['metadata.txt'] = `[general]
name=LiDAR Forest Connector
qgisMinimumVersion=3.0
description=Connect to LiDAR Forest Analysis Platform
version=1.0.0
author=LiDAR Forest
email=support@lidarforest.com
about=Import forest inventory data from LiDAR Forest Analysis Platform directly into QGIS.

tracker=https://github.com/lidarforest/qgis-plugin/issues
repository=https://github.com/lidarforest/qgis-plugin

tags=lidar,forest,inventory,carbon,trees

homepage=https://lidarforest.com
category=Vector
icon=icon.png
experimental=False
deprecated=False`;

    // __init__.py
    files['__init__.py'] = `def classFactory(iface):
    from .lidar_forest_plugin import LidarForestPlugin
    return LidarForestPlugin(iface)`;

    // Main plugin file
    files['lidar_forest_plugin.py'] = `"""
LiDAR Forest QGIS Plugin
Connect to LiDAR Forest Analysis Platform
"""

from qgis.PyQt.QtCore import QSettings, QTranslator, QCoreApplication, QUrl
from qgis.PyQt.QtGui import QIcon
from qgis.PyQt.QtWidgets import QAction, QDialog, QVBoxLayout, QLineEdit, QPushButton, QLabel, QComboBox, QMessageBox
from qgis.core import QgsVectorLayer, QgsProject, QgsCoordinateReferenceSystem
import os
import json
import urllib.request

class LidarForestPlugin:
    def __init__(self, iface):
        self.iface = iface
        self.plugin_dir = os.path.dirname(__file__)
        self.actions = []
        self.menu = 'LiDAR Forest'
        self.toolbar = self.iface.addToolBar('LiDAR Forest')
        self.toolbar.setObjectName('LidarForestToolbar')

        self.api_url = 'https://api.lidarforest.com/api/v1'
        self.api_key = ''

    def initGui(self):
        """Initialize GUI elements."""
        icon_path = os.path.join(self.plugin_dir, 'icon.png')

        # Import action
        import_action = QAction(QIcon(icon_path), 'Import from LiDAR Forest', self.iface.mainWindow())
        import_action.triggered.connect(self.show_import_dialog)
        self.toolbar.addAction(import_action)
        self.iface.addPluginToMenu(self.menu, import_action)
        self.actions.append(import_action)

        # Settings action
        settings_action = QAction('Settings', self.iface.mainWindow())
        settings_action.triggered.connect(self.show_settings_dialog)
        self.iface.addPluginToMenu(self.menu, settings_action)
        self.actions.append(settings_action)

    def unload(self):
        """Remove plugin GUI elements."""
        for action in self.actions:
            self.iface.removePluginMenu(self.menu, action)
            self.toolbar.removeAction(action)
        del self.toolbar

    def show_settings_dialog(self):
        """Show settings dialog for API configuration."""
        dialog = QDialog()
        dialog.setWindowTitle('LiDAR Forest Settings')
        layout = QVBoxLayout()

        layout.addWidget(QLabel('API Key:'))
        api_key_input = QLineEdit()
        api_key_input.setText(self.api_key)
        layout.addWidget(api_key_input)

        layout.addWidget(QLabel('API URL:'))
        api_url_input = QLineEdit()
        api_url_input.setText(self.api_url)
        layout.addWidget(api_url_input)

        save_btn = QPushButton('Save')
        save_btn.clicked.connect(lambda: self.save_settings(api_key_input.text(), api_url_input.text(), dialog))
        layout.addWidget(save_btn)

        dialog.setLayout(layout)
        dialog.exec_()

    def save_settings(self, api_key, api_url, dialog):
        """Save settings."""
        self.api_key = api_key
        self.api_url = api_url
        settings = QSettings()
        settings.setValue('lidarforest/api_key', api_key)
        settings.setValue('lidarforest/api_url', api_url)
        dialog.accept()

    def show_import_dialog(self):
        """Show import dialog."""
        if not self.api_key:
            QMessageBox.warning(None, 'API Key Required', 'Please configure your API key in Settings first.')
            return

        dialog = QDialog()
        dialog.setWindowTitle('Import from LiDAR Forest')
        layout = QVBoxLayout()

        layout.addWidget(QLabel('Select Project:'))
        project_combo = QComboBox()
        layout.addWidget(project_combo)

        # Fetch projects
        try:
            projects = self.fetch_projects()
            for proj in projects:
                project_combo.addItem(proj['name'], proj['id'])
        except Exception as e:
            QMessageBox.critical(None, 'Error', f'Failed to fetch projects: {str(e)}')
            return

        import_btn = QPushButton('Import Trees')
        import_btn.clicked.connect(lambda: self.import_trees(project_combo.currentData(), dialog))
        layout.addWidget(import_btn)

        dialog.setLayout(layout)
        dialog.exec_()

    def fetch_projects(self):
        """Fetch projects from LiDAR Forest API."""
        req = urllib.request.Request(f'{self.api_url}/projects')
        req.add_header('Authorization', f'Bearer {self.api_key}')

        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode())
            return data.get('data', [])

    def import_trees(self, project_id, dialog):
        """Import trees from a project."""
        try:
            req = urllib.request.Request(f'{self.api_url}/projects/{project_id}/trees')
            req.add_header('Authorization', f'Bearer {self.api_key}')

            with urllib.request.urlopen(req) as response:
                data = json.loads(response.read().decode())
                trees = data.get('data', [])

            if not trees:
                QMessageBox.information(None, 'No Data', 'No trees found in this project.')
                return

            # Create GeoJSON
            geojson = {
                'type': 'FeatureCollection',
                'features': []
            }

            for tree in trees:
                feature = {
                    'type': 'Feature',
                    'geometry': {
                        'type': 'Point',
                        'coordinates': [tree.get('longitude', 0), tree.get('latitude', 0)]
                    },
                    'properties': {
                        'tree_number': tree.get('treeNumber'),
                        'species': tree.get('speciesCode'),
                        'dbh': tree.get('dbh'),
                        'height': tree.get('height'),
                        'health': tree.get('healthStatus')
                    }
                }
                geojson['features'].append(feature)

            # Create layer
            geojson_str = json.dumps(geojson)
            layer = QgsVectorLayer(geojson_str, f'Trees - {project_id[:8]}', 'ogr')

            if layer.isValid():
                QgsProject.instance().addMapLayer(layer)
                QMessageBox.information(None, 'Success', f'Imported {len(trees)} trees.')
                dialog.accept()
            else:
                QMessageBox.critical(None, 'Error', 'Failed to create layer.')

        except Exception as e:
            QMessageBox.critical(None, 'Error', f'Import failed: {str(e)}')
`;

    return { files };
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  private treesToGeoJSON(trees: any[]): GeoJSON.FeatureCollection {
    return {
      type: 'FeatureCollection',
      features: trees.map((tree) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [tree.longitude || 0, tree.latitude || 0],
        },
        properties: {
          tree_number: tree.treeNumber,
          species_code: tree.speciesCode,
          species_name: tree.speciesCommonName,
          dbh_cm: tree.dbh,
          height_m: tree.height,
          crown_diameter_m: tree.crownDiameter,
          crown_class: tree.crownClass,
          health_status: tree.healthStatus,
          biomass_kg: tree.biomass,
          carbon_kg: tree.carbon,
        },
      })),
    };
  }

  private async createZipArchive(sourceDir: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(outputPath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', () => resolve());
      archive.on('error', (err) => reject(err));

      archive.pipe(output);
      archive.directory(sourceDir, false);
      archive.finalize();
    });
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createQGISExportService(): QGISExportService {
  return new QGISExportService();
}
