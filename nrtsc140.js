/**
 * Constants.
 */
const MAX_RECORDING_SEC = 30;
const SC_SEVER_STARTED_MSG = 'notification is on';
const SC_SEVER_START_ERR_MSG = 'server failed to start';
const JACK_DRIVER_IGNORE_MSG = 'JackDriver: max output latency';

/**
 * Module dependencies.
 */
var sio = require('socket.io')
  , sc = require('sc4node')
  , child_process = require('child_process')
  , path = require('path')
  , crypto = require('crypto')
  , util = require('util')

var NrtSc140 = exports.NrtSc140 = function(socket) {
  var _socket = socket;
  var _audioDir = path.join(process.cwd(), 'public', 'audio');
  var _curFile = null;
  var _generatedFiles = new Array();
  var _timeoutId = null;
  var _intervalId = null;
  var _sclang = null;
  var _sclangStdoutHandler = function(data) {
    util.debug('sclang stdout: ' + data);
    var msg = '' + data;
    if (msg.indexOf(SC_SEVER_STARTED_MSG) != -1) {
      _socket.emit('scserverstarted');
    } else if (msg.indexOf(SC_SEVER_START_ERR_MSG) != -1) {
    } else if (msg.indexOf(JACK_DRIVER_IGNORE_MSG) != -1) {
      // FIXME workaround
      // in case other user start sclang
      return; // ignore
    }
    _socket.emit('stdout', msg);
  };
  
  NrtSc140.prototype.start = function() {
    _socket.emit('scserverstarting');
    _sclang = createSclang(_sclangStdoutHandler, _generatedFiles);
    _socket.on('generate', this.onGenerate);
    _socket.on('stop', this.onStop);
    _socket.on('restartsclang', this.onRestartSclang);
    _socket.on('disconnect', this.onSocketDisconnect);
  }
    
  NrtSc140.prototype.onRestartSclang = function() {
    _socket.emit('scserverstarting');
    _sclang.dispose();
    _sclang = createSclang(_sclangStdoutHandler, _generatedFiles);
  }
  
  NrtSc140.prototype.onGenerate = function(msg) {
    util.debug('generate: ' + msg);
    if (msg.indexOf('unixCmd') != -1) {
      _socket.emit('notification', '\'unixCmd\' can not be executed.');
      return;
    }

    var aiffFile;
    do {
      _curFile = randomString();
      aiffFile = path.join(_audioDir, _curFile + '.aiff');
      util.debug('aiffFile: ' + aiffFile);
    } while (path.existsSync(aiffFile));
    //_generatedFiles.push(path.join(_audioDir, _curFile + '.*'));
    _sclang.evaluate(
      's.waitForBoot(s.prepareForRecord(\'' 
      + aiffFile + '\');s.record;' 
      + msg + '\n);', false);

    var timeRemaining = MAX_RECORDING_SEC + 1;
    _timeoutId = setTimeout(function() {
      _timeoutId = stopRecording(_sclang, _socket, _audioDir, _curFile);
    }, timeRemaining * 1000);

    var timeRecorded = 0;
    util.debug('timerecorded: ' + timeRecorded);
    _socket.emit('timerecorded', '' + timeRecorded);
    _intervalId = setInterval(function() {
      timeRecorded++;
      util.debug('timerecorded: ' + timeRecorded);
      _socket.emit('timerecorded', '' + timeRecorded);
      if (timeRecorded >= MAX_RECORDING_SEC) clearInterval(_intervalId);
    }, 1000);
  };

  NrtSc140.prototype.onStop = function() {
    util.debug('stop');
    if (_timeoutId) clearTimeout(_timeoutId);
    if (_intervalId) clearInterval(_intervalId);
    _timeoutId = stopRecording(_sclang, _socket, _audioDir, _curFile);
  }

  NrtSc140.prototype.onSocketDisconnect = function() {
    util.debug('disconnect');
    if (_timeoutId) clearTimeout(_timeoutId);
    if (_intervalId) clearInterval(_intervalId);
    
    _sclang.dispose();
    
    for (i in _generatedFiles) {
      rmFile(_generatedFiles[i]);
    }
  }
};

function createSclang(handler, generatedFiles) {
  var sclang = new sc.Sclang('/usr/bin/', handler);
  sclang.evaluate('Server.default = Server.internal;s = Server.default;s.boot;');

  // FIXME workaround
  var workaroundTmpFile;
  do {
    workaroundTmpFile = '/tmp/nrt-sc140-' + randomString() + '.aiff';
  } while (path.existsSync(workaroundTmpFile));
  generatedFiles.push(workaroundTmpFile);
  sclang.evaluate(
    's.waitForBoot(s.prepareForRecord(\'' 
    + workaroundTmpFile
    + '\');s.record;s.stopRecording;);', 
    false);
  return sclang;
}

function stopRecording(sclang, socket, audioDir, filename) {
  sclang.evaluate('s.stopRecording;', false);
  sclang.stopSound();
  var timeoutId = setTimeout(function() {
    var aiffFile = path.join(audioDir, filename + '.aiff');
    var mp3File = path.join(audioDir, filename + '.mp3');
    convert(aiffFile, mp3File, function(error, stdout, stderr) {
      util.debug('stdout: ' + stdout);
      util.debug('stderr: ' + stderr);
      if (error != null) {
        util.debug('exec error: ' + error);
      }
      socket.emit('filegenerated', filename);
    });
  }, 1000);
  return timeoutId;
}

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
    'ffmpeg -i ' + aiffFile + ' -f mp3 -acodec libmp3lame -ab 192000 -ar 44100 ' 
    + mp3File, 
    callback);
}

function rmFile(file) {
  child_process.exec('rm -f ' + file, function(error, stdout, stderr) {
    util.debug('stdout: ' + stdout);
    util.debug('stderr: ' + stderr);
    if (error != null) {
      util.debug('exec error: ' + error);
    }
  });
}

