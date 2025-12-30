/**
 * SQLite Database Service
 * Offline-first local data storage
 * Sprint 55-60: Mobile Field App
 */

import SQLite, {
  SQLiteDatabase,
  Transaction,
  ResultSet,
} from 'react-native-sqlite-storage';
import uuid from 'react-native-uuid';
import type {
  TreeMeasurement,
  SamplePlot,
  FieldProject,
  QueuedOperation,
  SyncStatus,
} from '../types';

// Enable promises
SQLite.enablePromise(true);

let db: SQLiteDatabase | null = null;

// ============================================================================
// Database Initialization
// ============================================================================

export async function initDatabase(): Promise<void> {
  try {
    db = await SQLite.openDatabase({
      name: 'lidar_forest.db',
      location: 'default',
    });

    await createTables();
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Failed to initialize database:', error);
    throw error;
  }
}

async function createTables(): Promise<void> {
  if (!db) throw new Error('Database not initialized');

  const queries = [
    // Projects table
    `CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      local_id TEXT NOT NULL UNIQUE,
      remote_id TEXT,
      name TEXT NOT NULL,
      description TEXT,
      organization_id TEXT NOT NULL,
      boundary_geojson TEXT,
      target_tree_count INTEGER,
      assigned_crew_ids TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      start_date TEXT NOT NULL,
      end_date TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      last_synced_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,

    // Sample plots table
    `CREATE TABLE IF NOT EXISTS sample_plots (
      id TEXT PRIMARY KEY,
      local_id TEXT NOT NULL UNIQUE,
      remote_id TEXT,
      project_id TEXT NOT NULL,
      plot_number TEXT NOT NULL,
      center_latitude REAL NOT NULL,
      center_longitude REAL NOT NULL,
      center_altitude REAL,
      center_accuracy REAL,
      radius REAL NOT NULL,
      shape TEXT NOT NULL DEFAULT 'circular',
      width REAL,
      length REAL,
      orientation REAL,
      slope REAL,
      aspect REAL,
      elevation REAL,
      stand_type TEXT,
      age_class TEXT,
      site_index REAL,
      status TEXT NOT NULL DEFAULT 'not_started',
      measured_by TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      notes TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      last_synced_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id)
    )`,

    // Tree measurements table
    `CREATE TABLE IF NOT EXISTS tree_measurements (
      id TEXT PRIMARY KEY,
      local_id TEXT NOT NULL UNIQUE,
      remote_id TEXT,
      project_id TEXT NOT NULL,
      plot_id TEXT,
      tree_number INTEGER NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      altitude REAL,
      accuracy REAL NOT NULL,
      location_timestamp TEXT NOT NULL,
      location_notes TEXT,
      dbh REAL NOT NULL,
      height REAL,
      crown_diameter REAL,
      merchantable_height REAL,
      species_code TEXT,
      species_common_name TEXT,
      species_scientific_name TEXT,
      health_status TEXT NOT NULL DEFAULT 'unknown',
      crown_class TEXT NOT NULL DEFAULT 'unknown',
      defects TEXT,
      notes TEXT,
      measured_by TEXT NOT NULL,
      verified_by TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      last_synced_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id),
      FOREIGN KEY (plot_id) REFERENCES sample_plots(id)
    )`,

    // Tree photos table
    `CREATE TABLE IF NOT EXISTS tree_photos (
      id TEXT PRIMARY KEY,
      tree_id TEXT NOT NULL,
      local_uri TEXT NOT NULL,
      remote_uri TEXT,
      type TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      FOREIGN KEY (tree_id) REFERENCES tree_measurements(id)
    )`,

    // Sync queue table
    `CREATE TABLE IF NOT EXISTS sync_queue (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      payload TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 5,
      last_attempt_at TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL
    )`,

    // Species reference table (cached from server)
    `CREATE TABLE IF NOT EXISTS species_reference (
      code TEXT PRIMARY KEY,
      common_name TEXT NOT NULL,
      scientific_name TEXT NOT NULL,
      genus TEXT NOT NULL,
      family TEXT NOT NULL,
      wood_density REAL,
      carbon_fraction REAL,
      is_common INTEGER NOT NULL DEFAULT 0
    )`,

    // Create indexes
    `CREATE INDEX IF NOT EXISTS idx_trees_project ON tree_measurements(project_id)`,
    `CREATE INDEX IF NOT EXISTS idx_trees_plot ON tree_measurements(plot_id)`,
    `CREATE INDEX IF NOT EXISTS idx_trees_sync ON tree_measurements(sync_status)`,
    `CREATE INDEX IF NOT EXISTS idx_plots_project ON sample_plots(project_id)`,
    `CREATE INDEX IF NOT EXISTS idx_plots_sync ON sample_plots(sync_status)`,
    `CREATE INDEX IF NOT EXISTS idx_photos_tree ON tree_photos(tree_id)`,
    `CREATE INDEX IF NOT EXISTS idx_queue_entity ON sync_queue(entity_type, entity_id)`,
  ];

  for (const query of queries) {
    await db.executeSql(query);
  }
}

export function getDatabase(): SQLiteDatabase {
  if (!db) throw new Error('Database not initialized');
  return db;
}

// ============================================================================
// Tree Measurement CRUD
// ============================================================================

export async function createTreeMeasurement(
  tree: Omit<TreeMeasurement, 'id' | 'localId' | 'syncStatus' | 'createdAt' | 'updatedAt'>
): Promise<TreeMeasurement> {
  if (!db) throw new Error('Database not initialized');

  const id = uuid.v4() as string;
  const now = new Date().toISOString();

  const newTree: TreeMeasurement = {
    ...tree,
    id,
    localId: id,
    syncStatus: 'pending',
    createdAt: now,
    updatedAt: now,
  };

  await db.executeSql(
    `INSERT INTO tree_measurements (
      id, local_id, project_id, plot_id, tree_number,
      latitude, longitude, altitude, accuracy, location_timestamp, location_notes,
      dbh, height, crown_diameter, merchantable_height,
      species_code, species_common_name, species_scientific_name,
      health_status, crown_class, defects, notes,
      measured_by, verified_by, sync_status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      newTree.id,
      newTree.localId,
      newTree.projectId,
      newTree.plotId || null,
      newTree.treeNumber,
      newTree.location.latitude,
      newTree.location.longitude,
      newTree.location.altitude || null,
      newTree.location.accuracy,
      newTree.location.timestamp,
      newTree.locationNotes || null,
      newTree.dbh,
      newTree.height || null,
      newTree.crownDiameter || null,
      newTree.merchantableHeight || null,
      newTree.speciesCode || null,
      newTree.speciesCommonName || null,
      newTree.speciesScientificName || null,
      newTree.healthStatus,
      newTree.crownClass,
      JSON.stringify(newTree.defects),
      newTree.notes || null,
      newTree.measuredBy,
      newTree.verifiedBy || null,
      newTree.syncStatus,
      newTree.createdAt,
      newTree.updatedAt,
    ]
  );

  // Add to sync queue
  await addToSyncQueue('tree', newTree.id, 'create', newTree);

  return newTree;
}

export async function getTreeMeasurement(id: string): Promise<TreeMeasurement | null> {
  if (!db) throw new Error('Database not initialized');

  const [results] = await db.executeSql(
    'SELECT * FROM tree_measurements WHERE id = ?',
    [id]
  );

  if (results.rows.length === 0) return null;

  const row = results.rows.item(0);
  return rowToTree(row);
}

export async function getTreesByProject(projectId: string): Promise<TreeMeasurement[]> {
  if (!db) throw new Error('Database not initialized');

  const [results] = await db.executeSql(
    'SELECT * FROM tree_measurements WHERE project_id = ? ORDER BY tree_number',
    [projectId]
  );

  const trees: TreeMeasurement[] = [];
  for (let i = 0; i < results.rows.length; i++) {
    trees.push(rowToTree(results.rows.item(i)));
  }

  return trees;
}

export async function getTreesByPlot(plotId: string): Promise<TreeMeasurement[]> {
  if (!db) throw new Error('Database not initialized');

  const [results] = await db.executeSql(
    'SELECT * FROM tree_measurements WHERE plot_id = ? ORDER BY tree_number',
    [plotId]
  );

  const trees: TreeMeasurement[] = [];
  for (let i = 0; i < results.rows.length; i++) {
    trees.push(rowToTree(results.rows.item(i)));
  }

  return trees;
}

export async function updateTreeMeasurement(
  id: string,
  updates: Partial<TreeMeasurement>
): Promise<TreeMeasurement> {
  if (!db) throw new Error('Database not initialized');

  const existing = await getTreeMeasurement(id);
  if (!existing) throw new Error(`Tree ${id} not found`);

  const now = new Date().toISOString();
  const updated = {
    ...existing,
    ...updates,
    updatedAt: now,
    syncStatus: 'pending' as SyncStatus,
  };

  await db.executeSql(
    `UPDATE tree_measurements SET
      dbh = ?, height = ?, crown_diameter = ?, merchantable_height = ?,
      species_code = ?, species_common_name = ?, species_scientific_name = ?,
      health_status = ?, crown_class = ?, defects = ?, notes = ?,
      verified_by = ?, sync_status = ?, updated_at = ?
    WHERE id = ?`,
    [
      updated.dbh,
      updated.height || null,
      updated.crownDiameter || null,
      updated.merchantableHeight || null,
      updated.speciesCode || null,
      updated.speciesCommonName || null,
      updated.speciesScientificName || null,
      updated.healthStatus,
      updated.crownClass,
      JSON.stringify(updated.defects),
      updated.notes || null,
      updated.verifiedBy || null,
      updated.syncStatus,
      updated.updatedAt,
      id,
    ]
  );

  // Add to sync queue
  await addToSyncQueue('tree', id, 'update', updated);

  return updated;
}

export async function deleteTreeMeasurement(id: string): Promise<void> {
  if (!db) throw new Error('Database not initialized');

  // Delete associated photos first
  await db.executeSql('DELETE FROM tree_photos WHERE tree_id = ?', [id]);

  // Delete tree
  await db.executeSql('DELETE FROM tree_measurements WHERE id = ?', [id]);

  // Add to sync queue if it had a remote ID
  const tree = await getTreeMeasurement(id);
  if (tree?.remoteId) {
    await addToSyncQueue('tree', id, 'delete', { remoteId: tree.remoteId });
  }
}

function rowToTree(row: Record<string, unknown>): TreeMeasurement {
  return {
    id: row.id as string,
    localId: row.local_id as string,
    remoteId: row.remote_id as string | undefined,
    projectId: row.project_id as string,
    plotId: row.plot_id as string | undefined,
    treeNumber: row.tree_number as number,
    location: {
      latitude: row.latitude as number,
      longitude: row.longitude as number,
      altitude: row.altitude as number | undefined,
      accuracy: row.accuracy as number,
      timestamp: row.location_timestamp as string,
    },
    locationNotes: row.location_notes as string | undefined,
    dbh: row.dbh as number,
    height: row.height as number | undefined,
    crownDiameter: row.crown_diameter as number | undefined,
    merchantableHeight: row.merchantable_height as number | undefined,
    speciesCode: row.species_code as string | undefined,
    speciesCommonName: row.species_common_name as string | undefined,
    speciesScientificName: row.species_scientific_name as string | undefined,
    healthStatus: row.health_status as TreeMeasurement['healthStatus'],
    crownClass: row.crown_class as TreeMeasurement['crownClass'],
    defects: JSON.parse((row.defects as string) || '[]'),
    photos: [], // Loaded separately
    notes: row.notes as string | undefined,
    measuredBy: row.measured_by as string,
    verifiedBy: row.verified_by as string | undefined,
    syncStatus: row.sync_status as SyncStatus,
    lastSyncedAt: row.last_synced_at as string | undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

// ============================================================================
// Sample Plot CRUD
// ============================================================================

export async function createSamplePlot(
  plot: Omit<SamplePlot, 'id' | 'localId' | 'syncStatus' | 'createdAt' | 'updatedAt'>
): Promise<SamplePlot> {
  if (!db) throw new Error('Database not initialized');

  const id = uuid.v4() as string;
  const now = new Date().toISOString();

  const newPlot: SamplePlot = {
    ...plot,
    id,
    localId: id,
    syncStatus: 'pending',
    createdAt: now,
    updatedAt: now,
  };

  await db.executeSql(
    `INSERT INTO sample_plots (
      id, local_id, project_id, plot_number,
      center_latitude, center_longitude, center_altitude, center_accuracy,
      radius, shape, width, length, orientation,
      slope, aspect, elevation, stand_type, age_class, site_index,
      status, measured_by, started_at, completed_at, notes,
      sync_status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      newPlot.id,
      newPlot.localId,
      newPlot.projectId,
      newPlot.plotNumber,
      newPlot.centerPoint.latitude,
      newPlot.centerPoint.longitude,
      newPlot.centerPoint.altitude || null,
      newPlot.centerPoint.accuracy,
      newPlot.radius,
      newPlot.shape,
      newPlot.width || null,
      newPlot.length || null,
      newPlot.orientation || null,
      newPlot.slope || null,
      newPlot.aspect || null,
      newPlot.elevation || null,
      newPlot.standType || null,
      newPlot.ageClass || null,
      newPlot.siteIndex || null,
      newPlot.status,
      newPlot.measuredBy,
      newPlot.startedAt || null,
      newPlot.completedAt || null,
      newPlot.notes || null,
      newPlot.syncStatus,
      newPlot.createdAt,
      newPlot.updatedAt,
    ]
  );

  // Add to sync queue
  await addToSyncQueue('plot', newPlot.id, 'create', newPlot);

  return newPlot;
}

export async function getPlotsByProject(projectId: string): Promise<SamplePlot[]> {
  if (!db) throw new Error('Database not initialized');

  const [results] = await db.executeSql(
    'SELECT * FROM sample_plots WHERE project_id = ? ORDER BY plot_number',
    [projectId]
  );

  const plots: SamplePlot[] = [];
  for (let i = 0; i < results.rows.length; i++) {
    plots.push(rowToPlot(results.rows.item(i)));
  }

  return plots;
}

function rowToPlot(row: Record<string, unknown>): SamplePlot {
  return {
    id: row.id as string,
    localId: row.local_id as string,
    remoteId: row.remote_id as string | undefined,
    projectId: row.project_id as string,
    plotNumber: row.plot_number as string,
    centerPoint: {
      latitude: row.center_latitude as number,
      longitude: row.center_longitude as number,
      altitude: row.center_altitude as number | undefined,
      accuracy: row.center_accuracy as number,
      timestamp: row.created_at as string,
    },
    radius: row.radius as number,
    shape: row.shape as SamplePlot['shape'],
    width: row.width as number | undefined,
    length: row.length as number | undefined,
    orientation: row.orientation as number | undefined,
    slope: row.slope as number | undefined,
    aspect: row.aspect as number | undefined,
    elevation: row.elevation as number | undefined,
    standType: row.stand_type as string | undefined,
    ageClass: row.age_class as string | undefined,
    siteIndex: row.site_index as number | undefined,
    status: row.status as SamplePlot['status'],
    measuredBy: row.measured_by as string,
    startedAt: row.started_at as string | undefined,
    completedAt: row.completed_at as string | undefined,
    notes: row.notes as string | undefined,
    syncStatus: row.sync_status as SyncStatus,
    lastSyncedAt: row.last_synced_at as string | undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

// ============================================================================
// Sync Queue Operations
// ============================================================================

export async function addToSyncQueue(
  entityType: QueuedOperation['entityType'],
  entityId: string,
  operation: QueuedOperation['operation'],
  payload: Record<string, unknown>
): Promise<void> {
  if (!db) throw new Error('Database not initialized');

  const id = uuid.v4() as string;
  const now = new Date().toISOString();

  await db.executeSql(
    `INSERT OR REPLACE INTO sync_queue (
      id, entity_type, entity_id, operation, payload, attempts, max_attempts, created_at
    ) VALUES (?, ?, ?, ?, ?, 0, 5, ?)`,
    [id, entityType, entityId, operation, JSON.stringify(payload), now]
  );
}

export async function getPendingSyncOperations(): Promise<QueuedOperation[]> {
  if (!db) throw new Error('Database not initialized');

  const [results] = await db.executeSql(
    'SELECT * FROM sync_queue WHERE attempts < max_attempts ORDER BY created_at ASC'
  );

  const operations: QueuedOperation[] = [];
  for (let i = 0; i < results.rows.length; i++) {
    const row = results.rows.item(i);
    operations.push({
      id: row.id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      operation: row.operation,
      payload: JSON.parse(row.payload),
      attempts: row.attempts,
      maxAttempts: row.max_attempts,
      lastAttemptAt: row.last_attempt_at,
      errorMessage: row.error_message,
      createdAt: row.created_at,
    });
  }

  return operations;
}

export async function markSyncAttempt(
  id: string,
  success: boolean,
  errorMessage?: string
): Promise<void> {
  if (!db) throw new Error('Database not initialized');

  if (success) {
    // Remove from queue on success
    await db.executeSql('DELETE FROM sync_queue WHERE id = ?', [id]);
  } else {
    // Increment attempts on failure
    const now = new Date().toISOString();
    await db.executeSql(
      'UPDATE sync_queue SET attempts = attempts + 1, last_attempt_at = ?, error_message = ? WHERE id = ?',
      [now, errorMessage || null, id]
    );
  }
}

export async function getPendingCount(): Promise<number> {
  if (!db) throw new Error('Database not initialized');

  const [results] = await db.executeSql(
    'SELECT COUNT(*) as count FROM sync_queue WHERE attempts < max_attempts'
  );

  return results.rows.item(0).count;
}

// ============================================================================
// Utility Functions
// ============================================================================

export async function clearAllData(): Promise<void> {
  if (!db) throw new Error('Database not initialized');

  await db.executeSql('DELETE FROM sync_queue');
  await db.executeSql('DELETE FROM tree_photos');
  await db.executeSql('DELETE FROM tree_measurements');
  await db.executeSql('DELETE FROM sample_plots');
  await db.executeSql('DELETE FROM projects');
}

export async function closeDatabase(): Promise<void> {
  if (db) {
    await db.close();
    db = null;
  }
}
