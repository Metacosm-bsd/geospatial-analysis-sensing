/**
 * StandList Component
 * Sprint 21-24: FIA Reports & Export
 *
 * Displays a list of delineated stands with summary information.
 */

import { useState } from 'react';
import type { Stand, DelineationResult, ExportFormat } from './types';
import { StandCard } from './StandCard';

interface StandListProps {
  result: DelineationResult;
  onExport?: (format: ExportFormat, stands: Stand[]) => void;
  onStandSelect?: (stand: Stand) => void;
}

export function StandList({ result, onExport, onStandSelect }: StandListProps) {
  const [selectedStands, setSelectedStands] = useState<Set<string>>(new Set());
  const [exportFormat, setExportFormat] = useState<ExportFormat>('geojson');

  const handleStandSelect = (standId: string) => {
    setSelectedStands((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(standId)) {
        newSet.delete(standId);
      } else {
        newSet.add(standId);
      }
      return newSet;
    });

    const stand = result.stands.find((s) => s.stand_id === standId);
    if (stand && onStandSelect) {
      onStandSelect(stand);
    }
  };

  const handleSelectAll = () => {
    if (selectedStands.size === result.stands.length) {
      setSelectedStands(new Set());
    } else {
      setSelectedStands(new Set(result.stands.map((s) => s.stand_id)));
    }
  };

  const handleExport = () => {
    if (onExport) {
      const standsToExport =
        selectedStands.size > 0
          ? result.stands.filter((s) => selectedStands.has(s.stand_id))
          : result.stands;
      onExport(exportFormat, standsToExport);
    }
  };

  // Calculate totals
  const totals = result.stands.reduce(
    (acc, stand) => ({
      trees: acc.trees + stand.tree_count,
      area: acc.area + stand.area_hectares,
      volume: acc.volume + stand.summary.volume_m3_ha * stand.area_hectares,
      carbon: acc.carbon + stand.summary.carbon_kg_ha * stand.area_hectares,
    }),
    { trees: 0, area: 0, volume: 0, carbon: 0 }
  );

  return (
    <div className="space-y-4">
      {/* Summary Header */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Stand Delineation Results</h2>
            <p className="text-sm text-gray-500">
              Method: {result.method} | Processed in {result.processing_time_ms.toFixed(0)}ms
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value as ExportFormat)}
              className="rounded border-gray-300 text-sm"
            >
              <option value="geojson">GeoJSON</option>
              <option value="shapefile">Shapefile</option>
              <option value="kml">KML</option>
              <option value="csv">CSV</option>
            </select>
            <button
              onClick={handleExport}
              className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
            >
              Export {selectedStands.size > 0 ? `(${selectedStands.size})` : 'All'}
            </button>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-5 gap-4">
          <div className="text-center p-3 bg-gray-50 rounded">
            <p className="text-2xl font-bold text-gray-900">{result.total_stands}</p>
            <p className="text-sm text-gray-500">Stands</p>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded">
            <p className="text-2xl font-bold text-gray-900">{result.total_trees.toLocaleString()}</p>
            <p className="text-sm text-gray-500">Trees</p>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded">
            <p className="text-2xl font-bold text-gray-900">{totals.area.toFixed(1)}</p>
            <p className="text-sm text-gray-500">Hectares</p>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded">
            <p className="text-2xl font-bold text-gray-900">{totals.volume.toFixed(0)}</p>
            <p className="text-sm text-gray-500">Volume (m³)</p>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded">
            <p className="text-2xl font-bold text-gray-900">{(totals.carbon / 1000).toFixed(1)}</p>
            <p className="text-sm text-gray-500">Carbon (t)</p>
          </div>
        </div>

        {result.unassigned_trees > 0 && (
          <p className="text-sm text-amber-600 mt-2">
            Note: {result.unassigned_trees} trees could not be assigned to a stand
          </p>
        )}
      </div>

      {/* Selection Controls */}
      <div className="flex items-center justify-between">
        <button
          onClick={handleSelectAll}
          className="text-sm text-blue-600 hover:text-blue-700"
        >
          {selectedStands.size === result.stands.length ? 'Deselect All' : 'Select All'}
        </button>
        <span className="text-sm text-gray-500">
          {selectedStands.size} of {result.stands.length} selected
        </span>
      </div>

      {/* Stand Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {result.stands.map((stand) => (
          <StandCard
            key={stand.stand_id}
            stand={stand}
            selected={selectedStands.has(stand.stand_id)}
            onSelect={handleStandSelect}
          />
        ))}
      </div>
    </div>
  );
}

export default StandList;
