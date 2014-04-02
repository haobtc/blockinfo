import sys
import re
import httplib2
import socket
import json
import urlparse
import base64

rpc_config = {
    'litecoin': 'http://litecoinrpc:3yKMEXdAJeQVpAU25LqzU1fR43VBqkogEZEc4EcBuWth@localhost:28555',
    'bitcoin': 'http://bitcoinrpc:DfwvKDD2A2nDn747LBTSfq3RTh5SNFr1SA7N3aM35BHq@localhost:28455',
    'dogecoin': "http://dogecoinrpc:FFuwaCEx8gfg74bj6hXdjvw5QMaL9veiu4hUVeG9ZgHS@localhost:28655"
}

rpc_id = 0
def coinrpc(coin, rpcmethod, *params):
    global rpc_id
    rpc_id += 1
    parsed = urlparse.urlparse(rpc_config[coin])
    rpc_server = '%s://%s:%s/' % (parsed.scheme, parsed.hostname, parsed.port)
    req = httplib2.Http(timeout=5)
    req.add_credentials(parsed.username,
                        parsed.password)
    
    body = json.dumps({ "version": '1.1',
                         "method" : rpcmethod,
                         "params" : params,
                         'id': rpc_id })
    resp, content = req.request(rpc_server, 'POST', body)
    assert resp.status == 200, content
    return json.loads(content)

if __name__ == '__main__':
    print coinrpc('litecoin', 'getrawmempool')['result']
