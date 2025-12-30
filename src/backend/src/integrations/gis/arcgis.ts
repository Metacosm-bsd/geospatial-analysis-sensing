/**
 * ArcGIS Online Integration
 * Publish and sync data with Esri ArcGIS Online
 * Sprint 61-66: Third-Party Integrations
 */

import axios, { AxiosInstance } from 'axios';
import { PrismaClient } from '@prisma/client';
import FormData from 'form-data';

const prisma = new PrismaClient();

// ============================================================================
// Types
// ============================================================================

export interface ArcGISConfig {
  clientId: string;
  clientSecret: string;
  portalUrl?: string; // Default: https://www.arcgis.com
  organizationId?: string;
}

export interface ArcGISToken {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
}

export interface ArcGISFeatureService {
  id: string;
  name: string;
  title: string;
  description?: string;
  url: string;
  type: 'Feature Service';
  owner: string;
  created: number;
  modified: number;
  tags: string[];
}

export interface ArcGISFeatureLayer {
  id: number;
  name: string;
  type: 'Feature Layer';
  geometryType: 'esriGeometryPoint' | 'esriGeometryPolygon' | 'esriGeometryPolyline';
  fields: ArcGISField[];
  extent: ArcGISExtent;
}

export interface ArcGISField {
  name: string;
  type: 'esriFieldTypeString' | 'esriFieldTypeDouble' | 'esriFieldTypeInteger' | 'esriFieldTypeDate' | 'esriFieldTypeOID';
  alias: string;
  length?: number;
  nullable: boolean;
  editable: boolean;
}

export interface ArcGISExtent {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
  spatialReference: { wkid: number };
}

export interface PublishOptions {
  serviceName: string;
  title: string;
  description?: string;
  tags?: string[];
  folder?: string;
  sharing?: 'private' | 'org' | 'public';
}

// ============================================================================
// ArcGIS Online Client
// ============================================================================

export class ArcGISClient {
  private client: AxiosInstance;
  private portalUrl: string;
  private token: string | null = null;
  private tokenExpiry: Date | null = null;

  constructor(private config: ArcGISConfig) {
    this.portalUrl = config.portalUrl || 'https://www.arcgis.com';
    this.client = axios.create({
      timeout: 60000,
    });
  }

  // ==========================================================================
  // Authentication
  // ==========================================================================

  async authenticate(): Promise<ArcGISToken> {
    const response = await axios.post(
      `${this.portalUrl}/sharing/rest/oauth2/token`,
      new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        grant_type: 'client_credentials',
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }
    );

    this.token = response.data.access_token;
    this.tokenExpiry = new Date(Date.now() + response.data.expires_in * 1000 - 60000);

    return response.data;
  }

  private async getToken(): Promise<string> {
    if (!this.token || !this.tokenExpiry || new Date() >= this.tokenExpiry) {
      await this.authenticate();
    }
    return this.token!;
  }

  // ==========================================================================
  // Feature Service Management
  // ==========================================================================

  async createFeatureService(options: PublishOptions): Promise<ArcGISFeatureService> {
    const token = await this.getToken();

    // Create the feature service definition
    const createServiceDef = {
      name: options.serviceName,
      serviceDescription: options.description || '',
      hasStaticData: false,
      maxRecordCount: 2000,
      supportedQueryFormats: 'JSON',
      capabilities: 'Create,Delete,Query,Update,Editing',
      spatialReference: { wkid: 4326 },
      initialExtent: {
        xmin: -180,
        ymin: -90,
        xmax: 180,
        ymax: 90,
        spatialReference: { wkid: 4326 },
      },
      allowGeometryUpdates: true,
      units: 'esriDecimalDegrees',
      xssPreventionInfo: {
        xssPreventionEnabled: true,
        xssPreventionRule: 'InputOnly',
        xssInputRule: 'rejectInvalid',
      },
    };

    const response = await axios.post(
      `${this.portalUrl}/sharing/rest/content/users/${this.config.organizationId}/createService`,
      new URLSearchParams({
        createParameters: JSON.stringify(createServiceDef),
        targetType: 'featureService',
        f: 'json',
        token,
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }
    );

    if (response.data.error) {
      throw new Error(response.data.error.message);
    }

    // Update item with title and tags
    await this.updateItemMetadata(response.data.itemId, {
      title: options.title,
      tags: options.tags?.join(','),
      description: options.description,
    });

    // Set sharing
    if (options.sharing && options.sharing !== 'private') {
      await this.shareItem(response.data.itemId, options.sharing);
    }

    return {
      id: response.data.itemId,
      name: options.serviceName,
      title: options.title,
      description: options.description,
      url: response.data.encodedServiceURL,
      type: 'Feature Service',
      owner: this.config.organizationId || '',
      created: Date.now(),
      modified: Date.now(),
      tags: options.tags || [],
    };
  }

  async addFeatureLayer(
    serviceUrl: string,
    layerDefinition: {
      name: string;
      geometryType: ArcGISFeatureLayer['geometryType'];
      fields: ArcGISField[];
    }
  ): Promise<ArcGISFeatureLayer> {
    const token = await this.getToken();

    const adminUrl = serviceUrl.replace('/rest/services/', '/rest/admin/services/');

    const addLayerDef = {
      layers: [
        {
          name: layerDefinition.name,
          type: 'Feature Layer',
          geometryType: layerDefinition.geometryType,
          extent: {
            xmin: -180,
            ymin: -90,
            xmax: 180,
            ymax: 90,
            spatialReference: { wkid: 4326 },
          },
          fields: layerDefinition.fields,
          indexes: [],
          types: [],
          templates: [],
          supportedQueryFormats: 'JSON',
          hasAttachments: false,
          htmlPopupType: 'esriServerHTMLPopupTypeNone',
          objectIdField: 'OBJECTID',
          globalIdField: 'GlobalID',
          typeIdField: '',
          capabilities: 'Create,Delete,Query,Update,Editing',
        },
      ],
    };

    const response = await axios.post(
      `${adminUrl}/addToDefinition`,
      new URLSearchParams({
        addToDefinition: JSON.stringify(addLayerDef),
        f: 'json',
        token,
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }
    );

    if (response.data.error) {
      throw new Error(response.data.error.message);
    }

    return {
      id: 0, // First layer
      name: layerDefinition.name,
      type: 'Feature Layer',
      geometryType: layerDefinition.geometryType,
      fields: layerDefinition.fields,
      extent: {
        xmin: -180,
        ymin: -90,
        xmax: 180,
        ymax: 90,
        spatialReference: { wkid: 4326 },
      },
    };
  }

  // ==========================================================================
  // Feature Operations
  // ==========================================================================

  async addFeatures(
    featureLayerUrl: string,
    features: Array<{
      geometry: object;
      attributes: Record<string, unknown>;
    }>
  ): Promise<{ addResults: Array<{ objectId: number; success: boolean }> }> {
    const token = await this.getToken();

    const response = await axios.post(
      `${featureLayerUrl}/addFeatures`,
      new URLSearchParams({
        features: JSON.stringify(features),
        f: 'json',
        token,
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }
    );

    if (response.data.error) {
      throw new Error(response.data.error.message);
    }

    return response.data;
  }

  async queryFeatures(
    featureLayerUrl: string,
    where: string = '1=1',
    outFields: string = '*'
  ): Promise<{ features: Array<{ attributes: object; geometry: object }> }> {
    const token = await this.getToken();

    const response = await axios.get(`${featureLayerUrl}/query`, {
      params: {
        where,
        outFields,
        returnGeometry: true,
        f: 'json',
        token,
      },
    });

    return response.data;
  }

  // ==========================================================================
  // Item Management
  // ==========================================================================

  async updateItemMetadata(
    itemId: string,
    metadata: Record<string, string | undefined>
  ): Promise<void> {
    const token = await this.getToken();

    await axios.post(
      `${this.portalUrl}/sharing/rest/content/users/${this.config.organizationId}/items/${itemId}/update`,
      new URLSearchParams({
        ...Object.fromEntries(
          Object.entries(metadata).filter(([_, v]) => v !== undefined)
        ) as Record<string, string>,
        f: 'json',
        token,
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }
    );
  }

  async shareItem(itemId: string, level: 'org' | 'public'): Promise<void> {
    const token = await this.getToken();

    await axios.post(
      `${this.portalUrl}/sharing/rest/content/users/${this.config.organizationId}/items/${itemId}/share`,
      new URLSearchParams({
        everyone: level === 'public' ? 'true' : 'false',
        org: level === 'org' || level === 'public' ? 'true' : 'false',
        f: 'json',
        token,
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }
    );
  }

  async deleteItem(itemId: string): Promise<void> {
    const token = await this.getToken();

    await axios.post(
      `${this.portalUrl}/sharing/rest/content/users/${this.config.organizationId}/items/${itemId}/delete`,
      new URLSearchParams({
        f: 'json',
        token,
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }
    );
  }
}

// ============================================================================
// ArcGIS Integration Service
// ============================================================================

export class ArcGISService {
  private client: ArcGISClient;

  constructor(config: ArcGISConfig) {
    this.client = new ArcGISClient(config);
  }

  // ==========================================================================
  // Publish Trees to ArcGIS Online
  // ==========================================================================

  async publishTreeInventory(
    analysisId: string,
    options: Omit<PublishOptions, 'serviceName'>
  ): Promise<{ serviceUrl: string; itemId: string; featureCount: number }> {
    // Fetch analysis with trees
    const analysis = await prisma.analysis.findUnique({
      where: { id: analysisId },
      include: {
        project: true,
        trees: true,
      },
    });

    if (!analysis) {
      throw new Error(`Analysis ${analysisId} not found`);
    }

    // Create feature service
    const serviceName = `lidar_trees_${analysisId.slice(0, 8)}`;
    const service = await this.client.createFeatureService({
      serviceName,
      title: options.title || `${analysis.project.name} - Tree Inventory`,
      description: options.description,
      tags: options.tags || ['lidar', 'forest', 'trees', 'inventory'],
      sharing: options.sharing,
    });

    // Add trees layer
    await this.client.addFeatureLayer(service.url, {
      name: 'Trees',
      geometryType: 'esriGeometryPoint',
      fields: this.getTreeFields(),
    });

    // Convert trees to ArcGIS features
    const features = analysis.trees.map((tree) => ({
      geometry: {
        x: tree.longitude,
        y: tree.latitude,
        spatialReference: { wkid: 4326 },
      },
      attributes: {
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
        project_id: analysis.project.id,
        project_name: analysis.project.name,
        analysis_id: analysis.id,
        analysis_date: analysis.createdAt.toISOString(),
      },
    }));

    // Add features in batches
    const batchSize = 500;
    for (let i = 0; i < features.length; i += batchSize) {
      const batch = features.slice(i, i + batchSize);
      await this.client.addFeatures(`${service.url}/0`, batch);
    }

    // Save mapping
    await prisma.integrationMapping.create({
      data: {
        provider: 'arcgis',
        localId: analysisId,
        remoteId: service.id,
        entityType: 'analysis',
        metadata: {
          serviceUrl: service.url,
        },
      },
    });

    return {
      serviceUrl: service.url,
      itemId: service.id,
      featureCount: features.length,
    };
  }

  // ==========================================================================
  // Publish Project Boundary
  // ==========================================================================

  async publishProjectBoundary(
    projectId: string,
    options: Omit<PublishOptions, 'serviceName'>
  ): Promise<{ serviceUrl: string; itemId: string }> {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    if (!project.boundaryGeoJSON) {
      throw new Error('Project has no boundary defined');
    }

    // Create feature service
    const serviceName = `lidar_boundary_${projectId.slice(0, 8)}`;
    const service = await this.client.createFeatureService({
      serviceName,
      title: options.title || `${project.name} - Project Boundary`,
      description: options.description,
      tags: options.tags || ['lidar', 'forest', 'boundary'],
      sharing: options.sharing,
    });

    // Add boundary layer
    await this.client.addFeatureLayer(service.url, {
      name: 'Project_Boundary',
      geometryType: 'esriGeometryPolygon',
      fields: [
        { name: 'OBJECTID', type: 'esriFieldTypeOID', alias: 'OBJECTID', nullable: false, editable: false },
        { name: 'project_id', type: 'esriFieldTypeString', alias: 'Project ID', length: 50, nullable: true, editable: true },
        { name: 'project_name', type: 'esriFieldTypeString', alias: 'Project Name', length: 255, nullable: true, editable: true },
        { name: 'area_hectares', type: 'esriFieldTypeDouble', alias: 'Area (ha)', nullable: true, editable: true },
      ],
    });

    // Convert GeoJSON to ArcGIS geometry
    const boundary = project.boundaryGeoJSON as any;
    const rings = boundary.coordinates;

    const feature = {
      geometry: {
        rings,
        spatialReference: { wkid: 4326 },
      },
      attributes: {
        project_id: project.id,
        project_name: project.name,
        area_hectares: project.metadata?.areaHectares || null,
      },
    };

    await this.client.addFeatures(`${service.url}/0`, [feature]);

    return {
      serviceUrl: service.url,
      itemId: service.id,
    };
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  private getTreeFields(): ArcGISField[] {
    return [
      { name: 'OBJECTID', type: 'esriFieldTypeOID', alias: 'OBJECTID', nullable: false, editable: false },
      { name: 'tree_number', type: 'esriFieldTypeInteger', alias: 'Tree Number', nullable: true, editable: true },
      { name: 'species_code', type: 'esriFieldTypeString', alias: 'Species Code', length: 10, nullable: true, editable: true },
      { name: 'species_name', type: 'esriFieldTypeString', alias: 'Species Name', length: 100, nullable: true, editable: true },
      { name: 'dbh_cm', type: 'esriFieldTypeDouble', alias: 'DBH (cm)', nullable: true, editable: true },
      { name: 'height_m', type: 'esriFieldTypeDouble', alias: 'Height (m)', nullable: true, editable: true },
      { name: 'crown_diameter_m', type: 'esriFieldTypeDouble', alias: 'Crown Diameter (m)', nullable: true, editable: true },
      { name: 'crown_class', type: 'esriFieldTypeString', alias: 'Crown Class', length: 20, nullable: true, editable: true },
      { name: 'health_status', type: 'esriFieldTypeString', alias: 'Health Status', length: 20, nullable: true, editable: true },
      { name: 'biomass_kg', type: 'esriFieldTypeDouble', alias: 'Biomass (kg)', nullable: true, editable: true },
      { name: 'carbon_kg', type: 'esriFieldTypeDouble', alias: 'Carbon (kg)', nullable: true, editable: true },
      { name: 'project_id', type: 'esriFieldTypeString', alias: 'Project ID', length: 50, nullable: true, editable: true },
      { name: 'project_name', type: 'esriFieldTypeString', alias: 'Project Name', length: 255, nullable: true, editable: true },
      { name: 'analysis_id', type: 'esriFieldTypeString', alias: 'Analysis ID', length: 50, nullable: true, editable: true },
      { name: 'analysis_date', type: 'esriFieldTypeDate', alias: 'Analysis Date', nullable: true, editable: true },
    ];
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createArcGISService(config: ArcGISConfig): ArcGISService {
  return new ArcGISService(config);
}
