import { useState, type FormEvent } from 'react';
import { useProjectStore } from '../store/projectStore';

interface CreateProjectModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

interface FormErrors {
  name?: string | undefined;
  description?: string | undefined;
}

function CreateProjectModal({ onClose, onSuccess }: CreateProjectModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [formErrors, setFormErrors] = useState<FormErrors>({});

  const { createProject, isCreating, projectsError, clearErrors } = useProjectStore();

  const validateForm = (): boolean => {
    const errors: FormErrors = {};

    if (!name.trim()) {
      errors.name = 'Project name is required';
    } else if (name.trim().length < 2) {
      errors.name = 'Project name must be at least 2 characters';
    } else if (name.trim().length > 100) {
      errors.name = 'Project name must be less than 100 characters';
    }

    if (description && description.length > 500) {
      errors.description = 'Description must be less than 500 characters';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    clearErrors();

    if (!validateForm()) {
      return;
    }

    try {
      await createProject({
        name: name.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
      });
      onSuccess();
    } catch {
      // Error is handled in the store
    }
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={handleBackdropClick}
    >
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Create New Project</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* API Error */}
          {projectsError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex items-start">
              <svg
                className="w-5 h-5 mr-2 flex-shrink-0 mt-0.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span>{projectsError}</span>
            </div>
          )}

          {/* Project Name */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700">
              Project Name <span className="text-red-500">*</span>
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (formErrors.name) {
                  setFormErrors((prev) => ({ ...prev, name: undefined }));
                }
              }}
              className={`mt-1 block w-full px-4 py-3 border rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-transparent transition-colors ${
                formErrors.name ? 'border-red-300 bg-red-50' : 'border-gray-300'
              }`}
              placeholder="e.g., Northern Forest Inventory 2024"
              autoFocus
            />
            {formErrors.name && (
              <p className="mt-1 text-sm text-red-600">{formErrors.name}</p>
            )}
          </div>

          {/* Description */}
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700">
              Description <span className="text-gray-400">(optional)</span>
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                if (formErrors.description) {
                  setFormErrors((prev) => ({ ...prev, description: undefined }));
                }
              }}
              rows={4}
              className={`mt-1 block w-full px-4 py-3 border rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-transparent transition-colors resize-none ${
                formErrors.description ? 'border-red-300 bg-red-50' : 'border-gray-300'
              }`}
              placeholder="Brief description of the project area, objectives, or methodology..."
            />
            <div className="mt-1 flex justify-between text-xs text-gray-400">
              <span>{formErrors.description || ''}</span>
              <span>{description.length}/500</span>
            </div>
          </div>

          {/* Info */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex">
              <svg
                className="w-5 h-5 text-blue-500 mr-3 mt-0.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div className="text-sm text-blue-700">
                <p className="font-medium">What happens next?</p>
                <p className="mt-1">
                  After creating the project, you'll be able to upload LiDAR files
                  (LAS/LAZ), GeoTIFFs, and shapefiles for analysis.
                </p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end space-x-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isCreating}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-forest-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isCreating}
              className="px-4 py-2 text-sm font-medium text-white bg-forest-600 border border-transparent rounded-lg hover:bg-forest-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-forest-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isCreating ? (
                <div className="flex items-center">
                  <svg
                    className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Creating...
                </div>
              ) : (
                'Create Project'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CreateProjectModal;
