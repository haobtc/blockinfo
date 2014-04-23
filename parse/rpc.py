import sys
import re
import httplib2
import socket
import json
import urlparse
import base64

rpc_id = 0
def coinrpc(coin, rpcmethod, *params):
    global rpc_id
    rpc_id += 1
    href = 'http://block.so/infoapi/v1/rpc/%s' % coin
    parsed = urlparse.urlparse(href)
    rpc_server = '%s://%s%s' % (parsed.scheme, parsed.netloc, parsed.path)
    req = httplib2.Http(timeout=5)
    req.add_credentials(parsed.username,
                        parsed.password)
    
    body = json.dumps({ "version": '1.1',
                         "method" : rpcmethod,
                         "params" : params,
                         'id': rpc_id })
    headers = {
        'Content-Type': 'application/json',
        }
    resp, content = req.request(rpc_server, 'POST', body, headers=headers)
    assert resp.status == 200, content
    return json.loads(content)

if __name__ == '__main__':
    print coinrpc('litecoin', 'getrawmempool')
