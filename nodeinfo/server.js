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

app.get('/tx/:txHash', function(req, res) {
    var d = Defer();
    var childDefers = [];

    function getTx(coin) {
	var store = mongoStore.stores[coin];
	var d1 = Defer();
	childDefers.push(d1);
	store.getTx(req.params.txHash, function(err, tx) {
	    console.info('txHash', err, tx, coin);
	    d1.avail(tx);
	});
    }

    for(var coin in mongoStore.stores) {
	getTx(coin);
    }
    d.wait(childDefers);
    d.then(function(arr) {
	var resTxs = [];
	arr.forEach(function(tx) {
	    if(tx) {
		resTxs.push(tx);
	    }
	});
	res.send(resTxs);
    });
});

app.get('/unspent/:address', function(req, res) {
    var store = mongoStore.getStoreByAddress(req.params.address);
    store.getUnspent(req.params.address, function(err, outputs) {
	res.send(outputs);
    });
});

module.exports.httpServer = app;