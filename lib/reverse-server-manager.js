var connect = require('connect'),
  util = require('util'),
  uuid = require('uuid-pure'),
  _ = require('underscore'),
  pass = require('pass'),
  fs = require('fs'),
  ReverseTunnelServer = require('./reverse-server').ReverseTunnelServer;


function ReverseTunnelServerManager(options) {
  var self = this;

  this._tunnel_address = options['tunnel-address'];
  this._proxy_address = options['proxy-address'];

  this._users = this._parsePasswdFile(options.passwd);
  this._tunnels = [];

  var routes = this._buildRoutes();
  connect.HTTPServer.call(this, [
      connect.basicAuth(function(username, password, next) {
          return self._httpAuthenticate(username, password, next);
      }),
      connect.router(routes)
  ]);
}

util.inherits(ReverseTunnelServerManager, connect.HTTPServer);


ReverseTunnelServerManager.prototype._buildRoutes = function() {
  var self = this;

  function route(app) {
    app.get('/tunnel/new', function(req, res, next) {
      var server = self._createTunnelServer();

      var message = {'token': server.token, 'port': server.port,
        'tunnel_address': server.tunnel_server.address(),
        'proxy_address': server.proxy_server.address()
      };
      var json = JSON.stringify(message);

      res.writeHead(200, {'Content-Type': 'application/json'});
      res.end(json);
    });
  }

  return route;
}


ReverseTunnelServerManager.prototype._parsePasswdFile = function(file) {
  var ret = {};

  var lines = fs.readFileSync(file, 'ascii').split('\n');
  _.each(lines, function(line) {
    if (!line) return;
    var parts = line.split(':', 2);
    ret[parts[0]] = parts[1];
  });

  return ret;
}


ReverseTunnelServerManager.prototype._createTunnelServer = function() {
  var token = uuid.newId(16, 16);
  var server = new ReverseTunnelServer(this._tunnel_address,
      this._proxy_address, token);
  server.listen();

  return server;
}


ReverseTunnelServerManager.prototype._httpAuthenticate = function(username, password, next) {
  var hash = this._users[username];
  if (hash === undefined)
    return next(null, null);

  pass.validate(password, hash, function(error, is_valid) {
    if (is_valid)
      next(null, username)
    else
      next(error, null);
  });
}


exports.ReverseTunnelServerManager = ReverseTunnelServerManager;
