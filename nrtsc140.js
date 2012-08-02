/**
 * Constants.
 */
var MAX_RECORDING_SEC = 30;
var SC_SEVER_STARTED_MSG = 'Shared memory server interface initialized';
var SC_SEVER_START_ERR_MSG = 'server failed to start';
var JACK_DRIVER_IGNORE_MSG = 'JackDriver: max output latency';

/**
 * Module dependencies.
 */
var sio = require('socket.io')
  , sc = require('sc4node')
  , child_process = require('child_process')
  , fs = require('fs')
  , path = require('path')
  , crypto = require('crypto')
  , util = require('util');
  
// For backwards compatibility with node 0.6
fs.existsSync || (fs.existsSync = path.existsSync);

var NrtSc140 = exports.NrtSc140 = function(socket) {
  this._socket = socket;
  this._audioDir = path.join(process.cwd(), 'public', 'audio');
  this._curFile = null;
  this._generatedFiles = [];
  this._timeoutId = null;
  this._intervalId = null;
  this._sclang = null;
};

NrtSc140.prototype.start = function() {
  this._socket.emit('scserverstarting');
  this._sclang = this.createSclang();
  this._socket.on('validate', this.onValidate.bind(this));
  this._socket.on('generate', this.onGenerate.bind(this));
  this._socket.on('stop', this.onStop.bind(this));
  this._socket.on('restartsclang', this.onRestartSclang.bind(this));
  this._socket.on('disconnect', this.onSocketDisconnect.bind(this));
};

NrtSc140.prototype.onRestartSclang = function() {
  this.restartSclang();
};

NrtSc140.prototype.onValidate = function(msg) {
  util.debug('validate: ' + msg);
  this.validateScCode(msg, this._socket);
};

NrtSc140.prototype.onGenerate = function(msg) {
  util.debug('generate: ' + msg);
  if (!this.validateScCode(msg, this._socket)) {
    return;
  }

  var aiffFile;
  do {
    this._curFile = randomString();
    aiffFile = path.join(this._audioDir, this._curFile + '.aiff');
    util.debug('aiffFile: ' + aiffFile);
  } while (fs.existsSync(aiffFile));
  //this._generatedFiles.push(path.join(_audioDir, _curFile + '.*'));
  this._sclang.evaluate(
    's.waitForBoot(s.prepareForRecord(\'' +
    aiffFile + '\');s.record;' +
    msg + '\n);', 
    false);

  var timeRemaining = MAX_RECORDING_SEC + 1;
  this._timeoutId = setTimeout(function() {
    this._timeoutId = this.stopRecording();
  }.bind(this), timeRemaining * 1000);

  var timeRecorded = 0;
  util.debug('timerecorded: ' + timeRecorded);
  this._socket.emit('timerecorded', '' + timeRecorded);
  this._intervalId = setInterval(function() {
    timeRecorded++;
    util.debug('timerecorded: ' + timeRecorded);
    this._socket.emit('timerecorded', '' + timeRecorded);
    if (timeRecorded >= MAX_RECORDING_SEC) {
      clearInterval(this._intervalId);
    }
  }.bind(this), 1000);
};

NrtSc140.prototype.onStop = function() {
  util.debug('stop');
  if (this._timeoutId) {
    clearTimeout(this._timeoutId);
  }
  if (this._intervalId) {
    clearInterval(this._intervalId);
  }
  this.stopRecording();
};

NrtSc140.prototype.onSocketDisconnect = function() {
  util.debug('disconnect');
  if (this._timeoutId) {
    clearTimeout(this._timeoutId);
  }
  if (this._intervalId) {
    clearInterval(this._intervalId);
  }
  if (this._sclang) {
    this._sclang.dispose();
  }
  for (var i = 0, len = this._generatedFiles.length; i < len; i++) {
    rmFile(this._generatedFiles[i]);
  }
};

NrtSc140.prototype.createSclang = function() {
  var sclang = 
    new sc.start('/usr/local/bin/', this.onSclangStdoutReceived.bind(this));
  sclang.evaluate('Server.default = Server.internal;s = Server.default;s.boot;');

  // FIXME workaround
  var workaroundTmpFile;
  do {
    workaroundTmpFile = '/tmp/nrt-sc140-' + randomString() + '.aiff';
  } while (fs.existsSync(workaroundTmpFile));
  this._generatedFiles.push(workaroundTmpFile);
  sclang.evaluate(
    's.waitForBoot(s.prepareForRecord(\'' +
    workaroundTmpFile +
    '\');s.record;s.stopRecording;);', 
    false);
  return sclang;
};

NrtSc140.prototype.restartSclang = function() {
  this._socket.emit('scserverstarting');
  if (this._sclang) {
    this._sclang.dispose();
  }
  this._sclang = this.createSclang();    
};

NrtSc140.prototype.onSclangStdoutReceived = function(data) {
  util.debug('sclang stdout: ' + data);
  var msg = '' + data;
  if (msg.indexOf(SC_SEVER_STARTED_MSG) !== -1) {
    this._socket.emit('scserverstarted');
  } else if (msg.indexOf(SC_SEVER_START_ERR_MSG) !== -1) {
    // FIXME workaround
    // in case starting server failed (receive following stdout).
    //  ERROR:
    //  server failed to start
    //  ERROR:
    //  server failed to start
    this._socket.emit('stdout', msg);
    this.restartSclang(); // restart sclang
    return;
  } else if (msg.indexOf(JACK_DRIVER_IGNORE_MSG) !== -1) {
    // FIXME workaround
    // in case other user start sclang
    return; // ignore
  }
  this._socket.emit('stdout', msg);
};

NrtSc140.prototype.validateScCode = function(msg) {
  if (msg.length < 1) {
    this._socket.emit('validationerror', 'code can not be blank.');
    return false;
  }
  if (msg.length > 140) {
    this._socket.emit('validationerror', 'code can not be over 140.');
    return false;
  }
  if (msg.indexOf('unixCmd') != -1) {
    this._socket.emit('validationerror', '\'unixCmd\' can not be executed.');
    return false;
  }
  this._socket.emit('validationerror', '');
  return true;
};

NrtSc140.prototype.stopRecording = function() {
  this._sclang.evaluate('s.stopRecording;', false);
  this._sclang.stopSound();
  this._timeoutId = setTimeout(function() {
    var aiffFile = path.join(this._audioDir, this._curFile + '.aiff');
    var mp3File = path.join(this._audioDir, this._curFile + '.mp3');
    convert(aiffFile, mp3File, function(error, stdout, stderr) {
      util.debug('stdout: ' + stdout);
      util.debug('stderr: ' + stderr);
      if (error) {
        util.debug('exec error: ' + error);
      }
      this._socket.emit('filegenerated', this._curFile);
    }.bind(this));
  }.bind(this), 1000);
};

function randomString() {
  var buf = crypto.randomBytes(4);
  var rand = '';
  for (var i = 0, len = buf.length; i < len; i++) {
    rand = rand + buf[i];
  }
  return rand;
}

function convert(aiffFile, mp3File, callback) {
  child_process.exec(
    'ffmpeg -i ' + aiffFile + 
    ' -f mp3 -acodec libmp3lame -ab 192000 -ar 44100 ' + mp3File, 
    callback);
}

function rmFile(file) {
  child_process.exec('rm -f ' + file, function(error, stdout, stderr) {
    util.debug('stdout: ' + stdout);
    util.debug('stderr: ' + stderr);
    if (error) {
      util.debug('exec error: ' + error);
    }
  });
}

