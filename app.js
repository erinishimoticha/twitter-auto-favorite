var host = '0.0.0.0';
var port = process.env.PORT  || '8081';
process.env.PORT = port;

var express = require('express');
var bodyParser = require('body-parser');
var Twitter = require('twitter');

var app = express();
var consumer_key = process.env.TWITTER_CONSUMER_KEY;
var consumer_secret = process.env.TWITTER_CONSUMER_SECRET;
var access_token_key = process.env.TWITTER_ACCESS_TOKEN_KEY;
var access_token_secret = process.env.TWITTER_ACCESS_TOKEN_SECRET;
var twitter = new Twitter({
    consumer_key: process.env.TWITTER_CONSUMER_KEY,
    consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
    access_token_key: process.env.TWITTER_ACCESS_TOKEN_KEY,
    access_token_secret: process.env.TWITTER_ACCESS_TOKEN_SECRET
});

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

twitter.stream('statuses/filter', {track: 'javascript'}, function(stream) {
    stream.on('data', function(tweet) {
        console.log(tweet.text);
    });
});
