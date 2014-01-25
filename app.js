
/**
 * Module dependencies.
 */

var express = require('express');
var routes = require('./routes');
var http = require('http');
var path = require('path');
var sio = require('socket.io');
var path = require('path');
var util = require('util');
var fs = require('fs');
var NrtSc140 = require('./nrtsc140').NrtSc140;

// For backwards compatibility with node 0.6
fs.existsSync || (fs.existsSync = path.existsSync);

var app = express();

// all environments
app.set('port', process.env.PORT || 3000);
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');
app.use(express.favicon());
app.use(express.logger('dev'));
app.use(express.json());
app.use(express.urlencoded());
app.use(express.methodOverride());
app.use(app.router);
app.use(express.static(path.join(__dirname, 'public')));

// development only
if ('development' === app.get('env')) {
  app.use(express.errorHandler());
}

app.get('/', routes.index);

var audioDir = path.join(process.cwd(), 'public', 'audio');
if (!fs.existsSync(audioDir)) {
  fs.mkdirSync(audioDir);
}

var sclangPath = '';
var configFile = './config.json'; 
if (fs.existsSync(configFile)) {
  var config = require(configFile);
  if (config) {
    sclangPath = config.sclang_path;
  }
}
console.log("path: %s", sclangPath);

var server = http.createServer(app).listen(app.get('port'), function(){
  console.log("Express server listening on port " + app.get('port'));
});

var socket = sio.listen(server);
socket.on('connection', function(sock) {
  util.debug('connection');
  var nrtsc140 = new NrtSc140(sock, sclangPath);
  nrtsc140.start();
});
