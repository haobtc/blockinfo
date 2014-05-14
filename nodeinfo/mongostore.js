var Defer = require('./defer');
var Config = require('./config');
var mongodb = require('mongodb');
var MongoClient = mongodb.MongoClient;
var Long = mongodb.Long;

function round(v, shift) {
    return Math.round(v * Math.pow(10, shift))/ Math.pow(10, shift);
}

module.exports.stores = {};

module.exports.initialize = function() {
    for(var network in Config.networks) {
	var store = Store(network);
	store.connect();
	module.exports.stores[network] = store;
    }
};

module.exports.getStoreByAddress = function(address) {
    var lead = address.substr(0, 1);
    for(var network in Config.networks) {
	var conf = Config.networks[network];
	if(lead == conf.leadingChar) {
	    return module.exports.stores[network];
	}
    }
    return null;
};

module.exports.getStoreDict = function(addressList) {
    var storeDict = {};
    addressList.forEach(function(address) {
	var lead = address.substr(0, 1);
	for(var network in Config.networks) {
	    var conf = Config.networks[network];
	    if(lead == conf.leadingChar) {
		var s = storeDict[network];
		if(s) {
		    s.arr.push(address);
		} else {
		    storeDict[network] = {
			network: network,
			arr: [address],
			store: module.exports.stores[network]
		    }
		}
	    }
	}
    });
    return storeDict;
};


function Store(network) {
    var store = {};
    var conn;

    function getBlocks(txList, callback) {
	var block_ids = [];
	txList.forEach(function(tx) {
	    block_ids.push(tx.block_id);
	});

	var col = conn.collection('block');
	col.find({_id: {$in: block_ids}}).toArray(function(err, blocks) {
	    if(err) {
		return callback(err, undefined);
	    }
	    var blockObjs = {};
	    blocks.forEach(function(block) {
		blockObjs[block._id] = block;
	    });
	    callback(undefined, blockObjs);
	});
    }


    store.connect = function() {
	var url = "mongodb://localhost:27017/info_" + network;
	MongoClient.connect(url, function(err, aConn) {
	    if(err) {
		console.error(err);
		return;
	    }
	    conn = aConn;
	    store.getLatestBlock();
	    setInterval(function() {
		store.getLatestBlock();
	    }, 5000);
	});
    };

    var latestBlock;
    store.getLatestBlock = function(callback) {
	var col = conn.collection('block');
	col.find().sort({_id: -1}).limit(1).toArray(function(err, blocks) {
	    if(blocks && blocks.length >= 1) {
		latestBlock = blocks[0];
		callback && callback(latestBlock);
	    }
	});
    };    

    store.getTxFromMempool = function(hashList, callback) {
	var col = conn.collection('mempool');
	col.find({txid: {$in: hashList}}).toArray(function(err, arr) {
	    var txes = [];
	    arr.forEach(function(tx) {
		var nbObj = {
		    network: network,
		    txid: tx.txid,
		    blocktime: 0,
		    time: tx._id.getTimestamp().getTime()/1000,
		    blockhash: 'not_in_block',
		    blockindex: 0,
		    confirmations: 0
		};
		txes.push(nbObj);
	    });
	    callback(undefined, txes);
	});
    };

    store.getTx = function(hashList, callback) {
	var col = conn.collection('tx');
	col.find({hash: {$in: hashList}}).toArray(function(err, arr) {
	    if(err) {
		callback(err, undefined);
		return;
	    }
	    if(arr.length == 0) {
		callback(undefined, []);
		return;
	    }
	    getBlocks(arr, function(err, blockObjs) {
		var txes = [];
		arr.forEach(function(tx) {
		    var block = blockObjs[tx.block_id.toString()];
		    var nbObj = {
			network: network,
			txid: tx.hash,
			blocktime: block.blk_time,
			time: block.blk_time,
			blockhash: block.hash,
			blockindex: tx.block_index
		    };
		    var sumInput = 0;
		    var sumOutput = 0;
		    var inputs = [];
		    var outputs = [];
		    tx.inputs.forEach(function(input) {
			if(input.address) {
			    var v = input.value/100000000;
			    sumInput += v;
			    inputs.push({
				address:input.address,
			        value:v,
				vout: input.output_index,
				txid: input.output_tx_hash
			    });
			}
		    });
		    tx.outputs.forEach(function(output) {
			var v = output.value/100000000;
			sumOutput += v;
			outputs.push({
			    address:output.address,
			    value:v
			});
		    });
		    nbObj.inputs = inputs;
		    nbObj.outputs = outputs;
		    nbObj.fee = round(sumInput - sumOutput, 8);
		    nbObj.amount = round(sumInput, 8);
		    if(latestBlock) {
			nbObj.confirmations = 1 + Math.max(0, latestBlock.height - block.height);
		    } else {
			nbObj.confirmations = 0;
		    }
		    txes.push(nbObj);
		});
		callback(undefined, txes);
	    });

	});
    };


    store.getUnspentFromMempool = function(addressList, callback) {
	if(addressList.length == 0) {
	    callback(undefined, [], {});
	    return;
	}

	var query = {"vout.scriptPubKey.addresses": {$in: addressList}};
	var addrDict = {};
	addressList.forEach(function(addr) {
	    addrDict[addr] = true;
	});

	var col = conn.collection('mempool');
	col.find(query).toArray(function(err, arr) {
	    if(err) {
		callbvack(err, undefined, undefined);
		return;
	    }
	    var outputs = [];
	    var spent = {};
	    arr.forEach(function(tx){
		tx.vout.forEach(function(output) {
		    var scriptPubKey = output.scriptPubKey;
		    if(scriptPubKey) {
			scriptPubKey.addresses.forEach(function(address) {
			    if(addrDict[address]) {
				var obj = {
				    network: network,
				    address: address,
				    vout:output.n,
				    amount: output.value,
				    scriptPubKey: scriptPubKey.hex,
				    txid: tx.txid,
				    confirmations: 0
				};
				outputs.push(obj);
			    }
			});
		    }
		});
		tx.vin.forEach(function(input) {
		    spent[input.txid + ':' + input.vout] = true;
		});
	    });
	    callback(undefined, outputs, spent);
	});
    };

    store.getUnspent = function(addressList, callback) {
	if(addressList.length == 0) {
	    callback(undefined, []);
	    return;
	}
	var query = {"outputs.address": {$in: addressList}};
	var addrDict = {};
	addressList.forEach(function(addr) {
	    addrDict[addr] = true;
	});

	var col = conn.collection('tx');
	col.find(query).toArray(function(err, arr) {
	    if(err) {
		callback(err, undefined);
		return;
	    }
	    var outputs = [];
	    getBlocks(arr, function(err, blockObjs) {
		arr.forEach(function(tx) {
		    var block = blockObjs[tx.block_id.toString()];
		    tx.outputs.forEach(function(output, index) {
			if(addrDict[output.address] && !output.spent) {
			    var obj = {
				network: network,
				address: output.address,
				vout: index,
				amount: output.value/100000000,
				txid: tx.hash,
				scriptPubKey: output.script.toString('hex')
			    };
			    if(latestBlock) {
				obj.confirmations = latestBlock.height - block.height;
			    }
			    outputs.push(obj);
			}
		    });
		});
		callback(undefined, outputs);
	    });
	});	
    };

    store.addMempool = function(tx, callback) {
	var col = conn.collection('mempool');
	col.insert(tx, callback);
    };

    return store;    
}
