const express = require('express');
const searchController = require('../controllers/searchController');
const { searchValidationRules, validate } = require('../middleware/validator');

const router = express.Router();

/**
 * POST /api/v1/search
 * Search endpoint with local→global fallback
 */
router.post(
  '/search',
  searchValidationRules(),
  validate,
  searchController.search
);

/**
 * GET /health
 * Health check endpoint
 */
router.get('/health', searchController.health);

module.exports = router;
