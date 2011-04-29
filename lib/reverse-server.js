var net = require('net'),
  util = require('util'),
  events = require('events'),
  _ = require('underscore'),
  LineReceiver = require('./util').LineReceiver,
  parseAddress = require('./util').parseAddress;



function ReverseTunnelServerChannel(token) {
  events.EventEmitter.call(this);

  this._token = token;
  this._authenticated = false;
  this.tunnel_client = null;
  this.proxy_client = null;
}

util.inherits(ReverseTunnelServerChannel, events.EventEmitter);


ReverseTunnelServerChannel.prototype._tunnelLineReceived = function(line) {
  var tokens = line.split(' ', 2);
  command = tokens[0];
  var args = tokens[1] || null;

  var name = '_cmd' + command;
  var handler = this[name];
  if (handler === undefined)
    handler = this._unknownCommand;

  handler.call(this, args);
}


ReverseTunnelServerChannel.prototype._unknownCommand = function (args) {
  this.tunnel_client.end('unknown command\n');
  if (this.proxy_client)
    this.proxy_client.end();
}


ReverseTunnelServerChannel.prototype._cmdAuth = function (token) {
  if (token != this._token) {
    this.tunnel_client.end("invalid token\n");
    if (this.proxy_client)
      this.proxy_client.end();
    
    return;
  }

  this.tunnel_client.write("ok\n");
  // stop listening on the tunnel, just forward everything from now on
  this.tunnel_client.removeAllListeners('data');
  this.tunnel_client.setEncoding('binary');
  this.tunnel_client.pause();

  this._authenticated = true;
  if (this.proxy_client)
    this._startPumping();
}


ReverseTunnelServerChannel.prototype._startPumping = function () {
  // reinject in the tunnel the data that we read but that we didn't consume
  this.proxy_client.write(this._tunnel_buffer.buffer);

  util.pump(this.tunnel_client, this.proxy_client);
  util.pump(this.proxy_client, this.tunnel_client);

  this.tunnel_client.resume();
  this.proxy_client.resume();
}


ReverseTunnelServerChannel.prototype.setTunnelClient = function (tunnel_client) {
  this.tunnel_client = tunnel_client;
  this._tunnel_buffer = buffer = new LineReceiver();
  buffer.on('line', _.bind(this._tunnelLineReceived, this));
  tunnel_client.on('data', _.bind(buffer.append, buffer));
}


ReverseTunnelServerChannel.prototype.setProxyClient = function (proxy_client) {
  this.proxy_client = proxy_client;
  if (this._authenticated)
    this._startPumping();
}


function ReverseTunnelServer(tunnel_address, proxy_address, token) {
  this.token = token
  this._channels = [];
  this._startTunnelServer(tunnel_address);
  this._startProxyServer(proxy_address);
}


ReverseTunnelServer.prototype._startTunnelServer = function(tunnel_address) {
  this._tunnel_address = parseAddress(tunnel_address);
  var tunnel_server = this.tunnel_server = net.Server();

  var self = this;
  tunnel_server.on('connection', function(tunnel_client) {
    tunnel_client.setEncoding('utf8');

    var channel = _.detect(self._channels, function(chan) {
      return chan.tunnel_client === null;
    });

    if (!channel) {
      channel = new ReverseTunnelServerChannel(self.token);
      self._channels.push(channel);
    }

    channel.setTunnelClient(tunnel_client);
    if (channel.tunnel_client && channel.proxy_client)
      self._channels = _.without(self._channels, channel);
  });
}


ReverseTunnelServer.prototype._startProxyServer = function(proxy_address) {
  this._proxy_address = parseAddress(proxy_address);
  var proxy_server = this.proxy_server = net.Server();

  var self = this;
  proxy_server.on('connection', function(proxy_client) {
    proxy_client.pause();

    var channel = _.detect(self._channels, function(chan) {
      return chan.proxy_client === null;
    });

    if (!channel) {
      channel = new ReverseTunnelServerChannel(self.token);
      self._channels.push(channel);
    }

    channel.setProxyClient(proxy_client);
    if (channel.tunnel_client && channel.proxy_client)
      self._channels = _.without(self._channels, channel);
  });
}


ReverseTunnelServer.prototype.listen = function() {
  this.tunnel_server.listen(this._tunnel_address.port, this._tunnel_address.address);
  this.proxy_server.listen(this._proxy_address.port, this._proxy_address.address);
}

exports.ReverseTunnelServer = ReverseTunnelServer;
