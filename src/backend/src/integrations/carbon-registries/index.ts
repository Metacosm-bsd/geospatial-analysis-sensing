/**
 * Carbon Registries Integration Index
 * Sprint 61-66: Third-Party Integrations
 */

export * from './verra';
export * from './car';

// Registry type union
export type CarbonRegistry = 'verra_vcs' | 'car' | 'acr' | 'gold_standard';

// Registry metadata
export const REGISTRY_INFO: Record<CarbonRegistry, {
  name: string;
  fullName: string;
  website: string;
  protocols: string[];
}> = {
  verra_vcs: {
    name: 'Verra VCS',
    fullName: 'Verified Carbon Standard',
    website: 'https://verra.org',
    protocols: [
      'VM0003 - Methodology for IFM through Extension of Rotation Age',
      'VM0010 - Methodology for IFM on Non-Federal U.S. Forestlands',
      'VM0012 - Improved Forest Management in Temperate/Boreal Forests',
    ],
  },
  car: {
    name: 'CAR',
    fullName: 'Climate Action Reserve',
    website: 'https://www.climateactionreserve.org',
    protocols: [
      'Forest Project Protocol Version 5.0',
      'Urban Forest Management Project Protocol',
      'Mexico Forest Protocol',
    ],
  },
  acr: {
    name: 'ACR',
    fullName: 'American Carbon Registry',
    website: 'https://americancarbonregistry.org',
    protocols: [
      'Improved Forest Management Methodology',
      'Afforestation and Reforestation Methodology',
    ],
  },
  gold_standard: {
    name: 'Gold Standard',
    fullName: 'Gold Standard for the Global Goals',
    website: 'https://www.goldstandard.org',
    protocols: [
      'A/R Methodology',
      'Improved Forest Management',
    ],
  },
};
