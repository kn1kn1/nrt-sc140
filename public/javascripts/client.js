// audio.js
audiojs.events.ready(function() {
  audiojs.createAll();
});

// socket.io specific code
var socket = io.connect();
socket.on('connect', onOpenWebSocket);
socket.on('stdout', onReceiveStdout);
socket.on('scserverstarting', onScServerStarting);
socket.on('scserverstarted', onScServerStarted);
socket.on('validationerror', onValidationError);
socket.on('timerecorded', onReceiveTimeRecorded);
socket.on('filegenerated', onFileGenerated);
socket.on('disconnect', onCloseWebSocket);

var scServerStarted = false;
$(document).ready(function(){
  var code = 
    '{f = LFSaw.kr(0.4, 0, 24, LFSaw.kr([8,7.23], 0, 3, 80)).midicps;CombN.ar(SinOsc.ar(f, 0, 0.04), 0.2, 0.2, 4)}.play';
  $('#code').text(code);
  $('#code').focus();
  $('#code').keyup(onCodeChanged);
  setCodeCount($('#code').val().length)
  $('#generate').click(onGenerateClick);
  $('#stop').click(onStopClick);
  $('#stdout').attr('disabled', true);
  editmode();
});

function editmode() {
  $('#code').attr('disabled', false);
  $('#generate').show();
  $('#stop').hide();
  $('#stop').attr('disabled', false);
}

function generatemode() {
  $('#code').attr('disabled', true);
  $('#generate').hide();
  $('#stop').attr('disabled', false);
  $('#stop').show();
}

function onOpenWebSocket() {
  appendOutput('WebSocket connected' + '\n');
}

function onCloseWebSocket() {
  appendOutput('WebSocket disconnected');
}

function onReceiveStdout(msg) {
  appendOutput(msg);
}

function onScServerStarting() {
  scServerStarted = false;
  $('#generate').attr('disabled', true);
}

function onScServerStarted() {
  scServerStarted = true;
  $('#generate').attr('disabled', false);
}

function onCodeChanged() {
  var code = $.trim($('#code').val());
  setCodeCount(code.length)
  socket.emit('validate', code);
}

function onValidationError(msg) {
  if (msg.length == 0) {
    clearValidationError();
    $('#generate').attr('disabled', !scServerStarted);
  } else {
    editmode();
    validationError(msg)
    $('#generate').attr('disabled', true);
  }
}

function onGenerateClick() {
  clearValidationError();
  var code = $.trim($('#code').val());
  generatemode();
  socket.emit('generate', code);
}

function onStopClick() {
  $('#stop').attr('disabled', true);
  socket.emit('stop');
}

function onReceiveTimeRecorded(msg) {
  $('#player').empty();
  $('<div></div>').text(msg + ' sec recorded (Max: 30 sec)').appendTo('#player');
  audiojs.createAll();  // refresh player
}

function onFileGenerated(msg) {
  socket.emit('restartsclang');

  $('#player').empty();
  var mp3 ='/audio/' + msg + '.mp3';
  var aiff ='/audio/' + msg + '.aiff';
  $('<audio></audio>').attr('src', mp3).appendTo('#player');
  $('<a></a>').text('mp3').attr('href', mp3).appendTo('#player');
  $('<a></a>').text('aiff').attr('href', aiff).appendTo('#player');
  audiojs.createAll();  // refresh player

  editmode();
}

function setCodeCount(count) {
  $('#codetitle').text('code (' + count + ' <= 140)');
}

function appendOutput(msg) {
  setOutput($('#stdout').val() + msg);
}

function setOutput(msg) {
  $('#stdout').text(msg);
  $('#stdout').attr('scrollTop', $('#stdout').attr('scrollHeight'))
}

function clearValidationError() {
  $('#validationerror').hide();
}

function validationError(msg) {
  $('#validationerror').hide().text(msg).show();
}
