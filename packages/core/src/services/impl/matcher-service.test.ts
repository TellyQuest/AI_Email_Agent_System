import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ok, err } from '@ai-email-agent/utils';
import { ClientMatcherService } from './matcher-service.js';
import { EmailDomain } from '../../types/email.js';

// Mock ClientRepository
const mockClientRepo = {
  findByEmail: vi.fn(),
  learnEmailMapping: vi.fn(),
  findEmailMappings: vi.fn(),
  deleteEmailMapping: vi.fn(),
};

// Sample email
const sampleEmail: EmailDomain = {
  id: 'email-123',
  messageId: 'msg-123',
  conversationId: 'conv-123',
  subject: 'Invoice #12345',
  senderEmail: 'billing@acme.com',
  senderName: 'Acme Billing',
  recipientEmail: 'ap@mycompany.com',
  receivedAt: new Date('2024-01-15'),
  bodyText: 'Invoice content',
  bodyHtml: null,
  hasAttachments: false,
  attachments: [],
  status: 'pending',
  classification: null,
  clientId: null,
  matchMethod: null,
  matchConfidence: null,
  extractedData: null,
};

// Sample match candidates
const sampleCandidates = [
  {
    client: { id: 'client-1', name: 'Acme Corp' },
    matchMethod: 'explicit' as const,
    confidence: 0.95,
  },
  {
    client: { id: 'client-2', name: 'Acme Industries' },
    matchMethod: 'domain' as const,
    confidence: 0.75,
  },
];

describe('ClientMatcherService', () => {
  let service: ClientMatcherService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ClientMatcherService(mockClientRepo as any);
  });

  describe('match', () => {
    it('should match email to client with highest confidence', async () => {
      mockClientRepo.findByEmail.mockResolvedValue(ok(sampleCandidates));

      const result = await service.match(sampleEmail);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.clientId).toBe('client-1');
        expect(result.value.matchMethod).toBe('explicit');
        expect(result.value.confidence).toBe(0.95);
      }
      expect(mockClientRepo.findByEmail).toHaveBeenCalledWith(sampleEmail.senderEmail);
    });

    it('should return unmatched when no candidates found', async () => {
      mockClientRepo.findByEmail.mockResolvedValue(ok([]));

      const result = await service.match(sampleEmail);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.clientId).toBeNull();
        expect(result.value.matchMethod).toBe('unmatched');
        expect(result.value.confidence).toBe(0);
      }
    });

    it('should return unmatched when all candidates below threshold', async () => {
      const lowConfidenceCandidates = [
        {
          client: { id: 'client-1', name: 'Acme Corp' },
          matchMethod: 'domain' as const,
          confidence: 0.5,
        },
      ];
      mockClientRepo.findByEmail.mockResolvedValue(ok(lowConfidenceCandidates));

      const result = await service.match(sampleEmail);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.clientId).toBeNull();
        expect(result.value.matchMethod).toBe('unmatched');
        expect(result.value.candidates).toHaveLength(1); // Still returns candidates
      }
    });

    it('should handle ambiguous matches (multiple high-confidence)', async () => {
      const ambiguousCandidates = [
        {
          client: { id: 'client-1', name: 'Acme Corp' },
          matchMethod: 'explicit' as const,
          confidence: 0.95,
        },
        {
          client: { id: 'client-2', name: 'Acme Industries' },
          matchMethod: 'explicit' as const,
          confidence: 0.92,
        },
      ];
      mockClientRepo.findByEmail.mockResolvedValue(ok(ambiguousCandidates));

      const result = await service.match(sampleEmail);

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Should return unmatched for ambiguous
        expect(result.value.clientId).toBeNull();
        expect(result.value.matchMethod).toBe('unmatched');
        expect(result.value.candidates).toHaveLength(2);
      }
    });

    it('should respect custom minConfidence option', async () => {
      const serviceWithHighThreshold = new ClientMatcherService(mockClientRepo as any, {
        minConfidence: 0.9,
      });
      mockClientRepo.findByEmail.mockResolvedValue(ok(sampleCandidates));

      const result = await serviceWithHighThreshold.match(sampleEmail);

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Only client-1 meets 0.9 threshold
        expect(result.value.clientId).toBe('client-1');
      }
    });

    it('should limit candidates returned', async () => {
      const manyCandidates = Array.from({ length: 10 }, (_, i) => ({
        client: { id: `client-${i}`, name: `Client ${i}` },
        matchMethod: 'domain' as const,
        confidence: 0.8 - i * 0.05,
      }));
      mockClientRepo.findByEmail.mockResolvedValue(ok(manyCandidates));

      const serviceWithLimit = new ClientMatcherService(mockClientRepo as any, {
        maxCandidates: 3,
      });
      const result = await serviceWithLimit.match(sampleEmail);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.candidates.length).toBeLessThanOrEqual(3);
      }
    });

    it('should handle database errors', async () => {
      mockClientRepo.findByEmail.mockResolvedValue(err(new Error('Connection failed')));

      const result = await service.match(sampleEmail);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('DATABASE_ERROR');
      }
    });
  });

  describe('learnMapping', () => {
    it('should create a new email mapping', async () => {
      const mockMapping = {
        id: 'mapping-123',
        emailPattern: 'billing@acme.com',
        clientId: 'client-1',
        patternType: 'exact',
        confidence: '1.0',
        source: 'learned',
        createdBy: 'user-1',
        createdAt: new Date(),
      };
      mockClientRepo.learnEmailMapping.mockResolvedValue(ok(mockMapping));

      const result = await service.learnMapping('billing@acme.com', 'client-1', 'user-1');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.emailPattern).toBe('billing@acme.com');
        expect(result.value.clientId).toBe('client-1');
        expect(result.value.source).toBe('learned');
      }
    });

    it('should handle missing createdBy', async () => {
      const mockMapping = {
        id: 'mapping-123',
        emailPattern: 'billing@acme.com',
        clientId: 'client-1',
        patternType: 'exact',
        confidence: '1.0',
        source: 'learned',
        createdBy: null,
        createdAt: new Date(),
      };
      mockClientRepo.learnEmailMapping.mockResolvedValue(ok(mockMapping));

      const result = await service.learnMapping('billing@acme.com', 'client-1');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.createdBy).toBeNull();
      }
    });

    it('should handle database errors', async () => {
      mockClientRepo.learnEmailMapping.mockResolvedValue(err(new Error('Duplicate entry')));

      const result = await service.learnMapping('billing@acme.com', 'client-1');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('DATABASE_ERROR');
      }
    });
  });

  describe('getMappings', () => {
    it('should retrieve all mappings for a client', async () => {
      const mockMappings = [
        {
          id: 'mapping-1',
          emailPattern: 'billing@acme.com',
          clientId: 'client-1',
          patternType: 'exact',
          confidence: '1.0',
          source: 'manual',
          createdBy: 'user-1',
          createdAt: new Date(),
        },
        {
          id: 'mapping-2',
          emailPattern: '@acme.com',
          clientId: 'client-1',
          patternType: 'domain',
          confidence: '0.8',
          source: 'learned',
          createdBy: null,
          createdAt: new Date(),
        },
      ];
      mockClientRepo.findEmailMappings.mockResolvedValue(ok(mockMappings));

      const result = await service.getMappings('client-1');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(2);
        expect(result.value[0]?.patternType).toBe('exact');
        expect(result.value[1]?.patternType).toBe('domain');
      }
    });

    it('should return empty array when no mappings', async () => {
      mockClientRepo.findEmailMappings.mockResolvedValue(ok([]));

      const result = await service.getMappings('client-1');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(0);
      }
    });
  });

  describe('deleteMapping', () => {
    it('should delete a mapping successfully', async () => {
      mockClientRepo.deleteEmailMapping.mockResolvedValue(ok(undefined));

      const result = await service.deleteMapping('mapping-123');

      expect(result.ok).toBe(true);
      expect(mockClientRepo.deleteEmailMapping).toHaveBeenCalledWith('mapping-123');
    });

    it('should handle database errors', async () => {
      mockClientRepo.deleteEmailMapping.mockResolvedValue(err(new Error('Not found')));

      const result = await service.deleteMapping('mapping-123');

      expect(result.ok).toBe(false);
    });
  });
});
