import { BuildingLocationType } from 'shippo/models/components';
import { describe, expect, it } from 'vitest';

import { validatePickupConfig } from './validate-pickup-config';

describe('validatePickupConfig', () => {
  describe('valid cases', () => {
    it('returns FrontDoor when rawLocationType is undefined', () => {
      const result = validatePickupConfig(undefined, undefined);
      expect(result).toEqual({
        valid: true,
        buildingLocationType: BuildingLocationType.FrontDoor,
      });
    });

    it('returns FrontDoor when rawLocationType is "Front Door"', () => {
      const result = validatePickupConfig('Front Door', undefined);
      expect(result).toEqual({
        valid: true,
        buildingLocationType: BuildingLocationType.FrontDoor,
      });
    });

    it('returns BackDoor when rawLocationType is "Back Door"', () => {
      const result = validatePickupConfig('Back Door', undefined);
      expect(result).toEqual({
        valid: true,
        buildingLocationType: BuildingLocationType.BackDoor,
      });
    });

    it('returns Other when rawLocationType is "Other" and instructions are provided', () => {
      const result = validatePickupConfig('Other', 'Leave at side door');
      expect(result).toEqual({
        valid: true,
        buildingLocationType: BuildingLocationType.Other,
      });
    });

    it('accepts all defined BuildingLocationType values', () => {
      for (const value of Object.values(BuildingLocationType)) {
        const instructions =
          value === BuildingLocationType.Other ? 'test' : undefined;
        const result = validatePickupConfig(value, instructions);
        expect(result.valid).toBe(true);
      }
    });
  });

  describe('invalid rawLocationType', () => {
    it('returns invalid for an unrecognized string value', () => {
      const result = validatePickupConfig('Rooftop', undefined);
      expect(result.valid).toBe(false);
    });

    it('error message includes the bad value', () => {
      const result = validatePickupConfig('Rooftop', undefined);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('"Rooftop"');
      }
    });

    it('error message lists all valid values', () => {
      const result = validatePickupConfig('Rooftop', undefined);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        for (const value of Object.values(BuildingLocationType)) {
          expect(result.error).toContain(value);
        }
      }
    });
  });

  describe('Other without instructions', () => {
    it('returns invalid when type is Other and instructions is undefined', () => {
      const result = validatePickupConfig('Other', undefined);
      expect(result.valid).toBe(false);
    });

    it('returns invalid when type is Other and instructions is empty string', () => {
      const result = validatePickupConfig('Other', '');
      expect(result.valid).toBe(false);
    });

    it('returns valid when type is Other and instructions is a non-empty string', () => {
      const result = validatePickupConfig('Other', 'Inside porch box');
      expect(result.valid).toBe(true);
    });
  });
});
