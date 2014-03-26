#!/bin/sh

coin=$1

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

function update_input {
    python -c "import mongodb_store; mongodb_store.update_inputs('$coin')"
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

function dbshell {
    exec mongo "info_$coin"
}

case "$2" in
    dbshell)
	dbshell
	;;
    parse)
	python blockparse.py $coin
	;;
    update_input)
	update_input
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
	echo Usage: $0 '<coin> [dbshell|parse|update_input|update_spent|calc_spent|calc_fee|calc_balance] args ...'
	;;    
esac