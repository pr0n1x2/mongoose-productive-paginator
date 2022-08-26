const mongoose = require('mongoose');
const aggregatePaginate = require('./lib/mongoose-productive-paginator');

module.exports = function (schema) {
  // eslint-disable-next-line no-param-reassign
  schema.statics.aggregatePaginate = aggregatePaginate;

  mongoose.Aggregate.prototype.paginateExec = function (conditions, sort, query, options, callback) {
    return this.model().aggregatePaginate(this, conditions, sort, query, options, callback);
  };
};

module.exports.aggregatePaginate = aggregatePaginate;
