"use strict";

/*
 * Created with @iobroker/create-adapter v2.0.1
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require("@iobroker/adapter-core");
const assert = require("assert");
const Net = require("net");
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
        this._client = null;
        this._pending_commands = [];
        this._process_command = null;
        this._connected = false;

        this.on("ready", this.onReady.bind(this));
        this.on("stateChange", this.onStateChange.bind(this));
        // this.on("objectChange", this.onObjectChange.bind(this));
        // this.on("message", this.onMessage.bind(this));
        this.on("unload", this.onUnload.bind(this));

        this._timer = null;
        return;
    }

    addCommand (cmd) {
        this._pending_commands.push (cmd);
        this.processNextCommand ();
    }

    processNextCommand () {
        if (!(this._client instanceof Net.Socket))
            return;

        if (this._process_command  != null || this._pending_commands.length == 0)
            return;

        const cmd = this._pending_commands.shift ();
        //this.log.info ("Set next command: " + cmd);
        this._process_command = cmd;
        this._client.write (cmd);
    }

    connectionEstablished () {
        // If there is no error, the server has accepted the request and created a new
        // socket dedicated to us.
        this.log.info ("TCP connection established with the server.");

        assert (this._client instanceof Net.Socket);

        // The client can now send data to the server by writing to its socket.
        this._process_command = "startup";
        this._client.write (Buffer.from ([0x45, 0x53, 0x43, 0x2f, 0x56, 0x50, 0x2e, 0x6e, 0x65, 0x74, 0x10, 3, 0, 0, 0, 0]));
        //this.client.write('ESC/VP.net' + String.fromCharCode.apply (null, [16, 3, 0, 0, 0, 0]));
    }

    pollDeviceStatus () {
        this.addCommand ("PWR?\r");
        this.addCommand ("SOURCE?\r");
        this.addCommand ("VOL?\r");
        this.addCommand ("LAMP?\r");
    }

    gotValue (name, val) {
        switch (name) {
            case "PWR": {
                let power_state = "unknown";
                let power = false;
                switch (val) {
                    case "00":
                        power_state = "Standby, network off"; // How could I get this :)
                        break;
                    case "01":
                        power_state = "Lamp on";
                        power = true;
                        break;
                    case "02":
                        power_state = "Warmup";
                        power = true;
                        break;
                    case "03":
                        power_state = "Cooldown";
                        power = true;
                        break;
                    case "04":
                        power_state = "Standby, network on";
                        break;
                    case "05":
                        power_state = "Abnormality standby";
                        break;
                }
                this.setState ("power_state", power_state, true);
                this.setState ("power", power, true);
                break;
            }

            case "LAMP":
                this.setState ("lamp_hours", parseInt (val), true);
                break;

            case "SOURCE":
                this.setState ("source", val, true);
                break;

            case "VOL":
                this.setState ("volume", parseInt (val), true);
                break;

            case "IMEVENT":
                // IMEVENT: 0001 02 00000000 00000000 T1 F1
                // IMEVENT = 0001 02 00000002 00000000 T1 F1
                // IMEVENT: 0001 03 00000002 00000000 T1 F1
                // IMEVENT: 0001 04 00000002 00000000 T1 F1
                // IMEVENT: 0001 01 00000000 00000000 T1 F1
                //           |    |      |        |    |  +----- ?
                //           |    |      |        |    +-------- ?
                //           |    |      |        +------------- ?
                //           |    |      +---------------------- ?
                //           |    +----------------------------- Lamp state?
                //           +---------------------------------- Always 1?
                this.log.info ("IMEVENT: " + val);
                break;

            default:
                this.log.info ("Unknown value: " + name + " = " + val);
        }
    }

    gotState (name) {
        if (name == "ERR") {
            if (typeof this._process_command == "string" || this._process_command instanceof String) {
                if (this._process_command.startsWith ("SOURCE?")) {
                    this.setState ("source", "n/a", true);
                } else if (this._process_command.startsWith ("VOL?")) {
                    this.setState ("volume", null, true);
                } else if (this._process_command.startsWith ("LAMP?")) {
                    // ignore this? this.setState ("volume", null, true);
                } else {
                    this.log.info ("Error for unknown cmd: " + this._process_command.slice (0, -1));
                }
            } else {
                this.log.info ("Error for not set cmd: " + JSON.stringify (this._process_command));
            }
        } else {
            this.log.info ("Unknown state 2: " + name);
        }
    }

    readFromDevice (data) {
        if (this._process_command == null)
            this.log.info ("Got spurious reply: " + JSON.stringify (data));

        if (data instanceof Buffer) {
            if (data.compare (Buffer.from ([69,83,67,47,86,80,46,110,101,116,16,3,0,0,32,0])) == 0) {
                if (this._connected)
                    this.log.info ("Got connection start string from projector while already connected");

                if (this._process_command != "startup")
                    this.log.info ("Got connection start string from projector while not waiting for it");

                this._connected = true;
                this._process_command = null;
                this.setState ("info.connection", true, true);

                this.pollDeviceStatus ();

                this._timer = setInterval (this.pollDeviceStatus.bind (this), parseInt (this.config.poll_intervall) * 1000); // Sync Interval
            } else {
                const s = String.fromCharCode.apply (null, data);
                //this.log.info ("Got reply: '" + s + "'");

                const a = s.split ("\r");
                for (let i=0; i < a.length; ++i) {
                    if (a[i] == ":") {
                        //this.log.info ("Ready for new commands");
                        this._process_command = null;
                        this.processNextCommand ();
                    } else {
                        if (a[0] == ":")
                            a.shift ();

                        const v = a[i].split ("=");
                        if (v.length == 2) {
                            this.gotValue (v[0], v[1]);
                        } else if (v.length == 1) {
                            this.gotState (v[0]);
                        } else
                            this.log.info ("Reply " + JSON.stringify (v) + " not parsed");
                    }
                }

            }
        } else
            this.log.info ("not Buffer?");
    }

    clientOn (type, add1, add2, add3, add4) {
        this.log.info ("Got client on " + JSON.stringify (type) + ": " + JSON.stringify (add1)
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
        this._client.on("connect", this.connectionEstablished.bind(this));
        this._client.on("data", this.readFromDevice.bind(this));
        this._client.on("end", this.clientOn.bind(this, "end"));
        this._client.on("error", this.clientOn.bind(this, "error"));
        this._client.on("close", this.clientOn.bind(this, "close"));

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

        await this.setObjectNotExistsAsync("power_state", {
            type: "state",
            common: {
                name: "power_state",
                type: "string",
                role: "mode",
                read: true,
                write: false,
            },
            native: {},
        });

        await this.setObjectNotExistsAsync("lamp_hours", {
            type: "state",
            common: {
                name: "lamp_hours",
                type: "number",
                role: "value",
                read: true,
                write: false,
            },
            native: {},
        });

        await this.setObjectNotExistsAsync("source", {
            type: "state",
            common: {
                name: "source",
                type: "string",
                role: "mode",
                read: true,
                write: false,
            },
            native: {},
        });

        await this.setObjectNotExistsAsync("volume", {
            type: "state",
            common: {
                name: "volume",
                type: "number",
                role: "value",
                read: true,
                write: false,
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
            if (this._timer != null)
                clearInterval (this._timer);

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
            if (!state.ack) {
                if (state.val) {
                    // Power on projector
                    this.addCommand ("PWR ON\r");
                } else {
                    // Power off projector
                    this.addCommand ("PWR OFF\r");
                }

                this.pollDeviceStatus ();
            }
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
