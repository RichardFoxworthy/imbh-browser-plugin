import type { AustralianState, PropertyType, OwnershipStatus, ConstructionType, RoofType, CoverType, MotorCoverType, ParkingLocation, DailyKilometres, FuelType, LicenceType, Gender } from '../profile/types';

export const AUSTRALIAN_STATES: { value: AustralianState; label: string }[] = [
  { value: 'NSW', label: 'New South Wales' },
  { value: 'VIC', label: 'Victoria' },
  { value: 'QLD', label: 'Queensland' },
  { value: 'SA', label: 'South Australia' },
  { value: 'WA', label: 'Western Australia' },
  { value: 'TAS', label: 'Tasmania' },
  { value: 'NT', label: 'Northern Territory' },
  { value: 'ACT', label: 'Australian Capital Territory' },
];

export const PROPERTY_TYPES: { value: PropertyType; label: string }[] = [
  { value: 'house', label: 'House' },
  { value: 'apartment', label: 'Apartment' },
  { value: 'townhouse', label: 'Townhouse' },
  { value: 'unit', label: 'Unit' },
];

export const OWNERSHIP_STATUSES: { value: OwnershipStatus; label: string }[] = [
  { value: 'owner-occupier', label: 'Owner Occupier' },
  { value: 'landlord', label: 'Landlord' },
  { value: 'tenant', label: 'Tenant' },
];

export const CONSTRUCTION_TYPES: { value: ConstructionType; label: string }[] = [
  { value: 'brick', label: 'Full Brick' },
  { value: 'brick-veneer', label: 'Brick Veneer' },
  { value: 'weatherboard', label: 'Weatherboard' },
  { value: 'concrete', label: 'Concrete' },
  { value: 'other', label: 'Other' },
];

export const ROOF_TYPES: { value: RoofType; label: string }[] = [
  { value: 'tile', label: 'Tile' },
  { value: 'metal', label: 'Metal/Colorbond' },
  { value: 'concrete', label: 'Concrete' },
  { value: 'other', label: 'Other' },
];

export const COVER_TYPES: { value: CoverType; label: string }[] = [
  { value: 'home-and-contents', label: 'Home & Contents' },
  { value: 'home-only', label: 'Home Only' },
  { value: 'contents-only', label: 'Contents Only' },
];

export const MOTOR_COVER_TYPES: { value: MotorCoverType; label: string }[] = [
  { value: 'comprehensive', label: 'Comprehensive' },
  { value: 'third-party-fire-theft', label: 'Third Party Fire & Theft' },
  { value: 'third-party', label: 'Third Party Only' },
];

export const PARKING_LOCATIONS: { value: ParkingLocation; label: string }[] = [
  { value: 'garage', label: 'Garage' },
  { value: 'carport', label: 'Carport' },
  { value: 'driveway', label: 'Driveway' },
  { value: 'street', label: 'Street' },
  { value: 'secure-parking', label: 'Secure Parking' },
];

export const DAILY_KILOMETRES: { value: DailyKilometres; label: string }[] = [
  { value: 'under-15k', label: 'Under 15,000 km' },
  { value: '15k-25k', label: '15,000 - 25,000 km' },
  { value: '25k-35k', label: '25,000 - 35,000 km' },
  { value: 'over-35k', label: 'Over 35,000 km' },
];

export const FUEL_TYPES: { value: FuelType; label: string }[] = [
  { value: 'petrol', label: 'Petrol' },
  { value: 'diesel', label: 'Diesel' },
  { value: 'electric', label: 'Electric' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'lpg', label: 'LPG' },
];

export const LICENCE_TYPES: { value: LicenceType; label: string }[] = [
  { value: 'full', label: 'Full' },
  { value: 'provisional', label: 'Provisional' },
  { value: 'learner', label: 'Learner' },
];

export const GENDERS: { value: Gender; label: string }[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
];
