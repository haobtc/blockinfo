load('jobs/helper.js');

function mapBalance() {
    var sumInput = 0;
    var sumOutput = 0;
    this.inputs.forEach(function(input) {
	if(input.value > 0) {
	    sumInput += input.value;
	    if(input.address) {
		emit(input.address, {
		    r: 0,
		    b: -1 * input.value});
	    }
	}
    });

    this.outputs.forEach(function(output) {
	if(output.value > 0) {
	    sumOutput += output.value;
	    if(output.address) {
		emit(output.address, 
		     {r: output.value,
		      b: output.value});
	    }
	}
    });
}

function reduceBalance(k, values) {
    var sumValue = {r: 0, b: 0};
    values.forEach(function(val) {
	sumValue.r += val.r;
	sumValue.b += val.b;
    });
    return sumValue;
}



txProgress('balance', function(query, out) {
    db.tx.mapReduce(mapBalance, reduceBalance,
		    {out:out,
		     query: query});
});
