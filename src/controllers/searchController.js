const searchService = require('../services/searchService');
const logger = require('../config/logger');

/**
 * Handle search requests with local→global fallback
 *
 * @route POST /api/v1/search
 */
async function search(req, res, next) {
  try {
    const { query, slug, limit = 20, offset = 0 } = req.body;

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
      slug,
      limit = 10,
      offset = 0,
      concurrency = process.env.BATCH_CONCURRENCY || 8,
    } = req.body;

    logger.info('Processing batch search request', {
      slug,
      count: Array.isArray(queries) ? queries.length : 0,
      limit,
      offset,
      concurrency,
    });

    const result = await searchService.searchBatchWithFallback(
      queries,
      slug,
      parseInt(limit),
      parseInt(offset),
      parseInt(concurrency)
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
