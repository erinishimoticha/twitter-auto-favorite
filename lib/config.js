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
    };

    return function(configName) {
        if (configName.indexOf(".js") === -1) {
            throw new Error(configName + " is not a valid config file.");
        }

        config = require(configName);
        buildCache(configName);
        return config;
    };
})();
