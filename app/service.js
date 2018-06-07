'use strict';

var $ = require('preconditions').singleton();
var _ = require('lodash');
var async = require('async');
var config = require('../config');

var log = require('npmlog');
log.debug = log.verbose;
log.disableColor();

var EmailValidator = require('email-validator');
var Stringify = require('json-stable-stringify');

// var Common = require('./common');
// var Utils = Common.Utils;
// var Constants = Common.Constants;
// var Defaults = Common.Defaults;

var ClientError = require('./errors/clienterror');
var Errors = require('./errors/errordefinitions');

var Lock = require('./lock');
var Storage = require('./storage');

// var request = require('request');

var Model = require('./model');
var Wallet = Model.Wallet;

var initialized = false;

var lock;
var storage;

/**
 * 
 * @constructor
 */
function Service() {
  if (!initialized)
    throw new Error('Server not initialized');

  this.lock = lock;
  this.storage = storage;
  this.notifyTicker = 0;
};

function checkRequired(obj, args, cb) {
  var missing = Utils.getMissingFields(obj, args);
  if (_.isEmpty(missing)) return true;
  if (_.isFunction(cb))
    cb(new ClientError('Required argument ' + _.first(missing) + ' missing.'));
  return false;
};

Service.initialize = function (opts, cb) {
  $.shouldBeFunction(cb);

  opts = opts || {};
  lock = opts.lock || new Lock(opts.lockOpts);
  if (opts.request) request = opts.request;

  if (opts.storage) {
    storage = opts.storage;
    return cb();
  } else {
    var newStorage = new Storage();
    newStorage.connect(opts.storageOpts, function (err) {
      if (err) return cb(err);
      storage = newStorage;
      initialized = true;
      return cb();
    });
  }
};

Service.handleIncomingNotification = function (notification, cb) {
  cb = cb || function () {};

  if (!notification || notification.type != 'NewBlock') return cb();

  Service._clearBlockchainHeightCache(notification.data.coin, notification.data.network);
  return cb();
};


Service.shutDown = function (cb) {
  if (!initialized) return cb();
  storage.disconnect(function (err) {
    if (err) return cb(err);
    initialized = false;
    return cb();
  });
};

/**
 * Gets an instance of the server without authentication.
 * @param {Object} opts
 * @param {string} opts.clientVersion - A string that identifies the client issuing the request
 */
Service.getInstance = function () {
  try {
    var server = new Service();
    return server;
  } catch(err) {
    log.error(err);
  }
  return null;
};

/**
 * Gets an instance of the server after authenticating the copayer.
 * @param {Object} opts
 * @param {string} opts.copayerId - The copayer id making the request.
 * @param {string} opts.message - (Optional) The contents of the request to be signed. Only needed if no session token is provided.
 * @param {string} opts.signature - (Optional) Signature of message to be verified using one of the copayer's requestPubKeys. Only needed if no session token is provided.
 * @param {string} opts.session - (Optional) A valid session token previously obtained using the #login method
 * @param {string} opts.clientVersion - A string that identifies the client issuing the request
 * @param {string} [opts.walletId] - The wallet id to use as current wallet for this request (only when copayer is support staff).
 */
Service.getInstanceWithAuth = function (opts, cb) {
  function withSignature(cb) {
    if (!checkRequired(opts, ['copayerId', 'message', 'signature'], cb)) return;

    var server;
    try {
      server = Service.getInstance(opts);
    } catch (ex) {
      return cb(ex);
    }

    server.storage.fetchCopayerLookup(opts.copayerId, function (err, copayer) {
      if (err) return cb(err);
      if (!copayer) return cb(new ClientError(Errors.codes.NOT_AUTHORIZED, 'Copayer not found'));

      if (!copayer.isSupportStaff) {
        var isValid = !!server._getSigningKey(opts.message, opts.signature, copayer.requestPubKeys);
        if (!isValid)
          return cb(new ClientError(Errors.codes.NOT_AUTHORIZED, 'Invalid signature'));
        server.walletId = copayer.walletId;
      } else {
        server.walletId = opts.walletId || copayer.walletId;
        server.copayerIsSupportStaff = true;
      }

      server.copayerId = opts.copayerId;
      return cb(null, server);
    });
  };

  function withSession(cb) {
    if (!checkRequired(opts, ['copayerId', 'session'], cb)) return;

    var server;
    try {
      server = Service.getInstance(opts);
    } catch (ex) {
      return cb(ex);
    }

    server.storage.getSession(opts.copayerId, function (err, s) {
      if (err) return cb(err);

      var isValid = s && s.id == opts.session && s.isValid();
      if (!isValid) return cb(new ClientError(Errors.codes.NOT_AUTHORIZED, 'Session expired'));

      server.storage.fetchCopayerLookup(opts.copayerId, function (err, copayer) {
        if (err) return cb(err);
        if (!copayer) return cb(new ClientError(Errors.codes.NOT_AUTHORIZED, 'Copayer not found'));

        server.copayerId = opts.copayerId;
        server.walletId = copayer.walletId;
        return cb(null, server);
      });
    });
  };

  var authFn = opts.session ? withSession : withSignature;
  return authFn(cb);
};

Service.prototype._runLocked = function (cb, task, waitTime) {
  this.lock.runLocked(this.walletId, cb, task, waitTime);
};


Service.prototype.logi = function () {
  if (!this) return log.info.apply(this, arguments);
  if (!this.walletId) return log.info.apply(this, arguments);

  var args = [].slice.call(arguments);
  args.unshift('<' + this.walletId + '>');
  log.info.apply(this, args);
};


Service.prototype.logw = function () {
  if (!this) return log.info.apply(this, arguments);
  if (!this.walletId) return log.info.apply(this, arguments);

  var args = [].slice.call(arguments);
  args.unshift('<' + this.walletId + '>');
  log.warn.apply(this, args);
};


Service.prototype.login = function (opts, cb) {
  var self = this;

  var session;
  async.series([

    function (next) {
      self.storage.getSession(self.copayerId, function (err, s) {
        if (err) return next(err);
        session = s;
        next();
      });
    },
    function (next) {
      if (!session || !session.isValid()) {
        session = Model.Session.create({
          copayerId: self.copayerId,
          walletId: self.walletId,
        });
      } else {
        session.touch();
      }
      next();
    },
    function (next) {
      self.storage.storeSession(session, next);
    },
  ], function (err) {
    if (err) return cb(err);
    if (!session) return cb(new Error('Could not get current session for this copayer'));

    return cb(null, session.id);
  });
};

Service.prototype.logout = function (opts, cb) {
  var self = this;

  self.storage.removeSession(self.copayerId, cb);
};

/**
 * 제휴사 신규 가입
 * @param {*} opts 
 * @param {*} cb 
 */
Service.prototype.joinPartner = function (opts, cb) {
  var self = this;
  self.storage.insertPartner(opts, function (err, ret) {
    return cb(err, ret);
  });
};

/**
 * Creates a new wallet.
 * @param {Object} opts
 * @param {string} opts.id - The wallet id.
 * @param {string} opts.name - The wallet name.
 * @param {number} opts.m - Required copayers.
 * @param {number} opts.n - Total copayers.
 * @param {string} opts.pubKey - Public key to verify copayers joining have access to the wallet secret.
 * @param {string} opts.singleAddress[=false] - The wallet will only ever have one address.
 * @param {string} opts.coin[='btc'] - The coin for this wallet (btc, bch).
 * @param {string} opts.network[='livenet'] - The Bitcoin network for this wallet.
 * @param {string} opts.supportBIP44AndP2PKH[=true] - Client supports BIP44 & P2PKH for new wallets.
 */
Service.prototype.createWallet = function (opts, cb) {
  var self = this,
    pubKey;

  if (!checkRequired(opts, ['name', 'm', 'n', 'pubKey'], cb)) return;

  if (_.isEmpty(opts.name)) return cb(new ClientError('Invalid wallet name'));
  if (!Wallet.verifyCopayerLimits(opts.m, opts.n))
    return cb(new ClientError('Invalid combination of required copayers / total copayers'));

  opts.coin = opts.coin || Defaults.COIN;
  if (!Utils.checkValueInCollection(opts.coin, Constants.COINS))
    return cb(new ClientError('Invalid coin'));

  opts.network = opts.network || 'livenet';
  if (!Utils.checkValueInCollection(opts.network, Constants.NETWORKS))
    return cb(new ClientError('Invalid network'));

  opts.supportBIP44AndP2PKH = _.isBoolean(opts.supportBIP44AndP2PKH) ? opts.supportBIP44AndP2PKH : true;

  var derivationStrategy = opts.supportBIP44AndP2PKH ? Constants.DERIVATION_STRATEGIES.BIP44 : Constants.DERIVATION_STRATEGIES.BIP45;
  var addressType = (opts.n == 1 && opts.supportBIP44AndP2PKH) ? Constants.SCRIPT_TYPES.P2PKH : Constants.SCRIPT_TYPES.P2SH;


  var newWallet;
  async.series([

    function (acb) {
      if (!opts.id)
        return acb();

      self.storage.fetchWallet(opts.id, function (err, wallet) {
        if (wallet) return acb(Errors.WALLET_ALREADY_EXISTS);
        return acb(err);
      });
    },
    function (acb) {
      var wallet = Wallet.create({
        id: opts.id,
        name: opts.name,
        m: opts.m,
        n: opts.n,
        coin: opts.coin,
        network: opts.network,
        pubKey: pubKey.toString(),
        singleAddress: !!opts.singleAddress,
        derivationStrategy: derivationStrategy,
        addressType: addressType,
      });
      self.storage.storeWallet(wallet, function (err) {
        self.logi('Wallet created', wallet.id, opts.network);
        newWallet = wallet;
        return acb(err);
      });
    }
  ], function (err) {
    return cb(err, newWallet ? newWallet.id : null);
  });
};

/**
 * Retrieves a wallet from storage.
 * @param {Object} opts
 * @returns {Object} wallet
 */
Service.prototype.getWallet = function (opts, cb) {
  var self = this;

  self.storage.fetchWallet(self.walletId, function (err, wallet) {
    if (err) return cb(err);
    if (!wallet) return cb(Errors.WALLET_NOT_FOUND);
    return cb(null, wallet);
  });
};

/**
 * Retrieves a wallet from storage.
 * @param {Object} opts
 * @param {string} opts.identifier - The identifier associated with the wallet (one of: walletId, address, txid).
 * @returns {Object} wallet
 */
Service.prototype.getWalletFromIdentifier = function (opts, cb) {
  var self = this;

  if (!opts.identifier) return cb();

  var walletId;
  async.parallel([

    function (done) {
      self.storage.fetchWallet(opts.identifier, function (err, wallet) {
        if (wallet) walletId = wallet.id;
        return done(err);
      });
    },
    function (done) {
      self.storage.fetchAddressByCoin(Defaults.COIN, opts.identifier, function (err, address) {
        if (address) walletId = address.walletId;
        return done(err);
      });
    },
    function (done) {
      self.storage.fetchTxByHash(opts.identifier, function (err, tx) {
        if (tx) walletId = tx.walletId;
        return done(err);
      });
    },
  ], function (err) {
    if (err) return cb(err);
    if (walletId) {
      return self.storage.fetchWallet(walletId, cb);
    }

    var re = /^[\da-f]+$/gi;
    if (!re.test(opts.identifier)) return cb();

    // Is identifier a txid form an incomming tx?
    var coinNetworkPairs = [];
    _.each(_.values(Constants.COINS), function (coin) {
      _.each(_.values(Constants.NETWORKS), function (network) {
        coinNetworkPairs.push({
          coin: coin,
          network: network
        });
      });
    });
    
  });
};

/**
 * Retrieves wallet status.
 * @param {Object} opts
 * @param {Object} opts.twoStep[=false] - Optional: use 2-step balance computation for improved performance
 * @param {Object} opts.includeExtendedInfo - Include PKR info & address managers for wallet & copayers
 * @returns {Object} status
 */
Service.prototype.getStatus = function (opts, cb) {
  var self = this;

  opts = opts || {};

  var status = {};
  async.parallel([

    function (next) {
      self.getWallet({}, function (err, wallet) {
        if (err) return next(err);

        var walletExtendedKeys = ['publicKeyRing', 'pubKey', 'addressManager'];
        var copayerExtendedKeys = ['xPubKey', 'requestPubKey', 'signature', 'addressManager', 'customData'];

        wallet.copayers = _.map(wallet.copayers, function (copayer) {
          if (copayer.id == self.copayerId) return copayer;
          return _.omit(copayer, 'customData');
        });
        if (!opts.includeExtendedInfo) {
          wallet = _.omit(wallet, walletExtendedKeys);
          wallet.copayers = _.map(wallet.copayers, function (copayer) {
            return _.omit(copayer, copayerExtendedKeys);
          });
        }
        status.wallet = wallet;
        next();
      });
    },
    function (next) {
      self.getBalance(opts, function (err, balance) {
        if (err) return next(err);
        status.balance = balance;
        next();
      });
    },
    function (next) {
      self.getPendingTxs({}, function (err, pendingTxps) {
        if (err) return next(err);
        status.pendingTxps = pendingTxps;
        next();
      });
    },
    function (next) {
      self.getPreferences({}, function (err, preferences) {
        if (err) return next(err);
        status.preferences = preferences;
        next();
      });
    },
  ], function (err) {
    if (err) return cb(err);
    return cb(null, status);
  });
};

/**
 * Get all addresses.
 * @param {Object} opts
 * @param {Numeric} opts.limit (optional) - Limit the resultset. Return all addresses by default.
 * @param {Boolean} [opts.reverse=false] (optional) - Reverse the order of returned addresses.
 * @returns {Address[]}
 */
Service.prototype.getMainAddresses = function (opts, cb) {
  var self = this;

  opts = opts || {};
  self.storage.fetchAddresses(self.walletId, function (err, addresses) {
    if (err) return cb(err);

    var onlyMain = _.reject(addresses, {
      isChange: true
    });
    if (opts.reverse) onlyMain.reverse();
    if (opts.limit > 0) onlyMain = _.take(onlyMain, opts.limit);

    return cb(null, onlyMain);
  });
};


module.exports = Service;
module.exports.ClientError = ClientError;