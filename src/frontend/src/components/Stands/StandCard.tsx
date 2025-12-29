/**
 * StandCard Component
 * Sprint 21-24: FIA Reports & Export
 *
 * Displays stand summary information in a card format.
 */

import type { Stand } from './types';

interface StandCardProps {
  stand: Stand;
  selected?: boolean;
  onSelect?: (standId: string) => void;
}

export function StandCard({ stand, selected = false, onSelect }: StandCardProps) {
  const { summary } = stand;

  const handleClick = () => {
    if (onSelect) {
      onSelect(stand.stand_id);
    }
  };

  return (
    <div
      className={`rounded-lg border p-4 cursor-pointer transition-colors ${
        selected
          ? 'border-blue-500 bg-blue-50'
          : 'border-gray-200 bg-white hover:border-gray-300'
      }`}
      onClick={handleClick}
    >
      <div className="flex justify-between items-start mb-3">
        <h3 className="text-lg font-semibold text-gray-900">{stand.stand_id}</h3>
        <span className="text-sm px-2 py-1 rounded bg-gray-100 text-gray-600">
          {summary.stand_type}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <span className="text-gray-500">Trees</span>
          <p className="font-medium">{stand.tree_count.toLocaleString()}</p>
        </div>
        <div>
          <span className="text-gray-500">Area</span>
          <p className="font-medium">{stand.area_hectares.toFixed(2)} ha</p>
        </div>
        <div>
          <span className="text-gray-500">Stems/ha</span>
          <p className="font-medium">{summary.stems_per_hectare.toFixed(0)}</p>
        </div>
        <div>
          <span className="text-gray-500">Basal Area</span>
          <p className="font-medium">{summary.basal_area_m2_ha.toFixed(1)} m²/ha</p>
        </div>
        <div>
          <span className="text-gray-500">Volume</span>
          <p className="font-medium">{summary.volume_m3_ha.toFixed(1)} m³/ha</p>
        </div>
        <div>
          <span className="text-gray-500">Carbon</span>
          <p className="font-medium">{(summary.carbon_kg_ha / 1000).toFixed(1)} t/ha</p>
        </div>
        <div>
          <span className="text-gray-500">Mean Height</span>
          <p className="font-medium">{summary.mean_height_m.toFixed(1)} m</p>
        </div>
        <div>
          <span className="text-gray-500">QMD</span>
          <p className="font-medium">{summary.qmd_cm.toFixed(1)} cm</p>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-gray-100">
        <div className="flex justify-between items-center">
          <div>
            <span className="text-gray-500 text-sm">Dominant Species</span>
            <p className="font-medium text-sm">{summary.dominant_species || 'Unknown'}</p>
          </div>
          <div className="text-right">
            <span className="text-gray-500 text-sm">SDI</span>
            <p className="font-medium text-sm">{summary.sdi.toFixed(0)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default StandCard;
