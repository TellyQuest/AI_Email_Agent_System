import { describe, it, expect } from 'vitest';
import {
  patternTypeValues,
  mappingSourceValues,
  type PatternType,
  type MappingSource,
} from './clients.js';

describe('Client schema types', () => {
  describe('patternTypeValues', () => {
    it('contains all pattern types', () => {
      expect(patternTypeValues).toContain('exact');
      expect(patternTypeValues).toContain('domain');
      expect(patternTypeValues).toContain('regex');
    });

    it('has exactly 3 pattern types', () => {
      expect(patternTypeValues).toHaveLength(3);
    });
  });

  describe('mappingSourceValues', () => {
    it('contains all mapping sources', () => {
      expect(mappingSourceValues).toContain('manual');
      expect(mappingSourceValues).toContain('learned');
      expect(mappingSourceValues).toContain('imported');
    });

    it('has exactly 3 mapping sources', () => {
      expect(mappingSourceValues).toHaveLength(3);
    });
  });

  describe('PatternType', () => {
    it('allows valid pattern types', () => {
      const patterns: PatternType[] = ['exact', 'domain', 'regex'];
      expect(patterns).toHaveLength(3);
    });
  });

  describe('MappingSource', () => {
    it('allows valid mapping sources', () => {
      const sources: MappingSource[] = ['manual', 'learned', 'imported'];
      expect(sources).toHaveLength(3);
    });
  });
});
