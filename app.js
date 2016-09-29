var Twitter = require('twitter');
var quasix = require('quasix-getopt');
var log = require('loglevel');
var moment = require('moment');

var options = quasix.parse();
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

var streamConfig = config.stream;
twitter.stream('statuses/filter', {track: streamConfig.track}, function (stream) {
    stream.on('data', onTweet);
    stream.on('error', function (error) {
        log.error("Stream error", streamConfig.track, error);
    });
});

function onTweet(tweet) {
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

    // already faved this tweet
    if (config.cache.favorites.indexOf(tweet.id_str) > -1) {
        return;
    }

    setTimeout(function () {
        log.debug('QUEUEING', tweet.text);
        actionQueue.push(function () {
            if (options['D'] === undefined) {
                twitter.post('favorites/create', {
                    id: tweet.id_str
                }, function(errors, tweets, response){
                    if (errors) {
                        if (errors[0].code === 139) {
                            if (config.cache.favorites.indexOf(tweet.id_str) === -1) {
                                config.cache.favorites.push(tweet.id_str);
                            }
                            log.debug("Already faved", tweet.id_str);
                            return;
                        };
                        log.error(errors);
                        return;
                    }
                    config.cache.usernames[tweetUsername].count += 1;
                    config.cache.favorites.push(tweet.id_str);
                    log.info("FAV", tweet.text);
                });
            } else {
                log.info("FAV", tweet.text);
            }
        });
    }, streamConfig.favDelay);
}

actionTimer = setInterval(function () {
    if (actionQueue.length > 0) {
        actionQueue.shift()();
    }
}, 1000 * 30);

process.on('uncaughtException', function (err) {
    log.error(JSON.stringify(config.cache, null, 4));
    log.error(err);
    process.exit();
});

process.stdin.resume();
process.on('SIGINT', function () {
    config.writeCache(options, log, actionQueue);
    process.exit();
});

function optAssert(shortCode) {
    if (options[shortCode] === undefined) {
        log.error("Missing required parameter: " + "c");
        process.exit();
    }
}
