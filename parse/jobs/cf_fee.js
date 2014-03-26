load('jobs/helper.js');

function mapFee() {
    var sumInput = 0;
    var sumOutput = 0;
    this.inputs.forEach(function(input) {
	if(input.value != undefined && input.value > 0) {
	    sumInput += input.value;
	}
    });

    this.outputs.forEach(function(output) {
	if(output.value > 0) {
	    sumOutput += output.value;
	}
    });

    if(sumOutput < sumInput) {
	emit(this.block_id, sumInput - sumOutput);
    }
}

function reduceFee(k, values) {
    var sumValue = 0;
    values.forEach(function(val) {
	sumValue += val;
    });
    return sumValue;
}

txProgress('fee', function(query, out) {
    db.tx.mapReduce(mapFee, reduceFee,
		    {out:out, query: query});
});
