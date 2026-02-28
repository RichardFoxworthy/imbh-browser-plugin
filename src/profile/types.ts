export type AustralianState = 'NSW' | 'VIC' | 'QLD' | 'SA' | 'WA' | 'TAS' | 'NT' | 'ACT';

export interface Address {
  unit?: string;
  streetNumber: string;
  streetName: string;
  suburb: string;
  state: AustralianState;
  postcode: string;
  yearsAtAddress: number;
}

export interface Claim {
  id: string;
  type: 'home' | 'contents' | 'motor';
  date: string;
  description: string;
  amount: number;
  atFault: boolean;
}

export interface PersonalDetails {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  email: string;
  phone: string;
  currentAddress: Address;
  previousAddresses: Address[];
  claimsHistory: Claim[];
}

export interface SpecifiedItem {
  id: string;
  description: string;
  value: number;
  category: string;
}

export type PropertyType = 'house' | 'apartment' | 'townhouse' | 'unit';
export type OwnershipStatus = 'owner-occupier' | 'landlord' | 'tenant';
export type ConstructionType = 'brick' | 'brick-veneer' | 'weatherboard' | 'concrete' | 'other';
export type RoofType = 'tile' | 'metal' | 'concrete' | 'other';
export type CoverType = 'home-only' | 'contents-only' | 'home-and-contents';

export interface HomeContentsProfile {
  propertyType: PropertyType;
  ownershipStatus: OwnershipStatus;
  constructionType: ConstructionType;
  roofType: RoofType;
  yearBuilt: number;
  numberOfBedrooms: number;
  numberOfBathrooms: number;
  numberOfStoreys: number;
  landArea: number;
  swimmingPool: boolean;
  poolFenced: boolean;
  securityAlarm: boolean;
  securityCameras: boolean;
  deadlocks: boolean;
  smokeAlarms: boolean;
  buildingSumInsured: number;
  contentsSumInsured: number;
  specifiedItems: SpecifiedItem[];
  coverType: CoverType;
  excessPreference: number;
}

export type MotorCoverType = 'comprehensive' | 'third-party-fire-theft' | 'third-party';
export type ParkingLocation = 'garage' | 'carport' | 'driveway' | 'street' | 'secure-parking';
export type DailyKilometres = 'under-15k' | '15k-25k' | '25k-35k' | 'over-35k';
export type FuelType = 'petrol' | 'diesel' | 'electric' | 'hybrid' | 'lpg';
export type LicenceType = 'full' | 'provisional' | 'learner';
export type Gender = 'male' | 'female' | 'other';
export type DriverRelationship = 'self' | 'spouse' | 'child' | 'other';

export interface VehicleDetails {
  make: string;
  model: string;
  year: number;
  variant?: string;
  bodyType: string;
  transmission: 'automatic' | 'manual';
  engineSize: string;
  fuelType: FuelType;
  colour: string;
  registration: string;
  registrationState: AustralianState;
}

export interface DriverDetails {
  id: string;
  relationship: DriverRelationship;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: Gender;
  licenceType: LicenceType;
  licenceYears: number;
  claimsHistory: Claim[];
}

export interface MotorProfile {
  id: string;
  vehicle: VehicleDetails;
  drivers: DriverDetails[];
  coverType: MotorCoverType;
  agreedValue?: number;
  marketValue: boolean;
  parkingLocation: ParkingLocation;
  dailyKilometres: DailyKilometres;
  businessUse: boolean;
  modifications: string[];
  financeOwing: boolean;
  excessPreference: number;
}

export interface UserProfile {
  id: string;
  createdAt: string;
  updatedAt: string;
  personal: PersonalDetails;
  home?: HomeContentsProfile;
  motor?: MotorProfile[];
}

export function createEmptyProfile(): UserProfile {
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    personal: {
      firstName: '',
      lastName: '',
      dateOfBirth: '',
      email: '',
      phone: '',
      currentAddress: {
        streetNumber: '',
        streetName: '',
        suburb: '',
        state: 'NSW',
        postcode: '',
        yearsAtAddress: 0,
      },
      previousAddresses: [],
      claimsHistory: [],
    },
  };
}

export function createEmptyHomeProfile(): HomeContentsProfile {
  return {
    propertyType: 'house',
    ownershipStatus: 'owner-occupier',
    constructionType: 'brick',
    roofType: 'tile',
    yearBuilt: 2000,
    numberOfBedrooms: 3,
    numberOfBathrooms: 1,
    numberOfStoreys: 1,
    landArea: 600,
    swimmingPool: false,
    poolFenced: false,
    securityAlarm: false,
    securityCameras: false,
    deadlocks: false,
    smokeAlarms: true,
    buildingSumInsured: 500000,
    contentsSumInsured: 100000,
    specifiedItems: [],
    coverType: 'home-and-contents',
    excessPreference: 500,
  };
}

export function createEmptyMotorProfile(): MotorProfile {
  return {
    id: crypto.randomUUID(),
    vehicle: {
      make: '',
      model: '',
      year: new Date().getFullYear(),
      bodyType: '',
      transmission: 'automatic',
      engineSize: '',
      fuelType: 'petrol',
      colour: '',
      registration: '',
      registrationState: 'NSW',
    },
    drivers: [],
    coverType: 'comprehensive',
    marketValue: true,
    parkingLocation: 'garage',
    dailyKilometres: 'under-15k',
    businessUse: false,
    modifications: [],
    financeOwing: false,
    excessPreference: 500,
  };
}
