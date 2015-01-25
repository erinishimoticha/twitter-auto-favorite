var host = '0.0.0.0';
var port = process.env.PORT  || '8081';
process.env.PORT = port;

var express = require('express');
var app = express();
var bodyParser = require('body-parser');

var roleId = process.env.ROLE_ID || 'D9786EA7-BCB4-4229-89F7-8783C821DF8C';

app.use(bodyParser());

app.use(function(req, res, next){
	console.log('%s %s', req.method, req.url);
    next();
});

app.use('/', express.static(__dirname + "/assets"));
console.log("static dir is", "'" + __dirname + "/assets'");

app.listen(port, host, function(){
	console.log('listening ');
});
