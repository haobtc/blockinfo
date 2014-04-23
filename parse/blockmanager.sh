#!/bin/bash

coin=$1
dbhost=localhost
prog=$0

case "$1" in
    bitcoin)
	;;
    litecoin)
	;;
    dogecoin)
	;;
    *)
	echo Unknown coin
	exit 1
	;;
esac

function import_mempool {
    python -c "import mongodb_store; mongodb_store.import_mempool('$coin')"
}

function update_input {
    python -c "import mongodb_store; mongodb_store.update_inputs('$coin', update_spent=True)"
}

function update_spent {
    python -c "import mongodb_store; mongodb_store.update_spent('$coin')"
}

function calc_spent {
    mongo "$dbhost/info_$coin" jobs/cf_spent.js
}

function calc_fee {
    mongo "$dbhost/info_$coin" jobs/cf_fee.js
}


function calc_balance {
    mongo "${dbhost}/info_$coin" jobs/cf_balance.js
}

function job {
    $prog $coin parse && \
    $prog $coin calc_balance && \
    $prog $coin calc_fee && \
    $prog $coin import_mempool &&  \
    sleep 5
}

function simple_job {
    $prog $coin parse && \
    $prog $coin import_mempool &&  \
    sleep 5
}

case "$2" in
    job)
	job
	;;
    simple_job)
	simple_job
	;;
    dbshell)
	mongo "${dbhost}/info_$coin"
	;;
    dbdump)
	mkdir -p dbdump
	mongodump -h $dbhost -d "info_$coin" -o "dbdump/$coin"
	;;
    parse)
	python blockparse.py $coin
	;;
    update_input)
	update_input
	;;
    import_mempool)
	import_mempool
	;;
    update_spent)
	update_spent
	;;
    calc_spent)
	calc_spent
	;;
    calc_fee)
	calc_fee
	;;
    calc_balance)
	calc_balance
	;;
    *)
	echo Usage: $0 '<coin> [dbshell|dbdump|parse|import_mempool|update_input|update_spent|calc_spent|calc_fee|calc_balance|job|simple_job] args ...'
	;;    
esac
