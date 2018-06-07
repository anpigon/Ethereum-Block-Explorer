var express = require('express');
var log = require('npmlog');
var _ = require('lodash');

var Service = require('../service');

var router = express.Router();

/* GET home page. */
router.get('/', function(req, res, next) {
  console.log('home');
  //res.render('index', { title: 'Express' });
  res.redirect('/join');
});

// 제휴사 가입 페이지
router.get('/join', function(req, res, next) {
  res.render('join', { title: '제휴사 가입' });
});

// 제휴사 가입 요청
router.post('/join', function(req, res, next) {
  console.log('/join', req.body);

  var server = Service.getInstance();
  // console.log(server);

  server.joinPartner(req.body, function(err, ret) {
    if(err) {
      // throw new Error(err);
      res.status(err.status || 500).json({
        code: err.code,
        message: err.message,
      }).end();
    }
    res.json(ret).end();
  });
  
});

module.exports = router;
