var Util           = require('util');
var EventEmitter   = require('events').EventEmitter;
var Packets        = require('../packets');
var ErrorConstants = require('../constants/errors');

module.exports = Sequence;
Util.inherits(Sequence, EventEmitter);
function Sequence(callback) {
  EventEmitter.call(this);

  this._callback         = callback;
  this._nextPacketNumber = 0;
  this._ended            = false;
}

Sequence.determinePacket = function(byte) {
  switch (byte) {
    case 0x00: return Packets.OkPacket;
    case 0xfe: return Packets.EofPacket;
    case 0xff: return Packets.ErrorPacket;
  }
};

Sequence.prototype.hasErrorHandler = function() {
  return this._callback || this.listeners('error').length > 1;
};

Sequence.packetToError = function(packet) {
  var code = ErrorConstants[packet.errno] || 'UNKNOWN_CODE_PLEASE_REPORT';
  var err  = new Error(code + ': ' + packet.message);
  err.code = code;

  return err;
};

Sequence.prototype.trackAndVerifyPacketNumber = function(number) {
  if (number !== this._nextPacketNumber) {
    var err = new Error(
      'Packets out of order. Got: ' + number + ' ' +
      'Expected: ' + this._nextPacketNumber
    );

    err.code = 'PROTOCOL_PACKETS_OUT_OF_ORDER';

    throw err;
  }

  this._incrementNextPacketNumber();
};

Sequence.prototype._emitPacket = function(packet) {
  this.emit('packet', this._nextPacketNumber, packet);
  this._incrementNextPacketNumber();
};

Sequence.prototype._incrementNextPacketNumber = function() {
  this._nextPacketNumber = (this._nextPacketNumber + 1) % 256;
};

Sequence.prototype.end = function(err) {
  if (this._ended) {
    return;
  }

  this._ended = true;

  var self = this;
  var args = arguments;

  // Escape stack (so try..catch in Protocol#write does not interfer here)
  process.nextTick(function() {
    if (err) {
      self.emit('error', err);
    }

    if (self._callback) {
      self._callback.apply(self, args);
    }

    self.emit('end');
  });
};

Sequence.prototype['OkPacket'] = function(packet) {
  this.end(null);
};

Sequence.prototype['ErrorPacket'] = function(packet) {
  var err = Sequence.packetToError(packet);
  this.end(err);
};

// Implemented by child classes
Sequence.prototype.start = function() {};