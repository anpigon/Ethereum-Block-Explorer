var Partner = function() {};

Partner.create = function(opts) {
  opts = opts || {};

  var x = new Partner();
  x.createdOn = Math.floor(Date.now() / 1000);
  x.partnerId = opts.partnerId;
  x.passwd = opts.passwd;
  x.partnerName = opts.partnerName;
  x.partnerCode = opts.partnerCode;
  x.status = opts.status || 'normal';
  return x;
};

Partner.fromObj = function(obj) {
  return this.create(obj);
};

module.exports = Partner;