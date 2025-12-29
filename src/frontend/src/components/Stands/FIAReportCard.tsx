/**
 * FIAReportCard Component
 * Sprint 21-24: FIA Reports & Export
 *
 * Displays FIA-compliant report data.
 */

import type { FIAReport } from './types';

interface FIAReportCardProps {
  report: FIAReport;
  onExport?: () => void;
}

export function FIAReportCard({ report, onExport }: FIAReportCardProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="bg-green-50 border-b border-green-100 p-4">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">FIA Report</h2>
            <p className="text-sm text-gray-600">
              Plot {report.plot_id} | State {report.state_code}, County {report.county_code}
            </p>
          </div>
          {onExport && (
            <button
              onClick={onExport}
              className="px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700"
            >
              Export Report
            </button>
          )}
        </div>
      </div>

      {/* Plot Summary */}
      <div className="p-4 border-b border-gray-100">
        <h3 className="text-sm font-medium text-gray-700 mb-3">Plot Summary</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div>
            <span className="text-xs text-gray-500">Plot Area</span>
            <p className="text-lg font-semibold">{report.plot_area_acres} ac</p>
          </div>
          <div>
            <span className="text-xs text-gray-500">Total Trees</span>
            <p className="text-lg font-semibold">{report.total_trees}</p>
          </div>
          <div>
            <span className="text-xs text-gray-500">Trees/Acre</span>
            <p className="text-lg font-semibold">{report.trees_per_acre.toFixed(0)}</p>
          </div>
          <div>
            <span className="text-xs text-gray-500">Basal Area</span>
            <p className="text-lg font-semibold">{report.basal_area_sqft_ac.toFixed(1)} ft²/ac</p>
          </div>
          <div>
            <span className="text-xs text-gray-500">Volume</span>
            <p className="text-lg font-semibold">{report.volume_cuft_ac.toFixed(0)} ft³/ac</p>
          </div>
        </div>
      </div>

      {/* Species Summary Table */}
      <div className="p-4 border-b border-gray-100">
        <h3 className="text-sm font-medium text-gray-700 mb-3">Species Summary</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 px-2 font-medium text-gray-600">FIA Code</th>
                <th className="text-left py-2 px-2 font-medium text-gray-600">Species</th>
                <th className="text-right py-2 px-2 font-medium text-gray-600">Trees</th>
                <th className="text-right py-2 px-2 font-medium text-gray-600">BA (ft²/ac)</th>
                <th className="text-right py-2 px-2 font-medium text-gray-600">Vol (ft³/ac)</th>
                <th className="text-right py-2 px-2 font-medium text-gray-600">Mean DBH</th>
                <th className="text-right py-2 px-2 font-medium text-gray-600">Mean Ht</th>
              </tr>
            </thead>
            <tbody>
              {report.species_summary.map((sp) => (
                <tr key={sp.fia_species_code} className="border-b border-gray-100">
                  <td className="py-2 px-2 font-mono">{sp.fia_species_code}</td>
                  <td className="py-2 px-2">{sp.species_common}</td>
                  <td className="py-2 px-2 text-right">{sp.tree_count}</td>
                  <td className="py-2 px-2 text-right">{sp.basal_area_sqft_ac.toFixed(1)}</td>
                  <td className="py-2 px-2 text-right">{sp.volume_cuft_ac.toFixed(0)}</td>
                  <td className="py-2 px-2 text-right">{sp.mean_dbh_inches.toFixed(1)}"</td>
                  <td className="py-2 px-2 text-right">{sp.mean_height_feet.toFixed(0)}'</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Size Class Distribution */}
      <div className="p-4">
        <h3 className="text-sm font-medium text-gray-700 mb-3">Size Class Distribution</h3>
        <div className="flex items-end gap-2 h-32">
          {Object.entries(report.size_class_distribution).map(([sizeClass, count]) => {
            const maxCount = Math.max(...Object.values(report.size_class_distribution));
            const height = maxCount > 0 ? (count / maxCount) * 100 : 0;
            return (
              <div key={sizeClass} className="flex-1 flex flex-col items-center">
                <div
                  className="w-full bg-green-500 rounded-t"
                  style={{ height: `${height}%`, minHeight: count > 0 ? '4px' : '0' }}
                />
                <span className="text-xs text-gray-500 mt-1 truncate w-full text-center">
                  {sizeClass}
                </span>
                <span className="text-xs font-medium">{count}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="bg-gray-50 px-4 py-2 text-xs text-gray-500">
        Generated: {new Date(report.generated_at).toLocaleString()} |
        Processing time: {report.processing_time_ms.toFixed(0)}ms
      </div>
    </div>
  );
}

export default FIAReportCard;
