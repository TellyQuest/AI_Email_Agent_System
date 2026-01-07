import { defineConfig } from 'drizzle-kit';

// Note: To generate migrations, temporarily remove .js extensions from schema imports,
// run `pnpm db:generate`, then restore the .js extensions.
// The generated SQL migrations don't need the schema files to run.
export default defineConfig({
  schema: [
    './src/schema/emails.ts',
    './src/schema/clients.ts',
    './src/schema/actions.ts',
    './src/schema/sagas.ts',
    './src/schema/audit.ts',
    './src/schema/attachments.ts',
  ],
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env['DATABASE_URL'] || 'postgresql://emailagent:emailagent_dev@localhost:5432/email_agent',
  },
  verbose: true,
  strict: true,
});
