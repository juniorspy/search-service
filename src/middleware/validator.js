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
  validate,
};
