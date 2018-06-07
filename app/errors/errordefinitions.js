'use strict';

var _ = require('lodash');

var ClientError = require('./clienterror');

var errors = {
  PARTNER_ALREADY_EXISTS: 'Partner already exists',
  PARTNER_NOT_FOUND: 'Patner not found',
};

var errorObjects = _.fromPairs(_.map(errors, function(msg, code) {
    return  [code, new ClientError(code, msg)];
  }));

errorObjects.codes = _.mapValues(errors, function(msg, code) {
   return code;
});

module.exports = errorObjects;
