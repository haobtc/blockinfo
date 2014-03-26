load('jobs/helper.js');

function mapSpent() {
    this.inputs.forEach(function(input) {
	if(input.output_tx_hash &&
	   input.output_tx_hash != '0000000000000000000000000000000000000000000000000000000000000000') {
	    var v = {};
	    v[input.output_index] = true;
	    emit(input.output_tx_hash, v);
	}
    });
}

function reduceSpent(k, values) {
    var newValue = {};
    values.forEach(function(val) {
	for(var idx in val) {
	    newValue[idx] = true;
	}
    });
    return newValue;
}

txProgress('spent', function(query, out) {
    db.tx.mapReduce(mapSpent, reduceSpent,
		    {out:out,
		     query: query});
});


