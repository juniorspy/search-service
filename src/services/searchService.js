const meilisearchClient = require('../config/meilisearch');
const logger = require('../config/logger');

const GLOBAL_INDEX = process.env.GLOBAL_INDEX || 'colmado_inventory';
const LOCAL_INDEX_PREFIX = process.env.LOCAL_INDEX_PREFIX || 'productos_colmado_';

/**
 * Performs a search with local→global fallback logic
 *
 * @param {string} query - Search query text
 * @param {string} slug - Store slug for local index
 * @param {number} limit - Maximum results to return
 * @param {number} offset - Offset for pagination
 * @returns {Promise<Object>} Search results with metadata
 */
async function searchWithFallback(query, slug, limit = 20, offset = 0) {
  const localIndexName = `${LOCAL_INDEX_PREFIX}${slug}`;

  logger.info('Search request', { query, slug, localIndexName, limit, offset });

  try {
    // Step 1: Search in local index
    const localIndex = meilisearchClient.index(localIndexName);

    let localResults;
    try {
      localResults = await localIndex.search(query, {
        limit,
        offset,
      });

      logger.info('Local search completed', {
        indexName: localIndexName,
        totalHits: localResults.estimatedTotalHits || localResults.hits.length,
      });

      // If we found results in local index, return them
      if (localResults.hits && localResults.hits.length > 0) {
        return {
          source: 'local',
          indexName: localIndexName,
          hits: localResults.hits,
          total: localResults.estimatedTotalHits || localResults.hits.length,
          query,
          limit,
          offset,
          processingTimeMs: localResults.processingTimeMs,
        };
      }

      logger.info('No results in local index, falling back to global', { localIndexName });
    } catch (localError) {
      // If local index doesn't exist or has errors, log and fall through to global
      logger.warn('Local index search failed, falling back to global', {
        localIndexName,
        error: localError.message,
      });
    }

    // Step 2: Fallback to global index
    const globalIndex = meilisearchClient.index(GLOBAL_INDEX);
    const globalResults = await globalIndex.search(query, {
      limit,
      offset,
    });

    logger.info('Global search completed', {
      indexName: GLOBAL_INDEX,
      totalHits: globalResults.estimatedTotalHits || globalResults.hits.length,
    });

    return {
      source: 'global',
      indexName: GLOBAL_INDEX,
      hits: globalResults.hits,
      total: globalResults.estimatedTotalHits || globalResults.hits.length,
      query,
      limit,
      offset,
      processingTimeMs: globalResults.processingTimeMs,
    };

  } catch (error) {
    logger.error('Search failed', {
      query,
      slug,
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

/**
 * Health check for Meilisearch connection
 *
 * @returns {Promise<Object>} Health status
 */
async function healthCheck() {
  try {
    const health = await meilisearchClient.health();
    logger.debug('Meilisearch health check', { status: health.status });
    return {
      status: 'healthy',
      meilisearch: health,
    };
  } catch (error) {
    logger.error('Meilisearch health check failed', { error: error.message });
    return {
      status: 'unhealthy',
      error: error.message,
    };
  }
}

module.exports = {
  searchWithFallback,
  healthCheck,
};
