var Defer = require('./defer');
var express = require('express');
var mongoStore = require('./mongostore');
mongoStore.initialize();

var app = express();

app.use(express.urlencoded());
app.use(app.router);
app.use(express.static('public'));
app.use(function(err, req, res, next){
    console.error(err.stack);
    res.send({error: true});
});

function sendJSONP(req, res, obj) {
    if(req.query.callback && /^\w+$/.test(req.query.callback)) {
	res.send(req.query.callback + '(' + JSON.stringify(obj) + ');');
    } else {
	res.send(obj);
    }
}

app.get('/tx/:txHash', function(req, res) {
    var d = Defer();
    var childDefers = [];

    function getTx(coin) {
	var store = mongoStore.stores[coin];
	var d1 = Defer();
	childDefers.push(d1);
	store.getTx(req.params.txHash, function(err, tx) {
	    d1.avail(tx);
	});
    }

    for(var coin in mongoStore.stores) {
	getTx(coin);
    }
    d.wait(childDefers, {flatten: true});
    d.then(function(results) {
	var realTxes = [];
	results.forEach(function(tx) {
	    if(tx) {
		realTxes.push(tx);
	    }
	});
	if(realTxes.length > 0) {
	    res.send(realTxes[0]);
	} else {
	    res.send(null);
	}
    });
});

app.get('/tx/:coin/:txHash', function(req, res) {
    var store = mongoStore.stores[req.params.coin];
    store.getTx(req.params.txHash, function(err, tx) {
	tx = tx || null;
	sendJSONP(req, res, tx);
    });
});

app.get('/unspent', function(req, res){
    var addressList = req.query.addresses.split(',');
    var storeDict = mongoStore.getStoreDict(addressList);
    
    function getUnspent(coin) {
	var s = storeDict[coin];
	var d = Defer();
	s.store.getUnspent(s.arr, function(err, outputs) {
	    outputs = outputs || [];
	    d.avail.apply(null, outputs);
	});
	return d;
    }
    var childDefers = [];
    for(var coin in storeDict) {
	var d = getUnspent(coin);
	childDefers.push(d);
    }
    var defer = Defer();
    defer.wait(childDefers, {flatten: true});
    defer.then(function(outputs) {
	sendJSONP(req, res, outputs);
    });
});

module.exports.httpServer = app;