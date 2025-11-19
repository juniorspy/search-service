const { MeiliSearch } = require('meilisearch');
const logger = require('./logger');

const host = process.env.MEILISEARCH_HOST || 'https://melisearch.onrpa.com';
const apiKey = process.env.MEILISEARCH_API_KEY;

if (!apiKey) {
  logger.error('MEILISEARCH_API_KEY is not defined in environment variables');
  throw new Error('MEILISEARCH_API_KEY is required');
}

const client = new MeiliSearch({
  host,
  apiKey,
  timeout: parseInt(process.env.REQUEST_TIMEOUT) || 5000,
});

logger.info(`Meilisearch client configured for host: ${host}`);

module.exports = client;
