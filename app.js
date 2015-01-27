var host = '0.0.0.0';
var port = process.env.PORT  || '8081';
process.env.PORT = port;

var express = require('express');
var bodyParser = require('body-parser');
var Twitter = require('twitter');

var maxHashtags = 3;

var app = express();
var usernames = {};
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
    var filterOut = ['php', 'job'];
    stream.on('data', function(tweet) {
        var numHashtags;

        // not english
        if (tweet.lang !== "en") {
            return;
        }

        numHashtags = tweet.text.match(/#/g);
        numHashtags = numHashtags ? numHashtags.length : 0;

        // spam
        if (numHashtags > maxHashtags) {
            return;
        }

        // @-replies
        if (tweet.text.indexOf('@') === 0) {
            return;
        }

        // contains one of my bad words
        for (var i = 0; i < filterOut.length; i += 1) {
            var text = filterOut[i];
            if (tweet.text.toLowerCase().indexOf(text.toLowerCase()) !== -1) {
                return;
            }
        }

        // Already faved a tweet from this user during this run of the script.
        if (usernames[tweet.user.screen_name]) {
            return;
        }

        usernames[tweet.user.screen_name] = true;
        setTimeout(function () {
            twitter.post('favorites/create', {
                id: tweet.id_str
            }, function(error, tweets, response){
                if (error) {
                    usernames[tweet.user.screen_name] = false;
                    console.log("ERROR", tweet.user.screen_name, tweet.id_str);
                    return;
                }
                console.log("FAV", tweet.text);
            });
        }, 1000 * 5 * 60);
    });
});
