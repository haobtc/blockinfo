var Defer = require('./defer');
var Config = require('./config');
var RpcClient = require('./rpcclient');
var express = require('express');
var mongoStore = require('./mongostore');
mongoStore.initialize();

var app = express();

var allowCrossDomain = function(req, res, next) {  
    // if the origin was not passed.  
    var origin = (req.headers.origin || "*");  
    
    res.header('Access-Control-Allow-Credentials', true);  
    res.header('Access-Control-Allow-Origin', origin);  
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');  
    res.header('Access-Control-Allow-Headers', 'Set-Cookie, X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Origin, Referer, User-Agent');  
    
    if ("OPTIONS" == req.method) {  
        res.send(200);  
    } else {  
        next();  
    }  
};  
app.use(allowCrossDomain);

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

function getTxDetails(req, res) {
    var defer = Defer();
    var query = req.query;
    if(req.method == 'POST') {
	query = req.body;
    }

    function getTx(network) {
	if(!query[network]) {
	    return;
	}
	var hashList = query[network].split(',');
	var store = mongoStore.stores[network];
	var d = Defer();
	store.getTx(hashList, function(err, txes) {
	    txes = txes || [];
	    store.getTxFromMempool(hashList, function(err, txesInMemPool) {
		txesInMemPool.forEach(function(tx) {
		    txes.push(tx);
		});
		d.avail.apply(null, txes);
	    });
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
}

app.get('/infoapi/v1/tx/details', getTxDetails);
app.post('/infoapi/v1/tx/details', getTxDetails);

function getUnspentList(req, res){
    var query = req.query;
    if(req.method == 'POST') {
	query = req.body;
    }
    if(!query.addresses) {
	res.send([]);
	return;
    }

    var addressList = query.addresses.split(',');
    var storeDict = mongoStore.getStoreDict(addressList);
    
    function getUnspent(network) {
	var s = storeDict[network];
	var d = Defer();
	s.store.getUnspent(s.arr, function(err, outputs) {
	    if(err) {
		console.error(err);
		d.avail();
		return;
	    }
	    outputs = outputs || [];
	    s.store.getUnspentFromMempool(s.arr, function(err, outputsInMemPool, spentInMemPool) {
		if(err) {
		    console.error(err);
		    d.avail();
		    return;
		}
		var unspentOutputs = [];
		outputs.forEach(function(output) {
		    if(!spentInMemPool[output.txid + ':' + output.vout]) {
			unspentOutputs.push(output);
		    }
		});
		outputsInMemPool.forEach(function(output) {
		    if(!spentInMemPool[output.txid + ':' + output.vout]) {
			unspentOutputs.push(output);
		    }
		});
		d.avail.apply(null, unspentOutputs);
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
}

app.get('/infoapi/v1/unspent', getUnspentList);
app.post('/infoapi/v1/unspent', getUnspentList);

var proxyWhiteList = {"getbalance": true, "sendrawtransaction": true,
		      "getrawmempool": true,
		      "getrawtransaction": true,
		      "decoderawtransaction": true};
app.post('/infoapi/v1/rpc/:network', function(req, res) {
    if(!proxyWhiteList[req.body.method]) {
        res.send({error:"rpc not allowed", result:null});
        return;
    }
    var client = new RpcClient(Config.networks[req.params.network].rpcserver);
    client.rpc(req.body.method, req.body.params, function(err, btcres) {
	if(err) {
	    console.error('error on request rpc', err);
	    res.send({error: err.message, result: null});
	} else {
	    res.send(btcres.body);
	}
    });
});

app.post('/infoapi/v1/sendtx/:network', function(req, res) {
    var client = new RpcClient(Config.networks[req.params.network].rpcserver);
    client.rpc('sendrawtransaction', [req.body.rawtx], function(err, txres) {
	if(err) {
	    console.error('error on send raw transaction', err);
	    res.send({error: err.message, result: null});
	    return;
	}
	client.rpc('decoderawtransaction', [req.body.rawtx], function(err, txres) {
	    if(err) {
		console.error('error on decode raw transaction', err);
		res.send({error: err.message, result: null});
		return;
	    }
	    if(txres.body.result.txid) {
		var store = mongoStore.stores[req.params.network];
		store.addMempool(txres.body.result, function(err, tx) {
		    if(err) {
			console.error('error on adding mempool', err);
			res.send({error:err.mesage, result: null});
			return;
		    }
		    res.send(txres.body);
		});
	    } else {
		res.send({error: 'no txid', result: txres.body});
	    }
	}); // end of decoderawtransaction
    }); // end of sendrawtransaction
});



app.get('/', function(req, res) {
    res.send('Your home');
});

module.exports.httpServer = app;
