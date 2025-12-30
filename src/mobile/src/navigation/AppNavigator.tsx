/**
 * App Navigator
 * Navigation structure for the mobile app
 * Sprint 55-60: Mobile Field App
 */

import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/MaterialIcons';

import type { RootStackParamList, MainTabParamList } from '../types';
import { useAuth } from '../store/appStore';

// Screens
import { LoginScreen } from '../screens/LoginScreen';
import { ProjectsScreen } from '../screens/ProjectsScreen';
import { ProjectDetailScreen } from '../screens/ProjectDetailScreen';
import { TreesScreen } from '../screens/TreesScreen';
import { TreeMeasurementScreen } from '../screens/TreeMeasurementScreen';
import { PlotDetailScreen } from '../screens/PlotDetailScreen';
import { MapScreen } from '../screens/MapScreen';
import { CrewScreen } from '../screens/CrewScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { SyncScreen } from '../screens/SyncScreen';
import { PhotoCaptureScreen } from '../screens/PhotoCaptureScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

// ============================================================================
// Tab Navigator
// ============================================================================

function MainTabs(): React.JSX.Element {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: string;

          switch (route.name) {
            case 'Projects':
              iconName = 'folder';
              break;
            case 'Trees':
              iconName = 'park';
              break;
            case 'Map':
              iconName = 'map';
              break;
            case 'Crew':
              iconName = 'group';
              break;
            case 'Profile':
              iconName = 'person';
              break;
            default:
              iconName = 'circle';
          }

          return <Icon name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#2e7d32',
        tabBarInactiveTintColor: 'gray',
        headerStyle: {
          backgroundColor: '#2e7d32',
        },
        headerTintColor: '#fff',
        headerTitleStyle: {
          fontWeight: 'bold',
        },
      })}
    >
      <Tab.Screen
        name="Projects"
        component={ProjectsScreen}
        options={{ title: 'Projects' }}
      />
      <Tab.Screen
        name="Trees"
        component={TreesScreen}
        options={{ title: 'Trees' }}
      />
      <Tab.Screen
        name="Map"
        component={MapScreen}
        options={{ title: 'Map' }}
      />
      <Tab.Screen
        name="Crew"
        component={CrewScreen}
        options={{ title: 'Crew' }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ title: 'Profile' }}
      />
    </Tab.Navigator>
  );
}

// ============================================================================
// Root Navigator
// ============================================================================

export function AppNavigator(): React.JSX.Element {
  const { isAuthenticated } = useAuth();

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: '#2e7d32',
        },
        headerTintColor: '#fff',
        headerTitleStyle: {
          fontWeight: 'bold',
        },
      }}
    >
      {!isAuthenticated ? (
        // Auth Stack
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{ headerShown: false }}
        />
      ) : (
        // Main App Stack
        <>
          <Stack.Screen
            name="MainTabs"
            component={MainTabs}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="ProjectDetail"
            component={ProjectDetailScreen}
            options={{ title: 'Project Details' }}
          />
          <Stack.Screen
            name="PlotDetail"
            component={PlotDetailScreen}
            options={{ title: 'Plot Details' }}
          />
          <Stack.Screen
            name="TreeMeasurement"
            component={TreeMeasurementScreen}
            options={{ title: 'Measure Tree' }}
          />
          <Stack.Screen
            name="PhotoCapture"
            component={PhotoCaptureScreen}
            options={{ title: 'Capture Photo' }}
          />
          <Stack.Screen
            name="Settings"
            component={SettingsScreen}
            options={{ title: 'Settings' }}
          />
          <Stack.Screen
            name="Sync"
            component={SyncScreen}
            options={{ title: 'Sync Status' }}
          />
        </>
      )}
    </Stack.Navigator>
  );
}
