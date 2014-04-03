var Defer = require('./defer');
var Config = require('./config');
var MongoClient = require('mongodb').MongoClient;


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

    store.getTx = function(txHash, callback) {
	var col = conn.collection('tx');
	col.find({hash: txHash}).toArray(function(err, arr) {
	    if(err) {
		callback(err, undefined);
		return;
	    }
	    callback(undefined, arr.length > 0? arr[0]:undefined);	    
	});
    };

    store.getMempool = function(addressList, callback) {
	var query = {};
	if(typeof addressList == 'string') {
	    query = {"vout.scriptPubKey.addresses": addressList};
	} else if (addressList.length == 1) {
	    query = {"vout.scriptPubKey.addresses": addressList[0]};
	} else if(addressList.length == 0) {
	    callback(undefined, []);
	    return;
	} else {
	    query = {"vout.scriptPubKey.addresses": {$in: addressList}};
	}
	var addrDict = {};
	addressList.forEach(function(addr) {
	    addrDict[addr] = true;
	});

	var col = conn.collection('mempool');
	col.find(query).toArray(function(err, arr) {
	    if(err) {
		callbvack(err, undefined);
		return;
	    }
	    var outputs = [];
	    arr.forEach(function(tx){
		tx.vout.forEach(function(output) {
		    var scriptPubKey = output.scriptPubKey;
		    scriptPubKey.forEach(function(address) {
			if(addrDict[address]) {
			    var obj = {
				address: address,
				vout:scriptPubKey.n,
				amount: output.value,
				scriptPubKey: scriptPubKey.hex,
				txid: tx.txid
			    };
			    outputs.push(obj);
			}
		    });
		});
	    });
	    callback(undefined, outputs);
	});
    };

    store.getUnspent = function(addressList, callback) {
	var query = {};
	if(typeof addressList == 'string') {
	    query = {"outputs.address": addressList};
	} else if (addressList.length == 1) {
	    query = {"outputs.address": addressList[0]};
	} else if(addressList.length == 0) {
	    callback(undefined, []);
	    return;
	} else {
	    query = {"outputs.address": {$in: addressList}};
	}
	var col = conn.collection('tx');
	col.find(query).toArray(function(err, arr) {
	    if(err) {
		callback(err, undefined);
		return;
	    }
	    var outputs = [];
	    var block_ids = [];
	    arr.forEach(function(tx) {
		block_ids.push(tx.block_id);
	    });

	    store.getBlocks(block_ids, function(err, blockObjs) {
		arr.forEach(function(tx) {
		    var block = blockObjs[tx.block_id.toString()];
		    tx.outputs.forEach(function(output, index) {
			if(!output.spent) {
			    var obj = {
				address: output.address,
				vout: index,
				amount: output.value/100000000,
				txid: tx.hash,

				scriptPubkey: output.script.toString('hex')
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

    store.getBlocks = function(block_ids, callback) {
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
    };

    return store;    
}
