'use strict';

var $ = require('preconditions').singleton();
var _ = require('lodash');
var async = require('async');
var mongodb = require('mongodb');

var Model = require('./model');
var Errors = require('./errors/errordefinitions');

var log = require('npmlog');
log.debug = log.verbose;
// log.disableColor();

// Table 정의
var collections = {
  PARTNERS: 'partners',
  USERS: 'users',
  WALLETS: 'wallets',
  TXS: 'txs',
  ADDRESSES: 'addresses',
  NOTIFICATIONS: 'notifications',
  COPAYERS_LOOKUP: 'copayers_lookup',
  PREFERENCES: 'preferences',
  EMAIL_QUEUE: 'email_queue',
  CACHE: 'cache',
  FIAT_RATES: 'fiat_rates',
  TX_NOTES: 'tx_notes',
  SESSIONS: 'sessions',
  PUSH_NOTIFICATION_SUBS: 'push_notification_subs',
  TX_CONFIRMATION_SUBS: 'tx_confirmation_subs',
};

var Storage = function (opts) {
  opts = opts || {};
  this.db = opts.db;
};

Storage.prototype._createIndexes = function () {
  // console.log(this.db);
  this.db.collection(collections.PARTNERS).createIndex({
    partnerId: 1
  });
};

// 몽고DB 연결
Storage.prototype.connect = function (opts, cb) {
  var self = this;

  opts = opts || {};

  if (this.db) return cb();

  var config = opts.mongoDb || {};
  log.info('mongoDB connect: ' + config.uri);
  mongodb.MongoClient.connect(config.uri, function (err, client) {
    if (err) {
      log.error('Unable to connect to the mongoDB. Check the credentials.');
      return cb(err);
    }

    self.db = client.db();
    self._createIndexes();
    log.info('Connection established to mongoDB');
    return cb();
  });
};

// 몽고DB 연결 해제
Storage.prototype.disconnect = function (cb) {
  var self = this;
  this.db.close(true, function (err) {
    if (err) return cb(err);
    self.db = null;
    return cb();
  });
};

/**
 * 파트너 데이터 등록
 * @param {*} patner 
 * @param {*} cb 
 */
Storage.prototype.insertPartner = function (opts, cb) {
  var self = this;
  var patner = Model.Partner.create(opts);

  console.log('PARTNER_ALREADY_EXISTS', Errors, Errors.codes);

  async.series([

    // 파트너ID가 등록되어 있는지 체크
    function (next) {
      self.db.collection(collections.PARTNERS).findOne({
        partnerId: patner.partnerId
      }, function(err, result) {
        if (err) return next(err);
        if (result) return next(Errors.PARTNER_ALREADY_EXISTS);
        next();
      });
    },

    // 파트너 정보 등록
    function (next) {
      self.db.collection(collections.PARTNERS).insert(patner, {
        w: 1
      }, function(err, result) {
        next(err, result);
      });
    }

  ], function(err, result) {
    cb(err, _.first(_.compact(result)));
  });

};

Storage.prototype.fetchPartner = function (patnerCd, cb) {
  this.db.collection(collections.PARTNERS).find({
    patnerCd: patnerCd,
  }).toArray(function (err, result) {
    if (err) return cb(err);
    if (!result || _.isEmpty(result)) return cb(null, []);
    return cb(null, result);
  });
};

Storage.collections = collections;
module.exports = Storage;