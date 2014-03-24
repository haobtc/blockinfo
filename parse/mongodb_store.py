from pymongo import Connection, DESCENDING
import sys

_conn_pool = {}
def dbconn(coin, reconnect=False):
    if coin not in _conn_pool or reconnect:
        if reconnect:
            print 'reconnect database'
        conn = Connection('localhost', 27017, tz_aware=True)
        _conn_pool[coin] = conn
    return _conn_pool[coin]['blockinfo_%s' % coin]

    
def init_connect(coin):
    db = dbconn(coin)
    col = db['block']
    col.ensure_index('hash', unique=True)
    col.ensure_index([('data_index', -1), ('offset', -1)])


    col = db['tx']
    col.ensure_index('hash', unique=True)
    col.ensure_index('outputs.address')

def get_last_pos(coin):
    db = dbconn(coin)
    col = db['block']
    b = col.find_one(sort=[('data_index', DESCENDING), ('offset', DESCENDING)])
    if b:
        return b['data_index'], b['offset']
    return 0, 0

def save_block(coin, b):
    reconnect = False
    db = dbconn(coin, reconnect=reconnect)
    col = db['block']
    blockId = col.save({
            'hash': b.hash,
            'data_index': b.dataIndex,
            'offset': b.offset,
            'byte_size': b.size + 8,
            'blk_time': b.blkTime
            })
    
    for i, tx in enumerate(b.txes):
        save_tx(coin, tx, blockId, i)

def save_tx(coin, tx, blockId, block_index):
    db = dbconn(coin)
    col = db['tx']

    for input in tx.inputs:
        tx_hash = input.txHash
        input.value = 0
        if tx_hash and tx_hash != '0000000000000000000000000000000000000000000000000000000000000000':
            srctx = col.find_one({'hash': tx_hash})
            if srctx and len(srctx['outputs']) > input.outputIndex:
                src_output = srctx['outputs'][input.outputIndex]
                src_output['spent'] = True
                input.value = src_output['value']
                col.save(srctx)
            else:
                print 'output %s' % input.outputIndex, 'for hash %s' % tx_hash, 'not found'

    txdict = {
        'hash': tx.hash,
        'block_id': blockId,
        'block_index': block_index,
        'inputs': [{
                'output_tx_hash': input.txHash,
                'output_index': input.outputIndex,
                'script': input.script.encode('hex_codec'),
                'value': input.value
                } for input in tx.inputs],
        'outputs': [{
                'address': output.address,
                'value': output.value,
                'script': output.script.encode('hex_codec'),
                'spent': False
                } for output in tx.outputs],
        }

    col.save(txdict)
    


    
