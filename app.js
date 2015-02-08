var host = '0.0.0.0';
var port = process.env.PORT  || '8081';
process.env.PORT = port;

var Twitter = require('twitter');
var Parser = require('posix-getopt').BasicParser;
var log = require('loglevel');
var fs = require('fs');
var moment = require('moment');

var argv = new Parser('c:dD', process.argv);
var options = makeOptions();
optAssert('c');

var configName = options['c'].indexOf('/') === 0 ? options['c'] : "../" + options['c'];
if (configName.indexOf(".js") === -1) {
    throw new Error(configName + " is not a valid config file.");
}
log.setLevel(options['d'] ? 'debug' : 'error');
log.debug("Options", options);

var config = require('./lib/config.js')(configName);

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
            var tweetUsername = tweet.user.screen_name;

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
            if (streamConfig.maxFromUser > 0 && config.cache.usernames[tweetUsername] &&
                    config.cache.usernames[tweetUsername].count >= streamConfig.maxFromUser) {
                log.debug("SKIP maxFromUser", tweetUsername);
                return;
            }

            // Either no max is configured or we haven't hit the limit yet.
            if (config.cache.usernames[tweetUsername] === undefined) {
                config.cache.usernames[tweetUsername] = {
                    username: tweetUsername,
                    count: 0,
                    date: moment()
                };
            }

            setTimeout(function () {
                log.debug('QUEUEING', tweet.text);
                actionQueue.push(function () {
                    if (options['D'] === undefined) {
                        twitter.post('favorites/create', {
                            id: tweet.id_str
                        }, function(error, tweets, response){
                            if (error) {
                                log.error(error);
                                return;
                            }
                            config.cache.usernames[tweetUsername].count += 1;
                            log.info("FAV", tweet.text);
                        });
                    } else {
                        log.info("FAV", tweet.text);
                    }
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
}, 1000 * 20);

function makeOptions() {
    var options = {};
    while ((option = argv.getopt()) !== undefined) {
        options[option.option] = option.optarg === undefined ? true : option.optarg;
    }
    return options;
}

process.on('uncaughtException', function () {
    log.error(JSON.stringify(config.cache.usernames, null, 4));
});

process.stdin.resume();
process.on('SIGINT', function () {
    if (Object.keys(config.cache.usernames).length < 5) {
        // either not worth it or something went terribly wrong; don't overwrite cache.
        process.exit();
        return;
    }

    Object.keys(config.cache.usernames).forEach(function (name) {
        if (config.cache.usernames[name].count === 0) {
            delete config.cache.usernames[name];
        }
    });

    log.info("Writing", Object.keys(config.cache.usernames).length, "cached users" +
        "cancelling", actionQueue.length, "requests");
    if (options['D'] === undefined) {
        fs.writeFileSync(config.cacheName, "module.exports = " + JSON.stringify(config.cache, null, 4) + ";");
    }
    process.exit();
});

function optAssert(shortCode) {
    if (options[shortCode] === undefined) {
        log.error("Missing required parameter -c config-filename");
        process.exit();
    }
}
