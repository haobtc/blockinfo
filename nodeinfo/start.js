var argv = require('optimist').argv;
var server = require('./server');
var Config = require('./config');

var domain = require('domain').create();
domain.on('error', function(err) {
    console.error(err.stack);
});

domain.run(function() {
    var port = argv.p || Config.httpPort || 18080;
    console.info('server starts at port', port);
    server.httpServer.listen(port);
});
