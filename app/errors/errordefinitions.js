'use strict';

var _ = require('lodash');

var ClientError = require('./clienterror');

var errors = {
  PARTNER_ALREADY_EXISTS: '동일한 아이디가 존재합니다.',
  PARTNER_NOT_FOUND: '가입된 정보가 없습니다.',
  INCORRECT_PASSWORD: '비밀번호가 틀렸습니다.',
};

var errorObjects = _.fromPairs(_.map(errors, function(msg, code) {
    return  [code, new ClientError(code, msg)];
  }));

errorObjects.codes = _.mapValues(errors, function(msg, code) {
   return code;
});

module.exports = errorObjects;
