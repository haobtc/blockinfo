#!/bin/bash

coin=$1
dbhost=localhost

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
    python -c "import mongodb_store; mongodb_store.update_inputs('$coin', update_spent=False)"
}

function update_spent {
    python -c "import mongodb_store; mongodb_store.update_spent('$coin')"
}

function calc_spent {
    mongo "info_$coin" jobs/cf_spent.js
}

function calc_fee {
    mongo "info_$coin" jobs/cf_fee.js
}


function calc_balance {
    mongo "info_$coin" jobs/cf_balance.js
}

case "$2" in
    dbshell)
	mongo -h $dbhost "info_$coin"
	;;
    dbdump)
	mongodump -h $dbhost -d "info_$coin" -o "dbdump_$coin"
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
	echo Usage: $0 '<coin> [dbshell|dbdump|parse|import_mempool|update_input|update_spent|calc_spent|calc_fee|calc_balance] args ...'
	;;    
esac
