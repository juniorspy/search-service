const searchService = require('../services/searchService');
const logger = require('../config/logger');

function splitMultilineQuery(query) {
  if (typeof query !== 'string') return [];

  return query
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map((line) => {
      const cleaned = line
        .replace(/^[-*]\s+/, '')
        .replace(/^\d+[.)]\s+/, '')
        .trim();

      return {
        query: cleaned || line,
        text: line,
      };
    })
    .filter(item => item.query.length > 0);
}

/**
 * Handle search requests with local→global fallback
 *
 * @route POST /api/v1/search
 */
async function search(req, res, next) {
  try {
    const {
      query,
      queries,
      slug,
      limit = Array.isArray(queries) ? 10 : 20,
      offset = 0,
      concurrency = process.env.BATCH_CONCURRENCY || 8,
    } = req.body;
    const queryLines = Array.isArray(queries) ? [] : splitMultilineQuery(query);
    const batchQueries = Array.isArray(queries) ? queries : queryLines.length > 1 ? queryLines : null;

    if (batchQueries) {
      logger.info('Processing flexible batch search request', {
        slug,
        count: batchQueries.length,
        mode: Array.isArray(queries) ? 'queries' : 'multiline_query',
        limit,
        offset,
        concurrency,
      });

      const result = await searchService.searchBatchWithFallback(
        batchQueries,
        slug,
        parseInt(limit),
        parseInt(offset),
        parseInt(concurrency)
      );

      res.json({
        success: true,
        mode: Array.isArray(queries) ? 'batch' : 'batch_from_query',
        data: result,
      });
      return;
    }

    logger.info('Processing search request', { query, slug, limit, offset });

    const result = await searchService.searchWithFallback(
      query,
      slug,
      parseInt(limit),
      parseInt(offset)
    );

    res.json({
      success: true,
      data: result,
    });

  } catch (error) {
    next(error);
  }
}

/**
 * Handle batch search requests with local->global fallback per item
 *
 * @route POST /api/v1/search/batch
 */
async function searchBatch(req, res, next) {
  try {
    const {
      queries,
      query,
      slug,
      limit = 10,
      offset = 0,
      concurrency = process.env.BATCH_CONCURRENCY || 8,
    } = req.body;
    const normalizedQueries = Array.isArray(queries) ? queries : [query];

    logger.info('Processing batch search request', {
      slug,
      count: normalizedQueries.length,
      limit,
      offset,
      concurrency,
    });

    const result = await searchService.searchBatchWithFallback(
      normalizedQueries,
      slug,
      parseInt(limit),
      parseInt(offset),
      parseInt(concurrency)
    );

    res.json({
      success: true,
      mode: Array.isArray(queries) ? 'batch' : 'single',
      data: result,
    });

  } catch (error) {
    next(error);
  }
}

/**
 * Health check endpoint
 *
 * @route GET /health
 */
async function health(req, res) {
  try {
    const healthStatus = await searchService.healthCheck();

    const statusCode = healthStatus.status === 'healthy' ? 200 : 503;

    res.status(statusCode).json({
      success: healthStatus.status === 'healthy',
      service: 'search-service',
      timestamp: new Date().toISOString(),
      ...healthStatus,
    });

  } catch (error) {
    logger.error('Health check failed', { error: error.message });
    res.status(503).json({
      success: false,
      service: 'search-service',
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
}

module.exports = {
  search,
  searchBatch,
  health,
};
