var scServerStarted = false;

$(document).ready(function(){
  var code = 
    '{f = LFSaw.kr(0.4, 0, 24, LFSaw.kr([8,7.23], 0, 3, 80)).midicps;CombN.ar(SinOsc.ar(f, 0, 0.04), 0.2, 0.2, 4)}.play';
  $('#code').text(code);
  $('#code').focus();
  $('#code').keyup(function() {
    var count = $('#code').val().length;
    $('#codetitle').text('code (' + count + ' <= 140)');
    if (count > 140) {
      notification('code can not be over 140.');
      $('#generate').attr('disabled', true);
    } else {
      clearNotification();
      $('#generate').attr('disabled', !scServerStarted);
    }
  });
  $('#codetitle').text('code (' + $('#code').val().length + ' <= 140)');
  $('#generate').attr('disabled', true);
  $('#generate').click(onGenerateClick);
  $('#stop').hide();
  $('#stop').click(onStopClick);
  $('#stdout').attr('disabled', true);
});

// audio.js
audiojs.events.ready(function() {
  audiojs.createAll();
});

// socket.io specific code
var socket = io.connect();
socket.on('connect', onOpenWebSocket);
socket.on('stdout', onReceiveStdout);
socket.on('scserverstating', onScServerStating);
socket.on('scserverstated', onScServerStated);
socket.on('notification', onReceiveNotification);
socket.on('timerecorded', onReceiveTimeRecorded);
socket.on('filegenerated', onFileGenerated);
socket.on('disconnect', onCloseWebSocket);

function onOpenWebSocket() {
  appendOutput('WebSocket connected' + '\n');
}

function onCloseWebSocket() {
  appendOutput('WebSocket disconnected');
}

function onReceiveStdout(msg) {
  appendOutput(msg);
}

function onScServerStating() {
  scServerStarted = false;
  $('#generate').attr('disabled', true);
}

function onScServerStated() {
  scServerStarted = true;
  $('#generate').attr('disabled', false);
}

function onReceiveNotification(msg) {
  notification(msg)
}

function onReceiveTimeRecorded(msg) {
  $('#player').empty();
  $('<div></div>').text(msg + ' sec recorded (Max: 30 sec)').appendTo('#player');
  audiojs.createAll();  // refresh player
}

function onFileGenerated(msg) {
  $('#player').empty();
  var mp3 ='/audio/' + msg + '.mp3';
  var aiff ='/audio/' + msg + '.aiff';
  $('<audio></audio>').attr('src', mp3).appendTo('#player');
  $('<a></a>').text('mp3').attr('href', mp3).appendTo('#player');
  $('<a></a>').text('aiff').attr('href', aiff).appendTo('#player');
  audiojs.createAll();  // refresh player

  $('#code').attr('disabled', false);
  $('#generate').show();
  $('#stop').hide();
  $('#stop').attr('disabled', false);
}

function onGenerateClick() {
  clearNotification();
  var code = $('#code').val();
  if (code == '') return;
  if (code.length > 140) {
    notification('code can not be over 140.');
    return;
  }
  $('#code').attr('disabled', true);
  $('#generate').hide();
  $('#stop').attr('disabled', false);
  $('#stop').show();
  socket.emit('generate', code);
}

function onStopClick() {
  $('#stop').attr('disabled', true);
  socket.emit('stop');
}

function appendOutput(msg) {
  setOutput($('#stdout').val() + msg);
}

function setOutput(msg) {
  $('#stdout').text(msg);
  $('#stdout').attr('scrollTop', $('#stdout').attr('scrollHeight'))
}

function clearNotification() {
  $('#notification').hide();
}

function notification(msg) {
  $('#notification').hide().text(msg).show();
}
