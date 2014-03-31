import time
from pymongo import Connection, DESCENDING
from bson.binary import Binary
import sys

_conn_pool = {}
def dbconn(coin, reconnect=False):
    if coin not in _conn_pool or reconnect:
        if reconnect:
            print 'reconnect database'
        conn = Connection('localhost', 27017, tz_aware=True)
        _conn_pool[coin] = conn
    return _conn_pool[coin]['info_%s' % coin]
    
def init_connect(coin):
    db = dbconn(coin)
    col = db['block']
    col.ensure_index('hash', unique=True)
    col.ensure_index('height')
    col.ensure_index([('data_index', -1), ('offset', -1)])


    col = db['tx']
    col.ensure_index('hash', unique=True)
    col.ensure_index('outputs.address')
    col.ensure_index('inputs.address')

    col = db['iterCursor']
    col.ensure_index('name', unique=True)

def get_last_pos(coin):
    db = dbconn(coin)
    col = db['block']
    b = col.find_one(sort=[('data_index', DESCENDING), ('offset', DESCENDING)])
    if b:
        return b['data_index'], b['offset'], b['height']
    return 0, 0, 0

def save_block(coin, b):
    reconnect = False
    db = dbconn(coin, reconnect=reconnect)
    col = db['block']
    blockId = col.save({
            'hash': b.hash,
            'data_index': b.dataIndex,
            'offset': b.offset,
            'height': b.height,
            'prev_hash': b.prevHash,
            'byte_size': b.size + 8,
            'blk_time': b.blkTime
            })
    
    for i, tx in enumerate(b.txes):
        save_tx(coin, tx, blockId, i)

def save_tx(coin, tx, blockId, block_index):
    db = dbconn(coin)
    col = db['tx']

    txdict = {
        'hash': tx.hash,
        'block_id': blockId,
        'block_index': block_index,
        'inputs': [{
                'output_tx_hash': input.txHash,
                'output_index': input.outputIndex,
                'script': Binary(input.script),
                } for input in tx.inputs],
        'outputs': [{
                'address': output.address,
                'value': output.value,
                'script': Binary(output.script),
                'spent': False
                } for output in tx.outputs],
        }

    col.insert(txdict)

def each_tx(coin, iter_name, limit=-1, c=1):
    db = dbconn(coin)
    col = db['iterCursor']
    r = col.find_one({'name': iter_name})
    last_objid = None
    if r:
        last_objid = r['objid']
    txcol = db['tx']
    times = 0
    t = 0
    try:
        while True:
            if last_objid:
                params = {'_id': {'$gt': last_objid}}
                tx = txcol.find_one(params)
            else:
                tx = txcol.find_one()
            if not tx:
                break
            last_objid = tx['_id']
            t += 1
            if t >= c:
                t = 0
                col.update({'name': iter_name},
                           {'$set': {'objid':last_objid}},
                           upsert=True)
            yield tx
            times += 1
            if limit >= 0 and times >= limit:
                break

        col.update({'name': iter_name},
                   {'$set': {'objid':last_objid}},
                   upsert=True)
    finally:
        pass

def bulk_txes(txcol, tx_hash_list):
    txes = {}
    for tx in txcol.find({'hash': {'$in': tx_hash_list}}):
        txes[tx['hash']] = tx
    return txes

def is_valid_hash(tx_hash):
    return tx_hash and tx_hash != '0000000000000000000000000000000000000000000000000000000000000000'

def update_inputs(coin, update_spent=False):
    txcol = dbconn(coin)['tx']

    for i, tx in enumerate(each_tx(coin, 'input', c=100)):
        if i % 1000 == 0:
            print time.strftime('%H:%M:%S'), i
        s = time.time()
        find_times = 0
        txes = bulk_txes(
            txcol, 
            [input['output_tx_hash'] for input in tx['inputs']
             if is_valid_hash(input['output_tx_hash'])])
        
        for input in tx['inputs']:
            tx_hash = input['output_tx_hash']
            output_index = input['output_index']
            if is_valid_hash(tx_hash):
                find_times += 1
                #srctx = txcol.find_one({'hash': tx_hash})
                srctx = txes.get(tx_hash)
                if srctx and len(srctx['outputs']) > output_index:
                    src_output = srctx['outputs'][output_index]
                    input['value'] = src_output['value']
                    input['address'] = src_output['address']
                    if update_spent:
                        src_output['spent'] = True
                        txcol.save(srctx)
                else:
                    print 'cannot find input tx %s for %s' % (tx_hash, tx['hash'])
        txcol.save(tx)
        d = time.time() - s
        if d > 0.3:
            print 's', d, tx['hash'], find_times

def update_spent(coin):
    ucol = dbconn(coin)['spent']
    txcol = dbconn(coin)['tx']
    for tx in each_tx(coin, 'spent', limit=-1):
        spent = ucol.find_one({'_id': tx['hash']})
        if spent:
            for k in spent['value'].iterkeys():
                tx['outputs'][int(k)]['spent'] = True
            txcol.save(tx)

def test():
    init_connect('bitcoin')
    i = 0
    for tx in each_tx('bitcoin', 'xxx', limit=2):
        i += 1
        print tx['hash']
    print i

if __name__ == '__main__':
    update_spent('bitcoin')
