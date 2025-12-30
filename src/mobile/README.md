# LiDAR Forest Field App

React Native mobile application for field data collection in the LiDAR Forest Analysis Platform.

## Features

- **Offline-First Architecture** - All data stored locally and synced when online
- **GPS Tree Location** - High-accuracy GPS positioning with averaging for tree locations
- **Field Measurements** - DBH, height, crown diameter, species, health status
- **Photo Capture** - Multi-photo support with type classification (trunk, crown, defect)
- **Sample Plot Management** - Create and manage circular/rectangular sample plots
- **Field Crew Management** - View and manage field crew assignments
- **Map Navigation** - Interactive map with tree markers and plot boundaries
- **Background Sync** - Automatic synchronization with the web platform

## Project Structure

```
src/mobile/
├── App.tsx                    # Main application entry
├── package.json               # Dependencies
├── tsconfig.json              # TypeScript configuration
└── src/
    ├── components/            # Reusable UI components
    ├── hooks/                 # Custom React hooks
    ├── navigation/
    │   └── AppNavigator.tsx   # Navigation structure
    ├── screens/
    │   ├── LoginScreen.tsx
    │   ├── ProjectsScreen.tsx
    │   ├── ProjectDetailScreen.tsx
    │   ├── TreesScreen.tsx
    │   ├── TreeMeasurementScreen.tsx
    │   ├── PlotDetailScreen.tsx
    │   ├── MapScreen.tsx
    │   ├── PhotoCaptureScreen.tsx
    │   ├── CrewScreen.tsx
    │   ├── ProfileScreen.tsx
    │   ├── SettingsScreen.tsx
    │   └── SyncScreen.tsx
    ├── services/
    │   ├── api.ts             # REST API client
    │   ├── database.ts        # SQLite local storage
    │   ├── location.ts        # GPS services
    │   └── sync.ts            # Background sync service
    ├── store/
    │   └── appStore.ts        # Zustand state management
    ├── types/
    │   └── index.ts           # TypeScript type definitions
    └── utils/                 # Utility functions
```

## Dependencies

### Core
- **React Native 0.73** - Mobile framework
- **TypeScript** - Type safety
- **React Navigation** - Screen navigation
- **Zustand** - State management
- **TanStack Query** - Server state management

### Storage & Data
- **react-native-sqlite-storage** - Local SQLite database
- **@react-native-async-storage/async-storage** - Key-value storage

### Location & Maps
- **@react-native-community/geolocation** - GPS positioning
- **react-native-maps** - Map display

### Media
- **react-native-camera** - Photo capture
- **react-native-image-picker** - Image selection
- **react-native-fs** - File system access

### Networking
- **@react-native-community/netinfo** - Network status

## Installation

### Prerequisites

- Node.js 18+
- React Native CLI
- Xcode (for iOS)
- Android Studio (for Android)

### Setup

```bash
# Install dependencies
cd src/mobile
npm install

# Install iOS pods
cd ios && pod install && cd ..

# Start Metro bundler
npm start

# Run on iOS
npm run ios

# Run on Android
npm run android
```

## Configuration

### Environment Variables

Create a `.env` file:

```env
API_BASE_URL=https://api.lidarforest.com
# For development:
# API_BASE_URL=http://localhost:4000
```

### GPS Settings

GPS configuration can be adjusted in Settings:
- **High Accuracy** - Use GPS for best accuracy (more battery)
- **Timeout** - Maximum time to wait for GPS fix
- **WiFi Only Sync** - Only sync on WiFi connections

## Data Flow

### Offline-First Architecture

1. **User Input** → Local SQLite Database
2. **Sync Queue** → Pending operations tracked
3. **Network Available** → Push changes to server
4. **Server Response** → Update local records with remote IDs

### Sync Process

```
┌─────────────────┐
│  User Measures  │
│     Tree        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Save Locally   │
│  (SQLite)       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Add to Sync    │
│    Queue        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│  Background     │────▶│  Push to API    │
│  Sync Service   │     │  When Online    │
└─────────────────┘     └────────┬────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │ Update Local    │
                        │ With Remote ID  │
                        └─────────────────┘
```

## Database Schema

### Tables

- **projects** - Field project assignments
- **sample_plots** - Sample plot configurations
- **tree_measurements** - Individual tree data
- **tree_photos** - Photos linked to trees
- **sync_queue** - Pending sync operations
- **species_reference** - Cached species lookup

## API Integration

The mobile app uses the same Public API as the web platform:

```typescript
// Authentication
POST /api/auth/login
POST /api/auth/refresh

// Field data (requires Bearer token)
GET  /api/v1/projects
POST /api/v1/field/trees
POST /api/v1/field/plots
POST /api/v1/field/photos
```

## Testing

```bash
# Run tests
npm test

# Run with coverage
npm test -- --coverage
```

## Building for Production

### iOS

```bash
cd ios
xcodebuild -workspace LidarForest.xcworkspace -scheme LidarForest -configuration Release
```

### Android

```bash
cd android
./gradlew assembleRelease
```

## Troubleshooting

### GPS Not Working

1. Ensure location permissions are granted
2. Check that GPS is enabled on device
3. Go outdoors for better satellite visibility
4. Enable "High Accuracy" in Settings

### Sync Failing

1. Check network connectivity
2. Verify API credentials
3. View error details in Sync screen
4. Try "Retry Failed Operations"

### Photos Not Uploading

1. Large photos may take time on slow connections
2. Check storage space on device
3. Photos sync after tree data syncs

## License

MIT License - see LICENSE file in project root.
