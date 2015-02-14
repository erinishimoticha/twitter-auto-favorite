var fs = require('fs');

module.exports = (function () {
    var config = {};

    function buildCache(configName) {
        config.cacheName = configName.replace(".js", "-cache.js");

        try {
            config.cache = require(config.cacheName);
        } catch (err) {
            // It'll be created when the process exits.
            config.cache = {
                usernames: {},
                favorites: []
            };
            return;
        }

        // first update
        Object.keys(config.cache).forEach(function (name) {
            var numFaves;

            if (typeof config.cache[name] === 'object') {
                return;
            }
            numFaves = config.cache[name];

            config.cache[name] = {
                username: name,
                count: numFaves,
                date: moment()
            };
        });

        // second update
        if (!config.cache.usernames) {
            config.cache = {
                usernames: config.cache,
                favorites: []
            };
        }

        if (config.cache.favorites === undefined) {
            config.cache.favorites = [];
        }
    };

    function writeCache(options, log, actionQueue) {
        var fileContents;

        if (Object.keys(config.cache.usernames).length < 5) {
            // either not worth it or something went terribly wrong; don't overwrite cache.
            process.exit();
            return;
        }

        // These got queued but failed.
        Object.keys(config.cache.usernames).forEach(function (name) {
            if (config.cache.usernames[name].count === 0) {
                delete config.cache.usernames[name];
            }
        });

        fileContents = "module.exports = " + JSON.stringify(config.cache, null, 4) + ";\n";

        if (options['D'] === undefined) {
            log.info("Writing", config.cacheName, Object.keys(config.cache.usernames).length, "cached users and",
                config.cache.favorites.length, "cached favs. cancelling", actionQueue.length, "requests");
            fs.writeFileSync(config.cacheName.replace("..", "."), fileContents);
        } else {
            log.info("Dry-run mode. Would have written", Object.keys(config.cache.usernames).length, "cached users and",
                config.cache.favorites.length, "cached favs. cancelling", actionQueue.length, "requests");
        }

        log.debug('done');
    }

    return function(configName) {
        if (configName.indexOf(".js") === -1) {
            throw new Error(configName + " is not a valid config file.");
        }

        config = require(configName);
        buildCache(configName);
        config.writeCache = writeCache;
        return config;
    };
})();
