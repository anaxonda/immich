import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE "asset_video" ADD "fieldOrder" text NOT NULL DEFAULT 'unknown';`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE "asset_video" DROP COLUMN "fieldOrder";`.execute(db);
}
