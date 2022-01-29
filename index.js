const fs = require('fs');
const fsp = require('fs').promises;


module.exports = function (app) {

  let unsubscribes = []

  let record = {
    port: {
      ratePath: 'propulsion.port.fuel.rate',
      usedPath: 'propulsion.port.trip.fuelUsed',
      firstTime: undefined,
      secondTime: undefined,
      fuelUsedTime: undefined,
      fuelUsed: undefined
    },
    starboard: {
      ratePath: 'propulsion.starboard.fuel.rate',
      usedPath: 'propulsion.starboard.trip.fuelUsed',
      firstTime: undefined,
      secondTime: undefined,
      fuelUsedTime: undefined,
      fuelUsed: undefined
    }
  };


  let updateDeltaInterval

  let saveFuelUsageInterval

  let instanceFromPath = function(path) {
    return path.split('.')[1];
  }

  let _loadFuelUsage = function(options) {
    if (options.savedUsage) {
      record.port.fuelUsed = options.savedUsage.port;
      record.starboard.fuelUsed = options.savedUsage.starboard;
    }

    return options
  }

  let sendData = function(instance) {
    const dst = 255;
    const pgn = {
      pgn: 127497,
      dst: dst,
    };

    let trip = app.signalk.self.propulsion[instance].trip;

    if (!trip) {
      return;
    }

    instance == 'port' ? pgn['Instance'] = 0 : pgn['Instance'] = 1;
    pgn['Trip Fuel Used'] = (trip.fuelUsed.value * 1000);
    pgn['Fuel Rate, Average'] = 0;
    pgn['Fuel Rate, Economy'] = 0;
    pgn['Instantaneous Fuel Economy'] = 0;
    // app.debug('sending %j', pgn)
    // app.debug('sending update');
    app.emit('nmea2000JsonOut', pgn)
  }

  let updateDelta = function() {
    for (const [key, value] of Object.entries(record)) {
      timeTrigger = Date.now() - value.fuelUsedTime
      if (timeTrigger <= 5000) {
        app.handleMessage(plugin.id, {
          updates: [
            {
              values: [
                {
                  path: value.usedPath,
                  value: value.fuelUsed
                }
              ]
            }
          ]
        })
      }
      sendData(key);
     }
  }

  let _localSubscription = function(options) {
    const subscribeArray = []
    for (const [key, value] of Object.entries(record)) {
      subscribeArray.push({
        path: value.ratePath,
        policy: "instant"
      })
    }
    return (localSubscription = {
      "context" : "vessels.self",
      "subscribe" : subscribeArray
    })
  }

  let _saveFuelUsage = function(options) {
    for (const [key, value] of Object.entries(record)) {
      options.savedUsage[key] = value.fuelUsed
    };
    app.savePluginOptions(options, () => {
      // app.debug(`Fuel Used: ${JSON.stringify(options.savedUsage)}`)
    });
  }

  let fuelCalc = function (options, record, instance, value, timestamp) {
    if (record[instance]['firstTime'] == undefined) {
      // app.debug(`${record[instance]} is undefined so creating the first timestamp'`)
      record[instance]['firstTime']={'firstTime':timestamp}
    }

    if (record[instance].firstTime) {
      record[instance].secondTime = timestamp
      var elapsedTime = record[instance].secondTime - record[instance].firstTime
      //app.debug(`elapsedTime is ${elapsedTime}`)
      if (elapsedTime!= 0) {
        if (elapsedTime <= options.timeout) {
          const instantFuelUsage = value * (elapsedTime / 1000)
          //app.debug(`instantFuelUsage: ${instantFuelUsage}`)
          if (record[instance].fuelUsed == undefined) {
            record[instance].fuelUsed = instantFuelUsage
            record[instance].fuelUsedTime = Date.now()
          } else {
            record[instance].fuelUsed+=instantFuelUsage
            record[instance].fuelUsedTime = Date.now()
          }
          options.savedUsage[instance] = record[instance].fuelUsed
          //app.debug(JSON.stringify(options))
        }
        record[instance].firstTime = timestamp
      }
    }
  }


  let _start = function(options) {
    app.debug(`${plugin.name} Started...`)

    if (!options.savedUsage) {
      options.savedUsage = {
        port: 0,
        starboard: 0
      };
    }

    let putActionHandler = function (context, path, value, callback) {
      for (const [key, value] of Object.entries(record)) {
        app.debug(`Resetting ${key}`);
        record[key].fuelUsed = 0;
        record[key].fuelUsedTime = Date.now();
      }
      _saveFuelUsage(options);

      if (true) { //doSomething(context, path, value)){
        return { state: 'COMPLETED', statusCode: 200 };
      } else {
        return { state: 'COMPLETED', statusCode: 400 };
      }
    };

    let fuelUsage = _loadFuelUsage(options).savedUsage
    app.debug(fuelUsage)

    updateDeltaInterval = setInterval(function() {
      updateDelta();
    }, 1000);

    saveFuelUsageInterval = setInterval(function() {
      _saveFuelUsage(options);
    }, options.saveFreq);

    let uuid = app.getSelfPath('uuid');
    for (const [key, value] of Object.entries(record)) {
      app.registerPutHandler('vessels.' + uuid, value.usedPath, putActionHandler);
    }

    app.subscriptionmanager.subscribe(
      _localSubscription(options),
      unsubscribes,
      subscriptionError => {
        app.error('Error:' + subscriptionError);
      },
      delta => {
        delta.updates.forEach(u => {
          fuelCalc(options, record, instanceFromPath(u.values[0].path), u.values[0].value, Date.parse(u.timestamp))
          //app.debug(u);
        });
      }
    );

  }

  let _stop = function(options) {
    app.debug(`${plugin.name} Stopped...`)
    unsubscribes.forEach(f => f());
    unsubscribes = [];

    if (updateDeltaInterval) {
      clearInterval(updateDeltaInterval);
    }
    // clean up the state
    updateDeltaInterval = undefined;

    if (saveFuelUsageInterval) {
      clearInterval(saveFuelUsageInterval);
    }
    // clean up the state
    saveFuelUsageInterval = undefined;
  }

  const plugin = {
    id: 'signalk-fuel-usage',
    name: 'Fuel Usage Calculator',
    description: 'A Signalk plugin to calculate your fuel usage based on propulsion.*.fuel.rate',

    schema: {
      type: 'object',
      required: ['saveFreq'],
      properties: {
        saveFreq: {
          type: 'number',
          title: 'How often to save the fuel used to disk',
          default: 15000
        },
        timeout: {
          type: 'number',
          title: 'How long until timeout',
          default: 10000
        }
      }
    },


    start: _start,
    stop: _stop
  }


return plugin;

}
