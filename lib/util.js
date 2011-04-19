var events = require("events"),
  util = require("util");


function LineReceiver() {
  events.EventEmitter.call(this);
  this._buffer = '';
}
util.inherits(LineReceiver, events.EventEmitter);


LineReceiver.prototype.append = function(buf) {
  this._buffer += buf;
  this._scanLine();
}


LineReceiver.prototype._scanLine = function() {
  var parts = this._buffer.split('\n', 2);
  if (parts.length == 1)
    return;

  var line = parts[0];
  this._buffer = parts[1];

  this.emit('line', line);
}


exports.LineReceiver = LineReceiver;
