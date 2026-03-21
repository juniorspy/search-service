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
    // Search both indexes in parallel
    const localIndex = meilisearchClient.index(localIndexName);
    const globalIndex = meilisearchClient.index(GLOBAL_INDEX);

    const [localResult, globalResult] = await Promise.allSettled([
      localIndex.search(query, { limit, offset }),
      globalIndex.search(query, { limit, offset }),
    ]);

    const localHits = localResult.status === 'fulfilled' ? localResult.value.hits || [] : [];
    const globalHits = globalResult.status === 'fulfilled' ? globalResult.value.hits || [] : [];

    if (localResult.status === 'rejected') {
      logger.warn('Local index search failed', { localIndexName, error: localResult.reason.message });
    } else {
      logger.info('Local search completed', { indexName: localIndexName, totalHits: localHits.length });
    }

    if (globalResult.status === 'rejected') {
      logger.warn('Global index search failed', { indexName: GLOBAL_INDEX, error: globalResult.reason.message });
    } else {
      logger.info('Global search completed', { indexName: GLOBAL_INDEX, totalHits: globalHits.length });
    }

    // Tag each hit with its source
    const taggedLocal = localHits.map(hit => ({ ...hit, _source: 'local' }));
    const taggedGlobal = globalHits.map(hit => ({ ...hit, _source: 'global' }));

    // Merge: local first, then global (deduplicated by normalized name)
    const seenNames = new Set();
    const merged = [];

    // Add local hits first (they have confirmed prices)
    for (const hit of taggedLocal) {
      const key = (hit.nombre || hit.name || '').toLowerCase().trim();
      if (key) seenNames.add(key);
      merged.push(hit);
    }

    // Add global hits that aren't duplicates of local
    for (const hit of taggedGlobal) {
      const key = (hit.nombre || hit.name || '').toLowerCase().trim();
      if (!seenNames.has(key)) {
        seenNames.add(key);
        merged.push(hit);
      }
    }

    const hits = merged.slice(0, limit);
    const source = taggedLocal.length > 0 && taggedGlobal.length > 0
      ? 'mixed'
      : taggedLocal.length > 0 ? 'local'
      : taggedGlobal.length > 0 ? 'global'
      : 'none';

    return {
      source,
      hits,
      total: hits.length,
      localHits: taggedLocal.length,
      globalHits: taggedGlobal.length,
      query,
      limit,
      offset,
      processingTimeMs: Math.max(
        localResult.status === 'fulfilled' ? localResult.value.processingTimeMs || 0 : 0,
        globalResult.status === 'fulfilled' ? globalResult.value.processingTimeMs || 0 : 0,
      ),
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
