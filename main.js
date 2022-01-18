"use strict";

/*
 * Created with @iobroker/create-adapter v2.0.1
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require("@iobroker/adapter-core");
const Net = require('net');
// Load your modules here, e.g.:
// const fs = require("fs");

class EpsonEscVp21 extends utils.Adapter {

    /**
     * @param {Partial<utils.AdapterOptions>} [options={}]
     */
    constructor(options) {
        super({
            ...options,
            name: "epson-esc-vp21",
        });
        this.on("ready", this.onReady.bind(this));
        this.on("stateChange", this.onStateChange.bind(this));
        // this.on("objectChange", this.onObjectChange.bind(this));
        // this.on("message", this.onMessage.bind(this));
        this.on("unload", this.onUnload.bind(this));
    }

    _client = null;

    connectionEstablished () {
	// If there is no error, the server has accepted the request and created a new 
	// socket dedicated to us.
	this.log.info ('XX: TCP connection established with the server.');

	// The client can now send data to the server by writing to its socket.
	this._client.write (Buffer ([0x45, 0x53, 0x43, 0x2f, 0x56, 0x50, 0x2e, 0x6e, 0x65, 0x74, 0x10, 3, 0, 0, 0, 0]));
	//this.client.write('ESC/VP.net' + String.fromCharCode.apply (null, [16, 3, 0, 0, 0, 0]));
    }

    pollDeviceStatus () {
	this._client.write ("PWR?\r");
    }

    gotValue (name, val) {
	this.log.info ("Value: " + name + " = " + val);
    }
    
    gotState (name) {
	this.log.info ("State: " + name);
    }
    
    readFromDevice (data) {
	this.log.info ("Got: " + JSON.stringify (data));

	if (data instanceof Buffer) {
	    if (data.compare (Buffer ([69,83,67,47,86,80,46,110,101,116,16,3,0,0,32,0])) == 0) {
		if (this.connected)
		    this.log.info ("Got connection start string from projector while already connected");
		
		this.connected = true;
		this.setState ('info.connection', true, true);

		this.pollDeviceStatus ();
	    } else {
		let s = String.fromCharCode.apply (null, data);
		this.log.info ("Got reply: '" + s + "'");

		let a = s.split ('\r');
		for (let i=0; i < a.length; ++i) {
		    if (a[i] == ':') {
			this.log.info ("Ready for new commands");
		    } else {
			let v = a[i].split ('=');
			if (v.length == 2) {
			    this.gotValue (v[0], v[1]);
			} else if (v.length == 1) {
			    this.gotState (v[0]);
			} else
			    this.log.info ("Reply " + JSON.stringify (v) + " not parsed");
		    }
		}
		
		//for (let i=0; i < data.length; ++i)
		//	this.log.info ("data["+String(i)+"]: " + String (data[i]) + " '" + String.fromCharCode (data[i]) + "'");
	    }
	} else
	    this.log.info ("not Buffer?");
	
    }

    clientOn (type, add1, add2, add3, add4) {
	this.log.info ("Got client on " + JSON.stringify (type) + ': ' + JSON.stringify (add1)
		       + ", " + JSON.stringify (add2)
		       + ", " + JSON.stringify (add3)
		       + ", " + JSON.stringify (add4));
    }

    connectToDevice () {
	// The port number and hostname of the server.
	const port = this.config.port_number;
	const host = this.config.net_address;

	// Create a new TCP client.
	this._client = new Net.Socket();

	// Send a connection request to the server.
	this._client.on('connect', this.connectionEstablished.bind(this));
	this._client.on('data', this.readFromDevice.bind(this));
	this._client.on('end', this.clientOn.bind(this, 'end'));
	this._client.on('error', this.clientOn.bind(this, 'error'));
	this._client.on('close', this.clientOn.bind(this, 'close'));

	this._client.connect ({ port: port, host: host});

        // The client can also receive data from the server by reading from its socket.
        //client.on('data', function(chunk) {
	//    console.log(`Data received from the server: ${chunk.toString()}.`);
	    
	//    // Request an end to the connection after the data has been received.
	//    client.end();
	//});

	//client.on('end', function() {
	//    console.log('Requested an end to the TCP connection');
	//});
	return;
	axios({
            method: 'get',
            baseURL: 'https://data.sensor.community/airrohr/v1/sensor/',
            url: '/' + sensorIdentifier.replace(/\D/g,'') + '/',
            timeout: this.config.requestTimeout * 1000,
            responseType: 'json'
        }).then(
            async (response) => {
                const content = response.data;

                this.log.debug('remote request done');
                this.log.debug('received data (' + response.status + '): ' + JSON.stringify(content));

                await this.setStateAsync(path + 'responseCode', {val: response.status, ack: true});

                if (content && Array.isArray(content) && content.length > 0) {
                    const sensorData = content[0];

                    if (sensorData && Object.prototype.hasOwnProperty.call(sensorData, 'sensordatavalues')) {
                        for (const key in sensorData.sensordatavalues) {
                            const obj = sensorData.sensordatavalues[key];

                            let unit = null;
                            let role = 'value';

                            if (obj.value_type.indexOf('noise') >= 0) {
                                unit = 'dB(A)';
                                role = 'value';
                            } else if (Object.prototype.hasOwnProperty.call(unitList, obj.value_type)) {
                                unit = unitList[obj.value_type];
                                role = roleList[obj.value_type];
                            }

                            await this.setObjectNotExistsAsync(path + 'SDS_' + obj.value_type, {
                                type: 'state',
                                common: {
                                    name: obj.value_type,
                                    type: 'number',
                                    role: role,
                                    unit: unit,
                                    read: true,
                                    write: false
                                },
                                native: {}
                            });
                            await this.setStateAsync(path + 'SDS_' + obj.value_type, {val: parseFloat(obj.value), ack: true});
                        }
                    }

                    if (Object.prototype.hasOwnProperty.call(sensorData, 'location')) {
                        await this.setObjectNotExistsAsync(path + 'location', {
                            type: 'channel',
                            common: {
                                name: {
                                    en: 'Location',
                                    de: 'Standort',
                                    ru: 'Место нахождения',
                                    pt: 'Localização',
                                    nl: 'Plaats',
                                    fr: 'Emplacement',
                                    it: 'Posizione',
                                    es: 'Localización',
                                    pl: 'Lokalizacja',
                                    'zh-cn': '地点'
                                },
                                role: 'value.gps'
                            }
                        });

                        await this.setObjectNotExistsAsync(path + 'location.longitude', {
                            type: 'state',
                            common: {
                                name: {
                                    en: 'Longtitude',
                                    de: 'Längengrad',
                                    ru: 'Долгота',
                                    pt: 'Longitude',
                                    nl: 'lengtegraad',
                                    fr: 'Longitude',
                                    it: 'longitudine',
                                    es: 'Longitud',
                                    pl: 'Długość geograficzna',
                                    'zh-cn': '经度'
                                },
                                type: 'number',
                                role: 'value.gps.longitude',
                                unit: '°',
                                read: true,
                                write: false
                            },
                            native: {}
                        });
                        await this.setStateAsync(path + 'location.longitude', {val: parseFloat(sensorData.location.longitude), ack: true});
                    }
                }
            }
        ).catch(
            (error) => {
                if (error.response) {
                    // The request was made and the server responded with a status code

                    this.log.warn('received error ' + error.response.status + ' response from remote sensor ' + sensorIdentifier + ' with content: ' + JSON.stringify(error.response.data));
                    this.setStateAsync(path + 'responseCode', {val: error.response.status, ack: true});
                } else if (error.request) {
                    // The request was made but no response was received
                    // `error.request` is an instance of XMLHttpRequest in the browser and an instance of
                    // http.ClientRequest in node.js
                    this.log.info(error.message);
                    this.setStateAsync(path + 'responseCode', -1, true);
                } else {
                    // Something happened in setting up the request that triggered an Error
                    this.log.info(error.message);
                    this.setStateAsync(path + 'responseCode', -99, true);
                }
            }
        );
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        // Initialize your adapter here

        // Reset the connection indicator during startup
        this.setState("info.connection", false, true);

        // The adapters config (in the instance object everything under the attribute "native") is accessible via
        // this.config:
        this.log.info("config net_address: " + this.config.net_address);
        this.log.info("config port_number: " + this.config.port_number);
        this.log.info("config poll_intervall: " + this.config.poll_intervall);

        /*
        For every state in the system there has to be also an object of type state
        Here a simple template for a boolean variable named "testVariable"
        Because every adapter instance uses its own unique namespace variable names can't collide with other adapters variables
        */
        await this.setObjectNotExistsAsync("power", {
            type: "state",
            common: {
                name: "power",
                type: "boolean",
                role: "indicator",
                read: true,
                write: true,
            },
            native: {},
        });

        // In order to get state updates, you need to subscribe to them. The following line adds a subscription for our variable we have created above.
        this.subscribeStates("power");
        // You can also add a subscription for multiple states. The following line watches all states starting with "lights."
        // this.subscribeStates("lights.*");
        // Or, if you really must, you can also watch all states. Don't do this if you don't need to. Otherwise this will cause a lot of unnecessary load on the system:
        // this.subscribeStates("*");

        /*
            setState examples
            you will notice that each setState will cause the stateChange event to fire (because of above subscribeStates cmd)
        */
        // the variable testVariable is set to true as command (ack=false)
        //await this.setStateAsync("testVariable", true);

        // same thing, but the value is flagged "ack"
        // ack should be always set to true if the value is received from or acknowledged from the target system
        //await this.setStateAsync("testVariable", { val: true, ack: true });

        // same thing, but the state is deleted after 30s (getState will return null afterwards)
        //await this.setStateAsync("testVariable", { val: true, ack: true, expire: 30 });

        // examples for the checkPassword/checkGroup functions
        //let result = await this.checkPasswordAsync("admin", "iobroker");
        //this.log.info("check user admin pw iobroker: " + result);

        //result = await this.checkGroupAsync("admin", "admin");
        //this.log.info("check group user admin group admin: " + result);

	this.connectToDevice ();
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     * @param {() => void} callback
     */
    onUnload(callback) {
        try {
            // Here you must clear all timeouts or intervals that may still be active
            // clearTimeout(timeout1);
            // clearTimeout(timeout2);
            // ...
            // clearInterval(interval1);

            callback();
        } catch (e) {
            callback();
        }
    }

    // If you need to react to object changes, uncomment the following block and the corresponding line in the constructor.
    // You also need to subscribe to the objects with `this.subscribeObjects`, similar to `this.subscribeStates`.
    // /**
    //  * Is called if a subscribed object changes
    //  * @param {string} id
    //  * @param {ioBroker.Object | null | undefined} obj
    //  */
    // onObjectChange(id, obj) {
    //     if (obj) {
    //         // The object was changed
    //         this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
    //     } else {
    //         // The object was deleted
    //         this.log.info(`object ${id} deleted`);
    //     }
    // }

    /**
     * Is called if a subscribed state changes
     * @param {string} id
     * @param {ioBroker.State | null | undefined} state
     */
    onStateChange(id, state) {
        if (state) {
            // The state was changed
            this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
        } else {
            // The state was deleted
            this.log.info(`state ${id} deleted`);
        }
    }

    // If you need to accept messages in your adapter, uncomment the following block and the corresponding line in the constructor.
    // /**
    //  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
    //  * Using this method requires "common.messagebox" property to be set to true in io-package.json
    //  * @param {ioBroker.Message} obj
    //  */
    // onMessage(obj) {
    //     if (typeof obj === "object" && obj.message) {
    //         if (obj.command === "send") {
    //             // e.g. send email or pushover or whatever
    //             this.log.info("send command");

    //             // Send response in callback if required
    //             if (obj.callback) this.sendTo(obj.from, obj.command, "Message received", obj.callback);
    //         }
    //     }
    // }

}

if (require.main !== module) {
    // Export the constructor in compact mode
    /**
     * @param {Partial<utils.AdapterOptions>} [options={}]
     */
    module.exports = (options) => new EpsonEscVp21(options);
} else {
    // otherwise start the instance directly
    new EpsonEscVp21();
}
