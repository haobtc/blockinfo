var Defer = require('./defer');
var Config = require('./config');
var RpcClient = require('./rpcclient');
var express = require('express');
var mongoStore = require('./mongostore');
mongoStore.initialize();

var app = express();

app.use(express.bodyParser());
app.use(app.router);
app.use(express.static('public'));
app.use(function(err, req, res, next){
    console.error(err.stack);
    res.send({error: true});
});

function sendJSONP(req, res, obj) {
    if(req.query.callback && /^\w+$/.test(req.query.callback)) {
	res.set('Content-Type', 'text/javascript');
	res.send(req.query.callback + '(' + JSON.stringify(obj) + ');');
    } else {
	res.send(obj);
    }
}

app.get('/api/v1/tx/details', function(req, res) {
    var defer = Defer();
    function getTx(network) {
	if(!req.query[network]) {
	    return;
	}
	var hashList = req.query[network].split(',');
	var store = mongoStore.stores[network];
	var d = Defer();
	store.getTx(hashList, function(err, txes) {
	    if(txes && txes.length > 0) {
		d.avail.apply(null, txes);
	    }
	});
	return d;
    }

    var childDefers = [];
    for(var network in mongoStore.stores) {
	var d = getTx(network);
	if(d) {
	    childDefers.push(d);
	}
    }
    if(childDefers.length > 0) {
	defer.wait(childDefers, {flatten: true});
	defer.then(function(results) {
	    sendJSONP(req, res, results);
	});
    } else {
	sendJSONP(req, res, []);
    }
});

app.get('/api/v1/unspent', function(req, res){
    var addressList = req.query.addresses.split(',');
    var storeDict = mongoStore.getStoreDict(addressList);
    
    function getUnspent(network) {
	var s = storeDict[network];
	var d = Defer();
	s.store.getUnspent(s.arr, function(err, outputs) {
	    outputs = outputs || [];
	    s.store.getMempool(s.arr, function(err, outputsInMemPool) {
		// FIXME: handle err
		outputsInMemPool.forEach(function(tx) {
		    outputs.push(tx);
		});
		d.avail.apply(null, outputs);
	    });
	});
	return d;
    }
    var childDefers = [];
    for(var network in storeDict) {
	var d = getUnspent(network);
	childDefers.push(d);
    }
    var defer = Defer();
    defer.wait(childDefers, {flatten: true});
    defer.then(function(outputs) {
	sendJSONP(req, res, outputs);
    });
});


// coin RPC proxies
var jsonpWhiteList = {"sendrawtransaction": true,
		      "getrawtransaction": true};
app.get('/api/v1/rpc/:network/:command', function(req, res) {
    if(!jsonpWhiteList[req.params.command]) {
        res.send({error:"rpc not allowed", result:null});
        return;
    }
    var client = new RpcClient(Config.networks[req.params.network].rpcserver);
    var args = req.query.args || '[]';
    client.rpc(req.params.command, JSON.parse(args), function(err, btcres) {
	if(err) {
	    console.error('error', err);
	} 
	sendJSONP(req, res, btcres.body);
    });
});

var proxyWhiteList = {"sendrawtransaction": true,
		      "getrawmempool": true,
		      "getrawtransaction": true,
		      "decoderawtransaction": true};
app.post('/api/v1/proxy/:network', function(req, res) {
/*    if(!proxyWhiteList[req.body.method]) {
        res.send({error:"rpc not allowed", result:null});
        return;
    } */
    var client = new RpcClient(Config.networks[req.params.network].rpcserver);
    client.rpc(req.body.method, req.body.params, function(err, btcres) {
	if(err) {
	    console.error('error', err);
	} 
	res.send(btcres.body);
    });
});

module.exports.httpServer = app;