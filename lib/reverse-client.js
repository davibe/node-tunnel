var net = require("net"),
  events = require('events'),
  request = require("request"),
  util = require("util"),
  LineReceiver = require("./util").LineReceiver,
  parseAddress = require("./util").parseAddress,
  _ = require('underscore'),
  url = require("url");


_channelId = 0;

function ReverseTunnelClient(options) {
  this._options = options;
}


ReverseTunnelClient.prototype.connect = function() {
  var address = parseAddress(this._options['server-http-address']);
  var uri = url.parse('http://' + address.address + '/tunnel/new');
  uri.port = address.port;
  
  var user = this._options.username;
  var pass = this._options.password;
  uri.auth = user + ':' + pass;

  var self = this;
  request({uri: uri, json: true}, function (error, response, body) {
    if (error || response.statusCode != 200) {
      if (!error)
        error = response.statusCode
      console.error('error starting tunnel: ' + error);

      return;
    }

    var options = JSON.parse(body);
    self._channel_options = options;
    console.log(util.inspect(options));
    self._startNewChannel();
  });
}


ReverseTunnelClient.prototype._startNewChannel = function() {
  var options = this._channel_options;
  var channel = new ReverseTunnelClientChannel({
      'token': options.token,
      'tunnel-address': options.tunnel_address,
      'proxy-address': parseAddress(this._options['proxy-address'])
  });

//  channel.on('connect', _.bind(this._onChannelConnect, this, channel));
  channel.on('close', _.bind(this._onChannelClose, this, channel));

  channel.connect();
}


ReverseTunnelClient.prototype._onChannelClose = function(channel) {
  this._startNewChannel();
}


function ReverseTunnelClientChannel(options) {
  events.EventEmitter.call(this);

  this._id = _channelId++;
  this._tunnel_address = options['tunnel-address'];
  this._proxy_address = options['proxy-address'];
  this._token = options.token;

  this._tunnel_client = null;
  this._tunnel_client_buffer = new LineReceiver();
  this._proxy_client = null;
}

util.inherits(ReverseTunnelClientChannel, events.EventEmitter)


ReverseTunnelClientChannel.prototype._log = function(message) {
  util.log('channel-' + this._id + ' ' + message);
}


ReverseTunnelClientChannel.prototype.connect = function() {
  var self = this;
  
  this._tunnel_client = tunnel_client = new net.Socket();
  tunnel_client.on('connect', function() {
    self._tunnelClientConnected(tunnel_client);
  });
  tunnel_client.on('close', function() {
    self._tunnelClientClosed();
  });

  var address = this._tunnel_address;
  this._log('connecting to tunnel ' + util.inspect(address));
  tunnel_client.connect(address.port, address.address);
}

ReverseTunnelClientChannel.prototype._tunnelClientConnected = function(tunnel_client) {
  this._log('connected to tunnel');
  var buffer = this._tunnel_client_buffer;
  tunnel_client.on('data', _.bind(buffer.append, buffer));
  buffer.on('line', _.bind(this._tunnelClientLineReceived, this));
  tunnel_client.write('Auth ' + this._token + '\n');
}


ReverseTunnelClientChannel.prototype._tunnelClientLineReceived = function(line) {
  if (line != 'ok') {
    this._log(line);
    return this.end();
  }

  var tunnel_client = this._tunnel_client;
  tunnel_client.removeAllListeners('data');

  var buffer = this._tunnel_client_buffer;
  if (buffer.buffer)
    return this._connectProxyClient(buffer.buffer);

  var self = this;
  tunnel_client.on('data', function(data) {
    tunnel_client.removeAllListeners('data');
    self._connectProxyClient(data);
  });
}


ReverseTunnelClientChannel.prototype._tunnelClientClosed = function() {
  this._log('tunnel client closed');
  this.end();
}


ReverseTunnelClientChannel.prototype._connectProxyClient = function(data) {
  this._proxy_client = proxy_client = new net.Socket();

  var self = this;
  proxy_client.on('connect', function() {
    self._proxyClientConnected(proxy_client, data);
  });
  proxy_client.on('close', function(had_error) {
    if (!had_error)
      self._proxyClientClosed();
  });
  proxy_client.on('error', function(exception) {
    self._log(exception);
    self._proxyClientClosed();
  });

  var address = this._proxy_address
  this._log('connecting to proxy ' + util.inspect(address));
  proxy_client.connect(address.port, address.address);
}


ReverseTunnelClientChannel.prototype._proxyClientConnected = function(proxy_client, data) {
  this._log('connected to proxy');
  proxy_client.write(data);
  util.pump(this._tunnel_client, proxy_client);
  util.pump(proxy_client, this._tunnel_client);
}


ReverseTunnelClientChannel.prototype._proxyClientClosed = function() {
  this._log('proxy connection closed');
  this.end();
}


ReverseTunnelClientChannel.prototype.end = function() {
  this._log('closing');

  this._tunnel_client.removeAllListeners('close');
  this._tunnel_client.end();

  if (this._proxy_client) {
    this._proxy_client.removeAllListeners('close');
    this._proxy_client.end();
  }

  this.emit('close');
}

exports.ReverseTunnelClient = ReverseTunnelClient;
