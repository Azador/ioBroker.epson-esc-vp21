"use strict";

/*
 * Created with @iobroker/create-adapter v2.1.1
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require("@iobroker/adapter-core");
const assert = require("assert");
const Net = require("net");
// Load your modules here, e.g.:
// const fs = require("fs");

const projector_name = "projector";
const log_debug = false;

const device_states = [
    {tag: "PWR",          id: "power_state",         name: "Active state",        poll_off: true,  dev_type: null, common: { type: "string",  write: false, role: "state" }},
    {tag: "VKEYSTONE",    id: "vertical_keystone",   name: "Vertical Keystone",   poll_off: false, dev_type: null, common: { type: "number",  write: true,  role: "level", min: 0, max: 255 }},
    {tag: "HKEYSTONE",    id: "horizontal_keystone", name: "Horizontal Keystone", poll_off: false, dev_type: null, common: { type: "number",  write: true,  role: "level", min: 0, max: 255 }},
    {tag: "AUTOKEYSTONE", id: "auto_keystone",       name: "Auto Keystone",       poll_off: false, dev_type: null, common: { type: "boolean", write: true,  role: "switch", on: "ON", off: "OFF" }},
    {tag: "ASPECT",       id: "aspect",              name: "Aspect ratio",        poll_off: false, dev_type: null, common: { type: "string",  write: false, role: "state" }},
    {tag: "LUMINANCE",    id: "luminance",           name: "Luminance",           poll_off: false, dev_type: null, common: { type: "number",  write: false, role: "switch" }},
    {tag: "OVSCAN",       id: "ovscan",              name: "OVScan",              poll_off: false, dev_type: null, common: { type: "number",  write: false, role: "state" }},
    {tag: "SOURCE",       id: "source",              name: "Source",              poll_off: false, dev_type: null, common: { type: "string",  write: false, role: "state" }},
    {tag: "AUTOSEARCH",   id: "auto_source_search",  name: "Auto source search",  poll_off: false, dev_type: null, common: { type: "boolean", write: true,  role: "switch", on: "01", off: "00" }},
    {tag: "BRIGHT",       id: "brightness",          name: "Brightness",          poll_off: false, dev_type: null, common: { type: "number",  write: true,  role: "level", min: 0, max: 255 }},
    {tag: "CONTRAST",     id: "contrast",            name: "Contrast",            poll_off: false, dev_type: null, common: { type: "number",  write: true,  role: "level", min: 0, max: 255 }},
    {tag: "DENSITY",      id: "density",             name: "Density",             poll_off: false, dev_type: null, common: { type: "number",  write: true,  role: "level", min: 0, max: 255 }},
    {tag: "TINT",         id: "tint",                name: "Tint",                poll_off: false, dev_type: null, common: { type: "number",  write: true,  role: "level", min: 0, max: 255 }},
    {tag: "SHARP",        id: "sharpness",           name: "Sharpness",           poll_off: false, dev_type: null, common: { type: "number",  write: true,  role: "level", min: 0, max: 255 }},
    {tag: "CTEMP",        id: "color_temperature",   name: "Color temperature",   poll_off: false, dev_type: null, common: { type: "number",  write: true,  role: "level", min: 0, max: 255 }},
    {tag: "CMODE",        id: "color_mode",          name: "Color mode",          poll_off: false, dev_type: null, common: { type: "string",  write: false, role: "state" }},
    {tag: "HPOS",         id: "horizontal_position", name: "Horizontal position", poll_off: false, dev_type: null, common: { type: "number",  write: true,  role: "level", min: 0, max: 255 }},
    {tag: "VPOS",         id: "vertical_position",   name: "Vertical position",   poll_off: false, dev_type: null, common: { type: "number",  write: true,  role: "level", min: 0, max: 255 }},
    {tag: "TRACKiNG",     id: "tracking",            name: "Tracking",            poll_off: false, dev_type: null, common: { type: "number",  write: true,  role: "level", min: 0, max: 255 }},
    {tag: "SYNC",         id: "sync_value",          name: "Sync value",          poll_off: false, dev_type: null, common: { type: "number",  write: true,  role: "level", min: 0, max: 255 }},
    {tag: "NRS",          id: "noise_reduction_adj", name: "Noise reduction adj", poll_off: false, dev_type: null, common: { type: "number",  write: true,  role: "level", min: 0, max: 255 }},
    {tag: "MPEGNRS",      id: "mpeg_noise_reduction",name: "MPEG noise reduction",poll_off: false, dev_type: null, common: { type: "number",  write: true,  role: "level", min: 0, max: 255 }},
    {tag: "OFFSETR",      id: "offset_value_red",    name: "Offset value red",    poll_off: false, dev_type: null, common: { type: "number",  write: true,  role: "level", min: 0, max: 255 }},
    {tag: "OFFSETG",      id: "offset_value_green",  name: "Offset value green",  poll_off: false, dev_type: null, common: { type: "number",  write: true,  role: "level", min: 0, max: 255 }},
    {tag: "OFFSETB",      id: "offset_value_blue",   name: "Offset value blue",   poll_off: false, dev_type: null, common: { type: "number",  write: true,  role: "level", min: 0, max: 255 }},
    {tag: "GAINR",        id: "gain_value_red",      name: "Gain value red",      poll_off: false, dev_type: null, common: { type: "number",  write: true,  role: "level", min: 0, max: 255 }},
    {tag: "GAING",        id: "gain_value_green",    name: "Gain value green",    poll_off: false, dev_type: null, common: { type: "number",  write: true,  role: "level", min: 0, max: 255 }},
    {tag: "GAINB",        id: "gain_value_blue",     name: "Gain value blue",     poll_off: false, dev_type: null, common: { type: "number",  write: true,  role: "level", min: 0, max: 255 }},
    {tag: "GAMMA",        id: "gamma",               name: "Gamma",               poll_off: false, dev_type: null, common: { type: "string",  write: false, role: "state" }},
    {tag: "DESTRENGTH",   id: "detail_enhancement",  name: "Detail enhancement",  poll_off: false, dev_type: null, common: { type: "number",  write: true,  role: "level", min: 0, max: 255 }},
    {tag: "MCFI",         id: "frame_interpolation", name: "Frame interpolation", poll_off: false, dev_type: null, common: { type: "string",  write: false, role: "state" }},
    {tag: "VOL",          id: "volume",              name: "Volume",              poll_off: false, dev_type: null, common: { type: "number" , write: true , role: "level.volume", min: 0, max: 255 }},
    {tag: "HREVERSE",     id: "horizontal_reverse",  name: "Horizontal reverse",  poll_off: false, dev_type: null, common: { type: "boolean", write: true,  role: "switch", on: "ON", off: "OFF" }},
    {tag: "VREVERSE",     id: "vertical_reverse",    name: "Vertical reverse",    poll_off: false, dev_type: null, common: { type: "boolean", write: true,  role: "switch", on: "ON", off: "OFF" }},
    {tag: "ILLUM",        id: "illumination",        name: "Illumination",        poll_off: false, dev_type: null, common: { type: "boolean", write: true,  role: "switch", on: "01", off: "00" }},
    {tag: "WDNAME",       id: "wfd_display_name",    name: "WFD display name",    poll_off: false, dev_type: null, common: { type: "string",  write: false, role: "state" }},
    {tag: "LAMP",         id: "lamp_hours",          name: "Lamp hours",          poll_off: true,  dev_type: null, common: { type: "number" , write: false, role: "state" }},
    {tag: "SNO",          id: "serial_number",       name: "Serial number",       poll_off: true,  dev_type: null, common: { type: "string",  write: false, role: "state" }},
];



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
        this._power = false;

        this.on("ready", this.onReady.bind(this));
        this.on("stateChange", this.onStateChange.bind(this));
        // this.on("objectChange", this.onObjectChange.bind(this));
        // this.on("message", this.onMessage.bind(this));
        this.on("unload", this.onUnload.bind(this));

        this._timer = null;
        this._interval = null;
        return;
    }

    hasDevType (dev_type) {
        if (dev_type === null)
            return true;

        for (let i=0; i < dev_type.length; ++i) {
            if (this.config.device_type === dev_type[i])
                return true;
        }

        return false;
    }

    addCommand (cmd) {
        this._pending_commands.push (cmd);
        if (log_debug)
            this.log.info ("Adding command at index " + String (this._pending_commands.length - 1));
        this.processNextCommand ();
    }

    processNextCommand () {
        if (!(this._client instanceof Net.Socket)) {
            if (log_debug)
                this.log.info ("Processing commands: Socket not initialized");
            return;
        }

        if (this._process_command  !== null) {
            if (log_debug) {
                this.log.info ("Processing commands: waiting for current command: " + String (this._process_command));
            }
            return;
        }

        if (this._pending_commands.length === 0) {
            if (log_debug) {
                this.log.info ("Processing commands: no commands in queue");
            }

            if (this._timer === null)
                this._timer = setTimeout (this.pollDeviceStatusTimer.bind (this), this.config.poll_interval * 1000);
            return;
        }

        const cmd = this._pending_commands.shift ();
        if (log_debug)
            this.log.info ("Processing commands, still in queue: " + String (this._pending_commands.length) + ", next command: " +  cmd);

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

    // Poll all device data points
    pollDeviceStatus () {
        for (const i in device_states) {
            if ((this._power || device_states[i].poll_off) && this.hasDevType (device_states[i].dev_type))
                this.addCommand (device_states[i].tag + "?\r");
        }
    }

    pollDeviceStatusTimer () {
        this.pollDeviceStatus ();
        this._timer = null;
    }

    // Fallback if we miss to set up the timer somewhere
    pollDeviceStatusInterval () {
        if (this._timer === null && this._pending_commands.length === 0)
            this.pollDeviceStatus ();
    }

    gotValue (name, val) {
        if (log_debug)
            this.log.info ("Processing reply: " + String (name) + " " +  String (val));

        let handled = true;

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
                this.setState (projector_name + ".power_state", power_state, true);
                this.setState (projector_name + ".state", power, true);
                this._power = power;
                break;
            }

            case "IMEVENT": {
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
                const a = val.split (" ");
                let power_state = "unknown";
                let power = false;
                switch (a[1]) {
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
                this.setState (projector_name + ".power_state", power_state, true);
                this.setState (projector_name + ".state", power, true);
                this._power = power;
                break;
            }

            default:
                handled = false;
        }

        if (!handled) {
            for (const i in device_states) {
                if (name == device_states[i].tag && this.hasDevType (device_states[i].dev_type)) {
                    if (device_states[i].common.type == "number") {
                        this.setState (projector_name + "." + device_states[i].id, parseInt (val), true);
                    } else if (device_states[i].common.type == "boolean") {
                        let v = false;
                        if (val == "1" || val == "ON" || val == "01")
                            v = true;

                        this.setState (projector_name + "." + device_states[i].id, v, true);
                    } else {
                        this.setState (projector_name + "." + device_states[i].id, val, true);
                    }

                    handled = true;
                }
            }

            if (!handled)
                this.log.info ("Unknown reply: " + name + " = " + val);
        }
    }

    gotState (name) {
        if (log_debug)
            this.log.info ("Processing reply state: " + String (name));

        if (name == "ERR") {
            if (typeof this._process_command == "string" || this._process_command instanceof String) {
                let handled = false;

                if (this._process_command.startsWith ("LAMP?")) {
                    // ignore this? this.setState ("lamp_hours", null, true);
                    handled = true;
                } else {
                    for (const i in device_states) {
                        if (this._process_command.startsWith (device_states[i].tag + "?") && this.hasDevType (device_states[i].dev_type)) {
                            if (device_states[i].common.type == "number" || device_states[i].common.type == "boolean") {
                                this.setState (projector_name + "." + device_states[i].id, null, true);
                            } else {
                                this.setState (projector_name + "." + device_states[i].id, "n/a", true);
                            }

                            handled = true;
                        }
                    }
                }

                if (!handled) {
                    this.log.warn ("Error reply for unknown cmd: " + this._process_command.slice (0, -1));
                }
            } else {
                this.log.warn ("Error reply for not set cmd: " + JSON.stringify (this._process_command));
            }
        } else {
            this.log.warn ("Error, unknown state: " + name);
        }
    }

    readFromDevice (data) {
        if (this._process_command == null) {
            let spurious_reply = true;

            if (data instanceof Buffer) {
                // @ts-ignore
                const s = String.fromCharCode.apply (null, data);
                if (s.startsWith ("IMEVENT"))
                    spurious_reply = false;
            }

            if (spurious_reply)
                this.log.warn ("Got unexpected spurious reply: " + JSON.stringify (data));
        }

        if (data instanceof Buffer) {
            if (data.compare (Buffer.from ([69,83,67,47,86,80,46,110,101,116,16,3,0,0,32,0])) == 0) {
                if (this._connected)
                    this.log.warn ("Got connection start string from projector while already connected");

                if (this._process_command != "startup")
                    this.log.warn ("Got connection start string from projector while not waiting for it");

                this._connected = true;
                this._process_command = null;
                this.setState ("info.connection", true, true);

                this.pollDeviceStatus ();

                this._interval = setInterval (this.pollDeviceStatusInterval.bind (this), this.config.poll_interval * 1000); // Sync Interval
            } else {
                // @ts-ignore
                const s = String.fromCharCode.apply (null, data);
                //this.log.info ("Got reply: '" + s + "'");

                const a = s.split ("\r");
                let found_end = false;
                for (let i=0; i < a.length; ++i) {
                    if (a[i] == ":") {
                        //if (log_debug)
                        //    this.log.info ("':' received, ready for new commands");

                        found_end = true;
                        this._process_command = null;
                        this.processNextCommand ();
                    } else {
                        while (a.length > 1 && a[0] == ":")
                            a.shift ();

                        const v = a[i].split ("=");
                        if (v.length == 2) {
                            this.gotValue (v[0], v[1]);
                        } else if (v.length == 1) {
                            this.gotState (v[0]);
                        } else
                            this.log.warn ("Got unexpected reply: " + JSON.stringify (v));
                    }
                }

                if (!found_end) {
                    if (log_debug) {
                        this.log.warn ("No ':' received but no further reply data exist. Start processing of next command");
                    }

                    this.processNextCommand ();
                }
            }
        } else
            this.log.warn ("Got reply that is no instance of Buffer?");
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
        this.log.info("config device_type: " + this.config.device_type);
        if (log_debug) {
            this.log.info("config net_address: " + this.config.net_address);
            this.log.info("config port_number: " + this.config.port_number);
            this.log.info("config poll_interval: " + this.config.poll_interval);
        }

        /*
        For every state in the system there has to be also an object of type state
        Here a simple template for a boolean variable named "testVariable"
        Because every adapter instance uses its own unique namespace variable names can't collide with other adapters variables
        */

        await this.setObjectNotExistsAsync(projector_name, {
            type: "device",
            common: {
                name: projector_name,
            },
            native: {},
        });

        await this.setObjectNotExistsAsync(projector_name + ".state", {
            type: "state",
            common: {
                name: "Switch state",
                type: "boolean",
                role: "switch.power",
                read: true,
                write: true,
            },
            native: {},
        });

        for (const i in device_states) {
            if (this.hasDevType (device_states[i].dev_type)) {
                const id = projector_name + "." + device_states[i].id;
                const common = {
                    name: device_states[i].name,
                    type: device_states[i].common.type,
                    role: device_states[i].common.role,
                    read: true,
                    write: device_states[i].common.write
                };

                // @ts-ignore
                await this.setObjectNotExistsAsync(id, {
                    type: "state",
                    common: common,
                    native: {},
                });
            }
        }

        // In order to get state updates, you need to subscribe to them. The following line adds a subscription for our variable we have created above.
        this.subscribeStates (projector_name + ".state");
        for (const i in device_states) {
            if (device_states[i].common.write && this.hasDevType (device_states[i].dev_type)) {
                const name = projector_name + "." + device_states[i].id;
                this.subscribeStates (name);
            }
        }

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
                clearTimeout (this._timer);
            if (this._interval != null)
                clearInterval (this._interval);

            if (this._client instanceof Net.Socket)
                this._client.end ();

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
        id = id.slice (17);
        if (state) {
            // The state was changed
            if (!state.ack) {
                if (log_debug)
                    this.log.info ("State changed: " + id + " = " + JSON.stringify (state.val));

                if (id == "projector.power") {
                    if (state.val) {
                        // Power on projector
                        this.addCommand ("PWR ON\r");
                    } else {
                        // Power off projector
                        this.addCommand ("PWR OFF\r");
                    }
                } else {
                    let handled = false;
                    for (const i in device_states) {
                        const name = projector_name + "." + device_states[i].id;
                        if (id === name && this.hasDevType (device_states[i].dev_type)) {
                            if (device_states[i].common.type == "number" || device_states[i].common.type == "string") {
                                this.addCommand (device_states[i].tag + " " + String (state.val) + "\r");
                                handled = true;
                            } else if (device_states[i].common.type == "boolean") {
                                let v = device_states[i].common.off;
                                if (state.val)
                                    v = device_states[i].common.on;

                                this.addCommand (device_states[i].tag + " " + v + "\r");
                                handled = true;
                            } else {
                                // Depending on tag, different values for true and false has to be send...
                                // Missing right now, important states has to be handled separately right now
                            }
                        }
                    }

                    if (!handled)
                        this.log.warn ("Unhandled object: " + id + " = " + JSON.stringify (state.val));
                }

                this.pollDeviceStatus ();
            }
        } else {
            // The state was deleted
            this.log.warn (`state ${id} deleted`);
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
