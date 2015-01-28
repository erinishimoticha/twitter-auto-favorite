var host = '0.0.0.0';
var port = process.env.PORT  || '8081';
process.env.PORT = port;

var express = require('express');
var bodyParser = require('body-parser');
var Twitter = require('twitter');
var Parser = require('posix-getopt').BasicParser;

var argv = new Parser('c:(config-file)', process.argv);
var options = makeOptions();
var requireName = options['c'].indexOf('/') === 0 ? options['c'] : "./" + options['c'];

var config = require(requireName);
var app = express();
var usernames = {};
var twitter = new Twitter({
    consumer_key: config.consumerKey,
    consumer_secret: config.consumerSecret,
    access_token_key: config.accessTokenKey,
    access_token_secret: config.accessTokenSecret
});
var actionQueue = [];
var actionTimer;

app.use(bodyParser());

app.use(function(req, res, next){
	console.log('%s %s', req.method, req.url);
    next();
});

app.use('/', express.static(__dirname + "/assets"));
console.log("static dir is", "'" + __dirname + "/assets'");

app.listen(port, host, function () {
	console.log('Server started at', host + ":" + port);
});

config.streams.forEach(function (streamConfig) {
    twitter.stream('statuses/filter', {track: streamConfig.track}, streamListenerBuilder(streamConfig));
});

function streamListenerBuilder(streamConfig) {
    return function (stream) {
        stream.on('data', function(tweet) {
            var numHashtags;

            // Tweet language
            if (streamConfig.language && streamConfig.language.indexOf(tweet.lang) === -1) {
                return;
            }

            if (streamConfig.maxHashtags > -1) {
                numHashtags = tweet.text.match(/#/g);
                numHashtags = numHashtags ? numHashtags.length : 0;

                // spam
                if (numHashtags > streamConfig.maxHashtags) {
                    return;
                }
            }

            // @-replies
            if (streamConfig.favAtReplies === false && tweet.text.indexOf('@') === 0) {
                return;
            }

            // contains one of my bad words
            if (streamConfig.filter) {
                for (var i = 0; i < streamConfig.filter.length; i += 1) {
                    var text = streamConfig.filter[i];
                    if (tweet.text.toLowerCase().indexOf(text.toLowerCase()) !== -1) {
                        return;
                    }
                }
            }

            // Already faved a tweet from this user during this run of the script.
            if (streamConfig.maxFromUser > 0 && usernames[tweet.user.screen_name] >= streamConfig.maxFromUser) {
                return;
            }

            // Either no max is configured or we haven't hit the limit yet.
            if (usernames[tweet.user.screen_name] === undefined) {
                usernames[tweet.user.screen_name] = 0;
            }

            setTimeout(function () {
                actionQueue.push(function () {
                    twitter.post('favorites/create', {
                        id: tweet.id_str
                    }, function(error, tweets, response){
                        if (error) {
                            console.log("ERROR", response.statusCode, tweet.user.screen_name, tweet.id_str);
                            return;
                        }
                        usernames[tweet.user.screen_name] += 1;
                        console.log("FAV", tweet.text);
                    });
                });
            }, streamConfig.favDelay);
        });

        stream.on('error', function (error) {
            console.log("Error on", streamConfig.track, error.source);
        });
    };
};

actionTimer = setInterval(function () {
    if (actionQueue.length > 0) {
        actionQueue.shift()();
    }
}, 1000);

function makeOptions() {
    var options = {};
    while ((option = argv.getopt()) !== undefined) {
        options[option.option] = option.optarg === undefined ? true : option.optarg;
    }
    return options;
}
