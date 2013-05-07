
/**
 * Module dependencies.
 */

var express = require('express')
  , sio = require('socket.io')
  , routes = require('./routes')
  , path = require('path')
  , util = require('util')
  , fs = require('fs')
  , NrtSc140 = require('./nrtsc140').NrtSc140

// For backwards compatibility with node 0.6
fs.existsSync || (fs.existsSync = path.existsSync);

var app = module.exports = express.createServer();

// Configuration

app.configure(function(){
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(app.router);
  app.use(express.static(__dirname + '/public'));
});

app.configure('development', function(){
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true })); 
});

app.configure('production', function(){
  app.use(express.errorHandler()); 
});

// Routes

app.get('/', routes.index);

app.listen(3000);
console.log("Express server listening in %s mode", app.settings.env);

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

// Socket IO
var io = sio.listen(app);
io.sockets.on('connection', function(socket) {
  util.debug('connection');
  var nrtsc140 = new NrtSc140(socket, sclangPath);
  nrtsc140.start();
});

