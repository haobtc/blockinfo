
function txProgress(colName, callback) {
    var maxTx = db.tx.find().sort({_id: -1}).limit(1)[0];
    if (maxTx) {
	var query = {$lte: maxTx._id};
	var old = db.iterCursor.findAndModify({
	    query: {name: 'cf.' + colName},
	    update: {$set: {objid: maxTx._id}},
	    "new": false,
	    upsert: true
	});
	if(old) {
	    query.$gt = old.objid;
	}
	var incremental = !!old;
	if(incremental) {
	    var out = {reduce: colName};
	} else {
	    var out = colName;
	}
	callback({_id: query}, out);
    }
}
