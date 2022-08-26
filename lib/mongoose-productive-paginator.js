const util = require('util');

const defaultOptions = {
  customLabels: {
    totalDocs: 'totalDocs',
    docs: 'docs',
    limit: 'limit',
    page: 'page',
    totalPages: 'totalPages',
    nextPage: 'nextPage',
    prevPage: 'prevPage',
    pagingCounter: 'pagingCounter',
    hasPrevPage: 'hasPrevPage',
    hasNextPage: 'hasNextPage',
    meta: null,
  },
  limit: '10',
  aggregateOptions: {},
  pagination: true,
  useFacet: true,
  debug: false,
};

const COUNT_KEY = 'countDocuments';
const RADIX = 10;

function showDebugInfo(opts, countDocumentsOperators, documentsOperators) {
  const inspectOpts = { showHidden: false, depth: null, colors: true };

  console.log(
    `[Paginate Options]\n${util.inspect(opts, inspectOpts)}`
    + `\n[Count Aggregation Pipeline]\n${util.inspect(countDocumentsOperators, inspectOpts)}`
    + `\n[Documents Aggregation Pipeline]\n${util.inspect(documentsOperators, inspectOpts)}`,
  );
}

function concatOperators(previous, current) {
  return Array.isArray(current) ? [...previous, ...current] : [...previous, ...[current]];
}

function fixOperators(operators) {
  return typeof operators !== 'object' || operators === null ? [] : operators;
}

function hasOwnProperty(opts, property) {
  return Object.prototype.hasOwnProperty.call(opts, property);
}

function aggregatePaginate(conditionsPipeline, sortPipeline, docsPipeline, options, callback) {
  const opts = { ...defaultOptions, ...aggregatePaginate.options, ...options };
  const customLabels = { ...defaultOptions.customLabels, ...opts.customLabels };
  const conditions = fixOperators(conditionsPipeline);
  const sort = fixOperators(sortPipeline);
  const query = fixOperators(docsPipeline);

  const numericLimit = parseInt(hasOwnProperty(opts, 'limit') ? String(opts.limit) : '0', RADIX);
  const numericPage = parseInt(hasOwnProperty(opts, 'page') ? String(opts.page) : '1', RADIX);
  let limit = numericLimit > 0 ? numericLimit : 10;
  let page = numericPage > 0 ? numericPage : 1;
  let promise; let skip; let offset;

  if (hasOwnProperty(opts, 'page')) {
    skip = (page - 1) * limit;
  } else if (hasOwnProperty(opts, 'offset')) {
    const numericOffset = parseInt(String(opts.offset), RADIX);
    offset = numericOffset >= 0 ? numericOffset : 0;
    skip = offset;
  } else {
    offset = 0;
    page = 1;
    skip = 0;
  }

  const isPaginationEnabled = opts.pagination !== false;
  const documentsOperatorsArray = [conditions, sort];

  if (isPaginationEnabled) {
    documentsOperatorsArray.push([{ $skip: skip }, { $limit: limit }]);
  }

  const documentsOperators = [...documentsOperatorsArray, query].reduce(concatOperators, []);
  const countDocumentsOperators = [conditions, { $count: COUNT_KEY }].reduce(concatOperators, []);

  if (opts.debug === true) {
    showDebugInfo(opts, countDocumentsOperators, documentsOperators);
  }

  if (opts.useFacet === true) {
    promise = this.aggregate()
      .option(opts.aggregateOptions)
      .facet({
        docs: documentsOperators,
        count: countDocumentsOperators,
      })
      .exec()
      .then(([{ docs, count }]) => [docs, count]);
  } else {
    promise = Promise.all([
      this.aggregate(documentsOperators).option(opts.aggregateOptions).exec(),
      this.aggregate(countDocumentsOperators).option(opts.aggregateOptions).exec(),
    ]);
  }

  return promise
    .then((values) => {
      const count = values[1][0][COUNT_KEY];

      if (!isPaginationEnabled) {
        limit = count;
        page = 1;
      }

      const pages = Math.ceil(count / limit) || 1;
      const meta = {
        [customLabels.totalDocs]: count,
        [customLabels.limit]: limit,
        [customLabels.page]: page,
        [customLabels.totalPages]: pages,
        [customLabels.pagingCounter]: (page - 1) * limit + 1,
        [customLabels.hasPrevPage]: false,
        [customLabels.hasNextPage]: false,
      };

      let result = {
        [customLabels.docs]: values[0],
      };

      if (typeof offset !== 'undefined') {
        page = Math.ceil((offset + 1) / limit);

        meta.offset = offset;
        meta[customLabels.page] = Math.ceil((offset + 1) / limit);
        meta[customLabels.pagingCounter] = offset + 1;
      }

      if (page > 1) {
        meta[customLabels.hasPrevPage] = true;
        meta[customLabels.prevPage] = page - 1;
      }

      if (page < pages) {
        meta[customLabels.hasNextPage] = true;
        meta[customLabels.nextPage] = page + 1;
      }

      if (customLabels.meta) {
        result[customLabels.meta] = meta;
      } else {
        result = Object.assign(meta, result);
      }

      if (typeof callback === 'function') {
        return callback(null, result);
      }

      return result;
    })
    .catch((err) => {
      if (typeof callback === 'function') {
        return callback(err);
      }

      return Promise.reject(err);
    });
}

module.exports = aggregatePaginate;
