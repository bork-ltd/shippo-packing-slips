import { BuildingLocationType } from 'shippo/models/components';

export type ValidatePickupConfigResult =
  | { valid: true; buildingLocationType: BuildingLocationType }
  | { valid: false; error: string };

export function validatePickupConfig(
  rawLocationType: string | undefined,
  instructions: string | undefined,
): ValidatePickupConfigResult {
  const validLocationTypes = Object.values(BuildingLocationType) as string[];
  if (rawLocationType && !validLocationTypes.includes(rawLocationType)) {
    return {
      valid: false,
      error: `Invalid PICKUP_BUILDING_LOCATION_TYPE: "${rawLocationType}". Valid values: ${validLocationTypes.join(', ')}`,
    };
  }
  const buildingLocationType =
    (rawLocationType as BuildingLocationType) ?? BuildingLocationType.FrontDoor;
  if (buildingLocationType === BuildingLocationType.Other && !instructions) {
    return {
      valid: false,
      error:
        'PICKUP_INSTRUCTIONS is required when PICKUP_BUILDING_LOCATION_TYPE is "Other"',
    };
  }
  return { valid: true, buildingLocationType };
}
