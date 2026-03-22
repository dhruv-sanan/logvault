import { Client } from "@elastic/elasticsearch";
import * as dotenv from "dotenv";
import * as path from "path";

// Load .env.local so tests can reach Elastic Cloud
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const TEST_INDEX = "logs-test";

export default async function globalSetup() {
  process.env.ELASTICSEARCH_INDEX = TEST_INDEX;

  const client = new Client({
    node: process.env.ELASTICSEARCH_URL!,
    ...(process.env.ELASTICSEARCH_API_KEY
      ? { auth: { apiKey: process.env.ELASTICSEARCH_API_KEY } }
      : {}),
  });

  // Delete the test index if it exists from a previous run
  const exists = await client.indices.exists({ index: TEST_INDEX });
  if (exists) {
    await client.indices.delete({ index: TEST_INDEX });
    console.log(`[test setup] Deleted stale index: ${TEST_INDEX}`);
  }
}
