var request = require('request');
var url     = require('url');

function RpcClient(href, opts) {
    this.opts = opts || {};
    this.url = url.parse(href);
    if(!url.port)
	url.port = 8332;
};

RpcClient.prototype.rpc = function(method, params, callback) {
    this.request({jsonrpc: '2.0', method: method, params: params}, function(err, body) {
	callback(err, body);
    });
};

RpcClient.prototype.batch = function(cmds, callback) {
    var payload = [];
    for(var i=0;i<cmds.length;i++)
	payload.push({jsonrpc: '2.0', method: cmds[i].method, params: cmds[i].params, id: i});
    this.request(payload, callback);
};

RpcClient.prototype.request = function(payload, callback) {
    request(
	{uri: this.url.href, method: 'POST', json: payload, timeout:15000},
        function (err, response, body) {
	    if(err) {
		callback(err);
		return;
	    }
	    callback(undefined, {status:response.statusCode, 
				 body: body});
	});
};

module.exports = RpcClient;
