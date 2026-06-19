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
  const localIndexName = `${LOCAL_INDEX_PREFIX}${slug}`.replace(/[^a-z0-9_]+/gi, '_').toLowerCase();

  logger.info('Search request', { query, slug, localIndexName, limit, offset });

  try {
    // Search local first. Global is only a fallback when local returns no hits.
    const localIndex = meilisearchClient.index(localIndexName);
    const globalIndex = meilisearchClient.index(GLOBAL_INDEX);

    const localResult = await Promise.resolve()
      .then(() => localIndex.search(query, { limit, offset }))
      .then(value => ({ status: 'fulfilled', value }))
      .catch(reason => ({ status: 'rejected', reason }));

    const localHits = localResult.status === 'fulfilled' ? localResult.value.hits || [] : [];

    if (localResult.status === 'rejected') {
      logger.warn('Local index search failed', { localIndexName, error: localResult.reason.message });
    } else {
      logger.info('Local search completed', { indexName: localIndexName, totalHits: localHits.length });
    }

    if (localHits.length > 0) {
      const hits = localHits.map(hit => ({ ...hit, _source: 'local' })).slice(0, limit);
      return {
        source: 'local',
        indexName: localIndexName,
        hits,
        total: hits.length,
        localHits: hits.length,
        globalHits: 0,
        query,
        limit,
        offset,
        processingTimeMs: localResult.value.processingTimeMs || 0,
      };
    }

    const globalResult = await Promise.resolve()
      .then(() => globalIndex.search(query, { limit, offset }))
      .then(value => ({ status: 'fulfilled', value }))
      .catch(reason => ({ status: 'rejected', reason }));

    if (globalResult.status === 'rejected') {
      logger.warn('Global index search failed', { indexName: GLOBAL_INDEX, error: globalResult.reason.message });
      throw globalResult.reason;
    } else {
      logger.info('Global search completed', { indexName: GLOBAL_INDEX, totalHits: (globalResult.value.hits || []).length });
    }

    const globalHits = globalResult.value.hits || [];
    const hits = globalHits.map(hit => ({ ...hit, _source: 'global' })).slice(0, limit);

    return {
      source: hits.length > 0 ? 'global' : 'none',
      indexName: GLOBAL_INDEX,
      hits,
      total: hits.length,
      localHits: 0,
      globalHits: hits.length,
      query,
      limit,
      offset,
      processingTimeMs: globalResult.value.processingTimeMs || 0,
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

async function runWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  });

  await Promise.all(workers);
  return results;
}

/**
 * Performs many searches with bounded parallelism.
 *
 * This is intended for large orders where n8n already extracted a product list.
 * It avoids 20+ sequential HTTP round-trips from the workflow while preserving
 * the same local->global fallback semantics per product.
 *
 * @param {Array<Object|string>} queries - Search queries or item objects
 * @param {string} slug - Store slug for local index
 * @param {number} limit - Maximum results per query
 * @param {number} offset - Offset for pagination
 * @param {number} concurrency - Maximum parallel searches
 * @returns {Promise<Object>} Batch search results
 */
async function searchBatchWithFallback(queries, slug, limit = 10, offset = 0, concurrency = 8) {
  const startedAt = Date.now();
  const safeConcurrency = Math.max(1, Math.min(parseInt(concurrency, 10) || 8, 20));
  const normalized = queries.map((item, index) => {
    if (typeof item === 'string') {
      return { index, query: item.trim(), input: item };
    }
    return {
      index,
      query: String(item.query || item.nombre || item.name || item.text || '').trim(),
      input: item,
    };
  });

  logger.info('Batch search request', {
    slug,
    count: normalized.length,
    limit,
    offset,
    concurrency: safeConcurrency,
  });

  const results = await runWithConcurrency(normalized, safeConcurrency, async (item) => {
    if (!item.query) {
      return {
        index: item.index,
        query: item.query,
        input: item.input,
        success: false,
        error: 'empty_query',
      };
    }

    try {
      const result = await searchWithFallback(item.query, slug, limit, offset);
      return {
        index: item.index,
        query: item.query,
        input: item.input,
        success: true,
        data: result,
      };
    } catch (error) {
      logger.warn('Batch item search failed', {
        slug,
        index: item.index,
        query: item.query,
        error: error.message,
      });
      return {
        index: item.index,
        query: item.query,
        input: item.input,
        success: false,
        error: error.message,
      };
    }
  });

  const successCount = results.filter(item => item && item.success).length;
  const failedCount = results.length - successCount;

  return {
    slug,
    count: results.length,
    successCount,
    failedCount,
    limit,
    offset,
    concurrency: safeConcurrency,
    processingTimeMs: Date.now() - startedAt,
    results,
  };
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
  searchBatchWithFallback,
  healthCheck,
};
