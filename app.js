var host = '0.0.0.0';
var port = process.env.PORT  || '8081';
process.env.PORT = port;

var Twitter = require('twitter');
var Parser = require('posix-getopt').BasicParser;
var log = require('loglevel');
var fs = require('fs');

var argv = new Parser('c:d', process.argv);
var options = makeOptions();
optAssert('c');

var configName = options['c'].indexOf('/') === 0 ? options['c'] : "./" + options['c'];
var cacheName = configName.replace(".js", "-cache.js");
log.setLevel(options['d'] ? 'debug' : 'error');
log.debug("Options", options);

var config = require(configName);
var usernames = {};
try {
    usernames = require(cacheName);
} catch (err) {
    // It'll be created when the process exits.
}

var twitter = new Twitter({
    consumer_key: config.consumerKey,
    consumer_secret: config.consumerSecret,
    access_token_key: config.accessTokenKey,
    access_token_secret: config.accessTokenSecret
});
var actionQueue = [];
var actionTimer;

config.streams.forEach(function (streamConfig) {
    twitter.stream('statuses/filter', {track: streamConfig.track}, streamListenerBuilder(streamConfig));
});

function streamListenerBuilder(streamConfig) {
    return function (stream) {
        stream.on('data', function(tweet) {
            var numHashtags;

            // Tweet language
            if (streamConfig.language && streamConfig.language.indexOf(tweet.lang) === -1) {
                log.debug("SKIP", tweet.lang, "is not", streamConfig.language);
                return;
            }

            if (streamConfig.maxHashtags > -1) {
                numHashtags = tweet.text.match(/#/g);
                numHashtags = numHashtags ? numHashtags.length : 0;

                // spam
                if (numHashtags > streamConfig.maxHashtags) {
                    log.debug("SKIP", numHashtags, "hashtags is greater than", streamConfig.maxHashtags);
                    return;
                }
            }

            // @-replies
            if (streamConfig.favAtReplies === false && tweet.text.indexOf('@') === 0) {
                log.debug("SKIP @ reply");
                return;
            }

            // contains one of my bad words
            if (streamConfig.filter) {
                for (var i = 0; i < streamConfig.filter.length; i += 1) {
                    var text = streamConfig.filter[i];
                    if (tweet.text.toLowerCase().indexOf(text.toLowerCase()) !== -1) {
                        log.debug("SKIP contains", text);
                        return;
                    }
                }
            }

            // Already faved a tweet from this user during this run of the script.
            if (streamConfig.maxFromUser > 0 && usernames[tweet.user.screen_name] >= streamConfig.maxFromUser) {
                log.debug("SKIP maxFromUser", tweet,user.screen_name);
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
                            log.error(error, response);
                            return;
                        }
                        usernames[tweet.user.screen_name] += 1;
                        log.info("FAV", tweet.text);
                    });
                });
            }, streamConfig.favDelay);
        });

        stream.on('error', function (error) {
            log.error("Stream error", streamConfig.track, error);
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

process.on('uncaughtException', function () {
    console.log(JSON.stringify(usernames));
});

process.stdin.resume();
process.on('SIGINT', function () {
    console.log(JSON.stringify(usernames));
    fs.writeFileSync(cacheName, "module.exports = " + JSON.stringify(usernames) + ";");
    process.exit();
});

function optAssert(shortCode) {
    if (options[shortCode] === undefined) {
        console.log("error: missing required parameter -c config-filename");
        process.exit();
    }
}
