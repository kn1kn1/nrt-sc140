$(function () {
  "use strict";
  var socket,
    code,
    generateButton,
    stopButton,
    stdout,
    audioPlayer,
    validationErr,
    mediator;

  socket = {
    setup: function () {
      this._sock = io.connect();
      this._sock.on('connect', this._onOpenWebSocket);
      this._sock.on('stdout', this._onReceiveStdout);
      this._sock.on('scserverstarting', this._onScServerStarting);
      this._sock.on('scserverstarted', this._onScServerStarted);
      this._sock.on('validationerror', this._onValidationError);
      this._sock.on('timerecorded', this._onReceiveTimeRecorded);
      this._sock.on('filegenerated', this._onFileGenerated);
      this._sock.on('disconnect', this._onCloseWebSocket);
      return this;
    },

    emit: function () {
      this._sock.emit.apply(this._sock, arguments);
    },

    _onOpenWebSocket: function () {
      mediator.appendStdout('WebSocket connected' + '\n');
    },

    _onCloseWebSocket: function () {
      mediator.appendStdout('WebSocket disconnected');
      mediator.setScServerStarted(false);
    },

    _onReceiveStdout: function (msg) {
      mediator.appendStdout(msg);
    },

    _onScServerStarting: function () {
      mediator.setScServerStarted(false);
    },

    _onScServerStarted: function () {
      mediator.setScServerStarted(true);
    },

    _onValidationError: function (msg) {
      if (msg) {
        mediator.setValidationErrorText(msg);
      } else {
        mediator.clearValidationErrorText();
      }
    },

    _onReceiveTimeRecorded: function (sec) {
      mediator.setRecordedTimeText(sec);
    },

    _onFileGenerated: function (filename) {
      mediator.showPlayer(filename);
    }
  }.setup();

  code = {
    setup: function (initialCode) {
      this._textarea = $('#code');
      this._title = $('#codetitle');

      var textarea = this._textarea;
      var thisObj = this;
      textarea.focus();
      textarea.keyup(function () {
        thisObj._onTextChanged.apply(thisObj);
      });

      if (initialCode) {
        this.setText(initialCode);
      }
      return this;
    },

    disable: function (b) {
      this._textarea.attr('disabled', b ? true : false);
    },

    setText: function (text) {
      this._textarea.text(text);
      this._onTextChanged();
    },

    val: function () {
      return $.trim(this._textarea.val());
    },

    _setCodeCountText: function (count) {
      this._title.text('code (' + count + ' <= 140)');
    },

    _onTextChanged: function () {
      var val = this.val();
      this._setCodeCountText(val.length);
      mediator.validateCodeText();
    }
  };

  generateButton = {
    setup: function () {
      var thisObj = this;
      this._button = $('#generate');
      this._button.click(function () {
        thisObj._onClick.apply(thisObj);
      });
      return this;
    },

    disable: function (b) {
      this._button.attr('disabled', b ? true : false);
    },

    show: function () {
      this._button.show.apply(this._button, arguments);
    },

    hide: function () {
      this._button.hide.apply(this._button, arguments);
    },

    _onClick: function () {
      this.disable(true);
      mediator.startGenerating();
    }
  };

  stopButton = {
    setup: function () {
      var thisObj = this;
      this._button = $('#stop');
      this._button.click(function () {
        thisObj._onClick.apply(thisObj);
      });
      return this;
    },

    disable: function (b) {
      this._button.attr('disabled', b ? true : false);
    },

    show: function () {
      this.disable(false);
      this._button.show.apply(this._button, arguments);
    },

    hide: function () {
      this._button.hide.apply(this._button, arguments);
    },

    _onClick: function () {
      this.disable(true);
      mediator.stopGenerating();
    }
  };

  stdout = {
    setup: function () {
      this._textarea = $('#stdout');
      this._textarea.attr('disabled', true);
      return this;
    },

    appendText: function (msg) {
      this.setText(this._textarea.val() + msg);
    },

    setText: function (msg) {
      var textarea = this._textarea;
      textarea.text(msg);
      textarea.attr('scrollTop', textarea.attr('scrollHeight'));
    }
  };

  audioPlayer = {
    setup: function () {
      this._div = $('#player');
      return this;
    },

    setRecordedTimeText: function (sec) {
      this._div.empty();

      var myhtml = '<div>' + sec + ' sec recorded (Max: 30 sec)' + '</div>';
      this._div.html(myhtml);

      this._refreshAudiojsPlayer();
    },

    showPlayer: function (filename) {
      this._div.empty();

      var mp3 = '/audio/' + filename + '.mp3';
      var aiff = '/audio/' + filename + '.aiff';
      var myhtml = '<audio src=\"' + mp3 + '\"></audio>' +
        '<a href=\"' + mp3 + '\">mp3</a>' +
        '<a href=\"' + aiff + '\">aiff</a>';
      this._div.html(myhtml);

      this._refreshAudiojsPlayer();
    },

    _refreshAudiojsPlayer: function () {
      audiojs.createAll();
    }
  };

  validationErr = {
    setup: function () {
      this._hasErr = false;
      this._div = $('#validationerror');
      return this;
    },

    hasErr: function () {
      return this._hasErr;
    },

    clear: function () {
      this._div.hide();
      this._hasErr = false;
    },

    show: function (msg) {
      this._div.hide().text(msg).show();
      this._hasErr = true;
    }
  };

  mediator = {
    _scServerStarted: false,

    _socket: socket,
    _code: code,
    _generateButton: generateButton,
    _stopButton: stopButton,
    _stdout: stdout,
    _audioPlayer: audioPlayer,
    _validationErr: validationErr,

    setup: function () {
      this._code.setup();
      this._generateButton.setup();
      this._stopButton.setup();
      this._stdout.setup();
      this._audioPlayer.setup();
      this._validationErr.setup();
      this._setEditmode();
    },

    setScServerStarted: function (b) {
      var started = b ? true : false;
      this._scServerStarted = started;
      if (!started) {
        this._setEditmode();
      }
      this._refreshGenerateButtonStatus();
    },

    setCodeText: function (text) {
      this._code.setText(text);
    },

    validateCodeText: function () {
      this._socketEmit('validate', this._code.val());
    },

    startGenerating: function () {
      this._setGeneratemode();
      this._socketEmit('generate', this._code.val());
    },

    stopGenerating: function () {
      this._socketEmit('stop');
    },

    appendStdout: function (text) {
      this._stdout.appendText(text);
    },

    setRecordedTimeText: function (sec) {
      this._audioPlayer.setRecordedTimeText(sec);
    },

    showPlayer: function (filename) {
      this._socketEmit('restartsclang');
      this._audioPlayer.showPlayer(filename);
      this._setEditmode();
    },

    setValidationErrorText: function (msg) {
      this._setEditmode();
      this._validationErr.show(msg);
      this._refreshGenerateButtonStatus();
    },

    clearValidationErrorText: function () {
      this._validationErr.clear();
      this._refreshGenerateButtonStatus();
    },

    _socketEmit: function () {
      this._socket.emit.apply(this._socket, arguments);
    },

    _setEditmode: function () {
      this._code.disable(false);
      this._generateButton.show();
      this._stopButton.hide();
    },

    _setGeneratemode: function () {
      this._code.disable(true);
      this._generateButton.hide();
      this._stopButton.show();
    },

    _refreshGenerateButtonStatus: function () {
      if (this._validationErr.hasErr()) {
        this._generateButton.disable(true);
        return;
      }
      this._generateButton.disable(this._scServerStarted ? false : true);
    }
  };

  // audio.js
  audiojs.events.ready(function () {
    audiojs.createAll();
  });

  var INITIAL_CODE =
    '{f = LFSaw.kr(0.4, 0, 24, LFSaw.kr([8,7.23], 0, 3, 80)).midicps;CombN.ar(SinOsc.ar(f, 0, 0.04), 0.2, 0.2, 4)}.play';
  mediator.setup();
  mediator.setCodeText(INITIAL_CODE);
});

