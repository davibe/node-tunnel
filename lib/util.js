var events = require("events"),
  util = require("util");


function LineReceiver() {
  events.EventEmitter.call(this);
  this.buffer = '';
}
util.inherits(LineReceiver, events.EventEmitter);


LineReceiver.prototype.append = function(buf) {
  this.buffer += buf;
  this._scanLine();
}


LineReceiver.prototype._scanLine = function() {
  var parts = this.buffer.split('\n', 2);
  if (parts.length == 1)
    return;

  var line = parts[0];
  // consume length + newline
  this.buffer = this.buffer.substr(line.length + 1);

  this.emit('line', line);
}


function parseAddress(address) {
  var host, port;
  var parts = address.split(':', 2);
  if (parts.length == 2) {
    host = parts[0];
    port = parts[1];
  } else {
    host = 'localhost';
    port = parts[0];
  }

  return {'address': host, 'port': port};
}


exports.LineReceiver = LineReceiver;
exports.parseAddress = parseAddress;
