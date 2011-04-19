var net = require('net'),
  util = require('util'),
  events = require('events'),
  LineReceiver = require('./util').LineReceiver;



function ReverseTunnel(socket) {
  var self = this;
  
  events.EventEmitter.call(this);

  this._tunnel_socket = socket;
  this._buffer = new LineReceiver();
  this._buffer.on('line', function (line) { self._lineReceived(line); });

  socket.on('data', function (data) { self._buffer.append (data); });
}
util.inherits(ReverseTunnel, events.EventEmitter);


ReverseTunnel.prototype._lineReceived = function (line) {
  var tokens = line.split(' ', 2);
  command = tokens[0];
  var args = tokens[1] || null;

  var name = '_cmd' + command;
  util.log ("command name " + name);
  var handler = this[name];
  if (handler === undefined)
    handler = this._unknownCommand;

  handler.call(this, args);
}


ReverseTunnel.prototype._unknownCommand = function (args) {
  this._tunnel_socket.end('unknown command\n');
}


ReverseTunnel.prototype._cmdStartReverseTunnel = function (args) {
  var self = this;
  var host, port;

  if (args != null) {
    var parts = args.split(':');
    if (parts.length != 2) {
      this._tunnel_socket.write("invalid StartReverseTunnel request");
      return;
    }

    host = parts[0];
    port = parseInt(parts[1]);
  } else {
    host = 'localhost';
    port = 9001;
  }

  util.log('ReverseTunnelStarted ' + host + ':' + port);
  this._tunnel_socket.write('ReverseTunnelStarted ' + host + ':' + port + '\n');
  self._tunnel_socket.removeAllListeners('data');
  self._tunnel_socket.pause();

  var server = net.createServer();
  server.on('connection', function (local_socket) {
    // forward from the remote accept()ed socket
    util.pump(local_socket, self._tunnel_socket);
    // and the othe way around
    util.pump(self._tunnel_socket, local_socket);
    self._tunnel_socket.resume();
  });
  server.listen(port, host);
}

function ReverseTunnelServer(options) {
  net.Server.call(this, options);

  this.on('connection', function(tunnel_socket) {
    tunnel_socket.setEncoding('utf8');
    var tunnel = new ReverseTunnel(tunnel_socket);
  });
}
util.inherits(ReverseTunnelServer, net.Server);


exports.ReverseTunnelServer = ReverseTunnelServer;
