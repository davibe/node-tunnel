var net = require("net"),
  util = require("util"),
  LineReceiver = require("./util").LineReceiver;


function ReverseTunnelClient(tunnel_address,
    local_address, remote_address) {
  var self = this;

  
  var parts = local_address.split(':', 2);
  this.local_host = parts[0];
  this.local_port = parts[1];
  this.local_socket = net.Socket();
  this.local_socket.on('connect', function() { self._onLocalConnect(); });

  parts = tunnel_address.split(':', 2);
  this.tunnel_host = parts[0];
  this.tunnel_port = parts[1];
  this.tunnel_buffer = new LineReceiver();
  this.tunnel_buffer.on('line', function(line) {
    self._onRemoteLine(line);
  });
  this.tunnel_socket = net.Socket();
  self.tunnel_socket.on('connect', function() { self._onRemoteConnect(); });
  this.tunnel_socket.on('data', function(data) {
    self.tunnel_buffer.append(data);
  });
}


ReverseTunnelClient.prototype._onRemoteConnect = function() {
  util.log("connected to remote server");
  this.tunnel_socket.write("StartReverseTunnel\n");
}


ReverseTunnelClient.prototype._onRemoteLine = function(line) {
  var parts = line.split(' ');
  if (parts[0] != 'ReverseTunnelStarted') {
    this.destroy();
    return;
  }

  parts = parts[1].split(':', 2)
  var host = parts[0],
    port = parts[1];

  util.log('remote tunnel end ' + host + ':' + port);

  this.local_socket.connect(this.local_port, this.local_host);
}


ReverseTunnelClient.prototype._onLocalConnect = function() {
  util.log("connected to local server");

  this.local_socket.removeAllListeners('data');
  this.tunnel_socket.removeAllListeners('data');

  util.pump(this.local_socket, this.tunnel_socket);
  util.pump(this.tunnel_socket, this.local_socket);
}


ReverseTunnelClient.prototype.connect = function() {
  this.tunnel_socket.connect(this.tunnel_port, this.tunnel_host);
}


ReverseTunnelClient.prototype.destroy = function() {
  this.tunnel_socket.destroy();
  this.local_socket.destroy();
}

exports.ReverseTunnelClient = ReverseTunnelClient;
