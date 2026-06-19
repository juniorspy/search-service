const { body, validationResult } = require('express-validator');

/**
 * Validation rules for search endpoint
 */
const searchValidationRules = () => {
  return [
    body('query')
      .isString()
      .trim()
      .notEmpty()
      .withMessage('Query is required and must be a non-empty string'),
    body('slug')
      .isString()
      .trim()
      .notEmpty()
      .withMessage('Slug is required and must be a non-empty string')
      .matches(/^[a-z0-9_-]+$/)
      .withMessage('Slug must contain only lowercase letters, numbers, hyphens and underscores'),
    body('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be an integer between 1 and 100'),
    body('offset')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Offset must be a non-negative integer'),
  ];
};

/**
 * Validation rules for batch search endpoint
 */
const batchSearchValidationRules = () => {
  return [
    body('queries')
      .isArray({ min: 1, max: 50 })
      .withMessage('Queries must be an array with 1 to 50 items'),
    body('queries.*')
      .custom((value) => {
        if (typeof value === 'string') return value.trim().length > 0;
        if (!value || typeof value !== 'object') return false;
        const query = value.query || value.nombre || value.name || value.text;
        return typeof query === 'string' && query.trim().length > 0;
      })
      .withMessage('Each query must be a non-empty string or an object with query/nombre/name/text'),
    body('slug')
      .isString()
      .trim()
      .notEmpty()
      .withMessage('Slug is required and must be a non-empty string')
      .matches(/^[a-z0-9_-]+$/)
      .withMessage('Slug must contain only lowercase letters, numbers, hyphens and underscores'),
    body('limit')
      .optional()
      .isInt({ min: 1, max: 50 })
      .withMessage('Limit must be an integer between 1 and 50'),
    body('offset')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Offset must be a non-negative integer'),
    body('concurrency')
      .optional()
      .isInt({ min: 1, max: 20 })
      .withMessage('Concurrency must be an integer between 1 and 20'),
  ];
};

/**
 * Middleware to validate request and return errors
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array().map(err => ({
        field: err.path,
        message: err.msg,
      })),
    });
  }
  next();
};

module.exports = {
  searchValidationRules,
  batchSearchValidationRules,
  validate,
};
