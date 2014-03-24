from torndb import Connection
import sys

_conn_pool = {}
def dbconn(coin, reconnect=False):
    if coin not in _conn_pool or reconnect:
        if reconnect:
            print 'reconnect database'
        conn = Connection('localhost', 'blockinfo_%s' % coin, user='bit', password='bitpass')
        _conn_pool[coin] = conn
    return _conn_pool[coin]

def init_connect():
    pass

conn_times = 0
def save_block(coin, b):
    global conn_times
    reconnect = False
    conn_times += 1
    if conn_times >= 1000:
        reconnect = True
        conn_times = 0

    db = dbconn(coin, reconnect=reconnect)
    db.execute('BEGIN')
    try:
        block_id = db.execute('''INSERT INTO `block`(hash, file_index, file_offset, count_tx, byte_size, blk_time) VALUES(%s, %s, %s, %s, %s, %s)''',
                              b.hash, b.dataIndex, b.offset, len(b.txes), b.size + 8, b.blkTime)
        for i, tx in enumerate(b.txes):
            save_tx(coin, tx, block_id, i)
    except:
        db.execute('ROLLBACK')
        raise
    db.execute('COMMIT')
    return block_id

def save_tx(coin, tx, block_id, block_index):
    db = dbconn(coin)
    tx_id = db.execute('replace into `tx`(hash, block_id, block_index) values(%s, %s, %s)', tx.hash, block_id, block_index)
    for input in tx.inputs:
        tx_hash = input.txHash
        if tx_hash == '0000000000000000000000000000000000000000000000000000000000000000':
            tx_hash = ''

        output_id = 0
        if tx_hash:
            r = db.get('SELECT id, spent FROM tx_output WHERE tx_hash=%s AND output_index = %s', tx_hash, input.outputIndex)
            if r:
                output_id = r['id']
                #assert not r['spent'], 'output %s already send' % output_id
        input_id = db.execute('INSERT INTO tx_input(tx_hash, output_id, script) VALUES(%s, %s, %s)', tx.hash, output_id, input.script[:512])
        if output_id:
            db.execute('UPDATE tx_output SET spent = true WHERE id=%s', output_id)

    for i, output in enumerate(tx.outputs):
        if len(output.address) >= 80:
            print >>sys.stderr, 'illegal address', repr(output.address)
            continue
        output_id = db.execute('INSERT INTO tx_output(tx_hash, address, value, script, output_index) VALUES(%s, %s, %s, %s, %s)', tx.hash, output.address, output.value, output.script[:512], i)

def get_last_pos(coin):
    db = dbconn(coin)
    r = list(db.query('''SELECT file_index, file_offset, byte_size FROM block ORDER BY file_index DESC, file_offset DESC LIMIT 1'''))
    if r:
        r = r[0]
        return r['file_index'], r['file_offset'] + r['byte_size']
    else:
        return (0, 0)

if __name__ == '__main__':
    print get_last_pos()
