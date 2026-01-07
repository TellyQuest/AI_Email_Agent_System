import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { clientRepository, emailRepository, ClientFilters } from '@ai-email-agent/database';
import { groqClient } from '@ai-email-agent/integrations';

const clientQuerySchema = z.object({
  isActive: z
    .string()
    .transform((v) => v === 'true')
    .optional(),
  search: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
});

const clientIdSchema = z.object({
  id: z.string().uuid(),
});

const createClientSchema = z.object({
  name: z.string().min(1),
  displayName: z.string().optional(),
  quickbooksId: z.string().optional(),
  billcomId: z.string().optional(),
  emailDomains: z.array(z.string()).default([]),
  knownEmails: z.array(z.string().email()).default([]),
  keywords: z.array(z.string()).default([]),
  defaultExpenseAccount: z.string().optional(),
  approvalThreshold: z.number().positive().optional(),
  autoApproveVendors: z.array(z.string()).default([]),
});

const updateClientSchema = createClientSchema.partial();

const learnMappingSchema = z.object({
  emailAddress: z.string().email(),
  clientId: z.string().uuid(),
  createdBy: z.string().uuid().optional(),
});

export const clientRoutes: FastifyPluginAsync = async (app) => {
  // List clients
  app.get(
    '/',
    {
      schema: {
        tags: ['clients'],
        summary: 'List clients',
        querystring: {
          type: 'object',
          properties: {
            isActive: { type: 'string' },
            search: { type: 'string' },
            limit: { type: 'number', default: 50 },
            offset: { type: 'number', default: 0 },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              data: { type: 'array' },
              total: { type: 'number' },
              limit: { type: 'number' },
              offset: { type: 'number' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const query = clientQuerySchema.parse(request.query);

      const filters: ClientFilters = {
        limit: query.limit,
        offset: query.offset,
      };

      if (query.isActive !== undefined) {
        filters.isActive = query.isActive;
      }
      if (query.search) {
        filters.search = query.search;
      }

      const result = await clientRepository.findMany(filters);

      if (!result.ok) {
        return reply.status(500).send({ error: result.error.message });
      }

      return {
        data: result.value,
        total: result.value.length,
        limit: query.limit,
        offset: query.offset,
      };
    }
  );

  // Get client by ID
  app.get(
    '/:id',
    {
      schema: {
        tags: ['clients'],
        summary: 'Get client by ID',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
          required: ['id'],
        },
        response: {
          200: { type: 'object' },
          404: {
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = clientIdSchema.parse(request.params);

      const result = await clientRepository.findById(id);

      if (!result.ok) {
        return reply.status(500).send({ error: result.error.message });
      }

      if (!result.value) {
        return reply.status(404).send({ error: 'Client not found' });
      }

      return result.value;
    }
  );

  // Create client
  app.post(
    '/',
    {
      schema: {
        tags: ['clients'],
        summary: 'Create a new client',
        body: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            displayName: { type: 'string' },
            quickbooksId: { type: 'string' },
            billcomId: { type: 'string' },
            emailDomains: { type: 'array', items: { type: 'string' } },
            knownEmails: { type: 'array', items: { type: 'string' } },
            keywords: { type: 'array', items: { type: 'string' } },
            defaultExpenseAccount: { type: 'string' },
            approvalThreshold: { type: 'number' },
            autoApproveVendors: { type: 'array', items: { type: 'string' } },
          },
          required: ['name'],
        },
        response: {
          201: { type: 'object' },
        },
      },
    },
    async (request, reply) => {
      const data = createClientSchema.parse(request.body);

      const result = await clientRepository.create({
        ...data,
        approvalThreshold: data.approvalThreshold?.toString(),
      });

      if (!result.ok) {
        return reply.status(500).send({ error: result.error.message });
      }

      return reply.status(201).send(result.value);
    }
  );

  // Update client
  app.patch(
    '/:id',
    {
      schema: {
        tags: ['clients'],
        summary: 'Update a client',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
          required: ['id'],
        },
        body: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            displayName: { type: 'string' },
            quickbooksId: { type: 'string' },
            billcomId: { type: 'string' },
            emailDomains: { type: 'array', items: { type: 'string' } },
            knownEmails: { type: 'array', items: { type: 'string' } },
            keywords: { type: 'array', items: { type: 'string' } },
            defaultExpenseAccount: { type: 'string' },
            approvalThreshold: { type: 'number' },
            autoApproveVendors: { type: 'array', items: { type: 'string' } },
            isActive: { type: 'boolean' },
          },
        },
        response: {
          200: { type: 'object' },
          404: {
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = clientIdSchema.parse(request.params);
      const data = updateClientSchema.parse(request.body);

      const result = await clientRepository.update(id, {
        ...data,
        approvalThreshold: data.approvalThreshold?.toString(),
      });

      if (!result.ok) {
        if (result.error.message.includes('not found')) {
          return reply.status(404).send({ error: 'Client not found' });
        }
        return reply.status(500).send({ error: result.error.message });
      }

      return result.value;
    }
  );

  // Get client email mappings
  app.get(
    '/:id/mappings',
    {
      schema: {
        tags: ['clients'],
        summary: 'Get email mappings for a client',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
          required: ['id'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              data: { type: 'array' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = clientIdSchema.parse(request.params);

      const result = await clientRepository.findEmailMappings(id);

      if (!result.ok) {
        return reply.status(500).send({ error: result.error.message });
      }

      return { data: result.value };
    }
  );

  // Learn email mapping (from human correction)
  app.post(
    '/mappings/learn',
    {
      schema: {
        tags: ['clients'],
        summary: 'Learn a new email mapping from human correction',
        body: {
          type: 'object',
          properties: {
            emailAddress: { type: 'string', format: 'email' },
            clientId: { type: 'string', format: 'uuid' },
            createdBy: { type: 'string', format: 'uuid' },
          },
          required: ['emailAddress', 'clientId'],
        },
        response: {
          201: { type: 'object' },
        },
      },
    },
    async (request, reply) => {
      const data = learnMappingSchema.parse(request.body);

      const result = await clientRepository.learnEmailMapping(
        data.emailAddress,
        data.clientId,
        data.createdBy
      );

      if (!result.ok) {
        return reply.status(500).send({ error: result.error.message });
      }

      return reply.status(201).send(result.value);
    }
  );

  // Match email to client
  app.get(
    '/match',
    {
      schema: {
        tags: ['clients'],
        summary: 'Find client matches for an email address',
        querystring: {
          type: 'object',
          properties: {
            email: { type: 'string', format: 'email' },
          },
          required: ['email'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              candidates: { type: 'array' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { email } = request.query as { email: string };

      const result = await clientRepository.findByEmail(email);

      if (!result.ok) {
        return reply.status(500).send({ error: result.error.message });
      }

      return { candidates: result.value };
    }
  );

  // Get client email summary with AI insights
  app.get(
    '/:id/summary',
    {
      schema: {
        tags: ['clients'],
        summary: 'Get AI-generated summary of client email activity',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
          required: ['id'],
        },
        querystring: {
          type: 'object',
          properties: {
            days: { type: 'number', default: 30 },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              client: { type: 'object' },
              stats: { type: 'object' },
              aiSummary: {
                type: 'object',
                properties: {
                  summary: { type: 'string' },
                  highlights: { type: 'array', items: { type: 'string' } },
                  recommendations: { type: 'array', items: { type: 'string' } },
                },
              },
              recentEmails: { type: 'array' },
            },
          },
          404: {
            type: 'object',
            properties: { error: { type: 'string' } },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = clientIdSchema.parse(request.params);
      const { days } = request.query as { days?: number };

      // Get client info
      const clientResult = await clientRepository.findById(id);
      if (!clientResult.ok) {
        return reply.status(500).send({ error: clientResult.error.message });
      }
      if (!clientResult.value) {
        return reply.status(404).send({ error: 'Client not found' });
      }

      const client = clientResult.value;

      // Get email summary data
      const summaryResult = await emailRepository.getClientSummary(id, days ?? 30);
      if (!summaryResult.ok) {
        return reply.status(500).send({ error: summaryResult.error.message });
      }

      const { emails, stats } = summaryResult.value;

      // Generate AI summary if there are emails
      let aiSummary = {
        summary: 'No email activity in the selected period.',
        highlights: [] as string[],
        recommendations: ['Consider reaching out to the client for updates.'],
      };

      if (emails.length > 0) {
        const aiResult = await groqClient.summarizeClientEmails(
          client.displayName ?? client.name,
          emails.map((e) => ({
            subject: e.subject,
            senderEmail: e.senderEmail,
            receivedAt: e.receivedAt,
            classification: e.classification as { emailType: string; urgency: string } | null,
            extractedData: e.extractedData as { amount?: { value: string | null }; vendorName?: { value: string | null } } | null,
          })),
          stats
        );

        if (aiResult.ok) {
          aiSummary = aiResult.value;
        }
      }

      return {
        client: {
          id: client.id,
          name: client.name,
          displayName: client.displayName,
        },
        stats,
        aiSummary,
        recentEmails: emails.slice(0, 10).map((e) => ({
          id: e.id,
          subject: e.subject,
          senderEmail: e.senderEmail,
          receivedAt: e.receivedAt,
          status: e.status,
          classification: e.classification,
          extractedAmount: (e.extractedData as { amount?: { value: string | null } } | null)?.amount?.value,
        })),
      };
    }
  );
};
