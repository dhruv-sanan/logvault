import { Client } from "@elastic/elasticsearch";

const TEST_INDEX = "logs-test";

export default async function globalTeardown() {
  const client = new Client({
    node: process.env.ELASTICSEARCH_URL!,
    ...(process.env.ELASTICSEARCH_API_KEY
      ? { auth: { apiKey: process.env.ELASTICSEARCH_API_KEY } }
      : {}),
  });

  const exists = await client.indices.exists({ index: TEST_INDEX });
  if (exists) {
    await client.indices.delete({ index: TEST_INDEX });
    console.log(`[test teardown] Cleaned up index: ${TEST_INDEX}`);
  }
}
