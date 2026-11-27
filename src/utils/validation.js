const AppError = require('./AppError');

const MAX_PG_INT = 2147483647;
const MAX_NUMERIC_10_2 = 99999999.99;

/**
 * Strict integer parser: rejects booleans, null, arrays, objects,
 * empty/whitespace strings, non-integers, and values outside PG INT4 range.
 */
const parseStrictInt = (value) => {
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value < -MAX_PG_INT - 1 || value > MAX_PG_INT) {
      return null;
    }
    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!/^-?\d+$/.test(trimmed)) {
      return null;
    }
    const parsed = Number(trimmed);
    if (!Number.isInteger(parsed) || parsed < -MAX_PG_INT - 1 || parsed > MAX_PG_INT) {
      return null;
    }
    return parsed;
  }

  return null;
};

/**
 * Strict finite number parser: rejects booleans, null, arrays, objects,
 * empty/whitespace strings, NaN, and Infinity.
 */
const parseStrictNumber = (value) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed || !/^-?\d+(\.\d+)?$/.test(trimmed)) {
      return null;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const parseStrictPositiveId = (rawId, label = 'ID') => {
  const id = parseStrictInt(rawId);
  if (id === null || id <= 0) {
    throw new AppError(`${label} tidak valid`, 400);
  }
  return id;
};

const escapeLikePattern = (value) => {
  return String(value).replace(/[\\%_]/g, '\\$&');
};

module.exports = {
  MAX_PG_INT,
  MAX_NUMERIC_10_2,
  parseStrictInt,
  parseStrictNumber,
  parseStrictPositiveId,
  escapeLikePattern,
};
