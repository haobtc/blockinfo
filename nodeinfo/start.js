var argv = require('optimist').argv;
var server = require('./server');

var domain = require('domain').create();
domain.on('error', function(err) {
    console.error(err.stack);
});

domain.run(function() {
    server.httpServer.listen(18080);
});
