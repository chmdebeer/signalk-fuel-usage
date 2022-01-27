# fuel-usage-calculator
 A signalk plugin that calculates fuel uage from `propulsion.*.fuel.rate`
 The plugin is designed to calculate fuel consumption based on your fuel rate. It determines the instant fuel usage between value updates by using the time difference and the fuel.rate.
 
## Config Parameters

### Paths to use for fuel calculations
the paths you want to use to calculate the fuel consumption from. it should be in the propulsion.<RegExp>.fuel.rate
```['propulsion.port.fuel.rate','propulsion.starboard.fuel.rate']```

### How often to save the fuel used to disk
This is how often the fuel used will be saved to a file. If the plugin or signalk is stopped this is the fuel.used value the plugin will start from
```15000```

### TimeOut 
The Timeout setting in the node's configuration, should be set to at least the maximum interval between successive readings. This is to avoid the situation where for example, a sensor is taken off line, develops a fault or there is a communication problem, resulting in a break of several hours between readings and the calculation - interval x fuel.rate = fuel.used would then be inaccurate.

```10000```
