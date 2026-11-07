"use strict";

/*
 * Created with @iobroker/create-adapter v2.1.1
 */

const utils = require("@iobroker/adapter-core");
const Net = require("net");

const projector_name = "projector";

// ESC/VP.net handshake: request sent by us and the expected "OK" (status 0x20) reply
const HANDSHAKE_REQUEST = Buffer.from([0x45, 0x53, 0x43, 0x2f, 0x56, 0x50, 0x2e, 0x6e, 0x65, 0x74, 0x10, 0x03, 0x00, 0x00, 0x00, 0x00]);
const HANDSHAKE_PREFIX = "ESC/VP.net\x10\x03";
const HANDSHAKE_LENGTH = 16;
const HANDSHAKE_STATUS_OK = 0x20;

const HANDSHAKE_TIMEOUT_MS = 10000;     // connect + handshake
const COMMAND_TIMEOUT_MS = 10000;       // normal commands
const POWER_COMMAND_TIMEOUT_MS = 60000; // PWR ON/OFF may only be answered after warmup / cooldown
const MAX_CONSECUTIVE_TIMEOUTS = 3;     // after that, the connection is considered broken
const RECONNECT_MIN_DELAY_MS = 5000;
const RECONNECT_MAX_DELAY_MS = 300000;
const MAX_RX_BUFFER = 65536;
const DEFAULT_POLL_INTERVAL_S = 60;

const device_states = [
    {tag: "PWR",          id: "power_state",           name: "Active state",                       poll_off: true,  dev_type: null, common: { type: "string",  write: false, role: "state" }},
    {tag: "VKEYSTONE",    id: "vertical_keystone",     name: "Vertical Keystone",                  poll_off: false, dev_type: null, common: { type: "number",  write: true,  role: "level", min: 0, max: 255 }},
    {tag: "HKEYSTONE",    id: "horizontal_keystone",   name: "Horizontal Keystone",                poll_off: false, dev_type: null, common: { type: "number",  write: true,  role: "level", min: 0, max: 255 }},
    {tag: "AUTOKEYSTONE", id: "auto_keystone",         name: "Auto Keystone",                      poll_off: false, dev_type: null, common: { type: "boolean", write: true,  role: "switch", on: "ON", off: "OFF" }},
    {tag: "ASPECT",       id: "aspect",                name: "Aspect ratio",                       poll_off: false, dev_type: null, common: { type: "string",  write: false, role: "state" }},
    {tag: "LUMINANCE",    id: "luminance",             name: "Luminance",                          poll_off: false, dev_type: null, common: { type: "number",  write: false, role: "switch" }},
    {tag: "OVSCAN",       id: "ovscan",                name: "OVScan",                             poll_off: false, dev_type: null, common: { type: "number",  write: false, role: "state" }},
    {tag: "SOURCE",       id: "source",                name: "Source",                             poll_off: false, dev_type: null, common: { type: "string",  write: false, role: "state" }},
    {tag: "AUTOSEARCH",   id: "auto_source_search",    name: "Auto source search",                 poll_off: false, dev_type: null, common: { type: "boolean", write: true,  role: "switch", on: "01", off: "00" }},
    {tag: "BRIGHT",       id: "brightness",            name: "Brightness",                         poll_off: false, dev_type: null, common: { type: "number",  write: true,  role: "level", min: 0, max: 255 }},
    {tag: "CONTRAST",     id: "contrast",              name: "Contrast",                           poll_off: false, dev_type: null, common: { type: "number",  write: true,  role: "level", min: 0, max: 255 }},
    {tag: "DENSITY",      id: "density",               name: "Density",                            poll_off: false, dev_type: null, common: { type: "number",  write: true,  role: "level", min: 0, max: 255 }},
    {tag: "TINT",         id: "tint",                  name: "Tint",                               poll_off: false, dev_type: null, common: { type: "number",  write: true,  role: "level", min: 0, max: 255 }},
    {tag: "SHARP",        id: "sharpness",             name: "Sharpness",                          poll_off: false, dev_type: null, common: { type: "number",  write: true,  role: "level", min: 0, max: 255 }},
    {tag: "CTEMP",        id: "color_temperature",     name: "Color temperature",                  poll_off: false, dev_type: null, common: { type: "number",  write: true,  role: "level", min: 0, max: 255 }},
    {tag: "CMODE",        id: "color_mode",            name: "Color mode",                         poll_off: false, dev_type: null, common: { type: "string",  write: false, role: "state" }},
    {tag: "NRS",          id: "noise_reduction_adj",   name: "Noise reduction adj",                poll_off: false, dev_type: null, common: { type: "number",  write: true,  role: "level", min: 0, max: 255 }},
    {tag: "MPEGNRS",      id: "mpeg_noise_reduction",  name: "MPEG noise reduction",               poll_off: false, dev_type: null, common: { type: "number",  write: true,  role: "level", min: 0, max: 255 }},
    {tag: "OFFSETR",      id: "offset_value_red",      name: "Offset value red",                   poll_off: false, dev_type: null, common: { type: "number",  write: true,  role: "level", min: 0, max: 255 }},
    {tag: "OFFSETG",      id: "offset_value_green",    name: "Offset value green",                 poll_off: false, dev_type: null, common: { type: "number",  write: true,  role: "level", min: 0, max: 255 }},
    {tag: "OFFSETB",      id: "offset_value_blue",     name: "Offset value blue",                  poll_off: false, dev_type: null, common: { type: "number",  write: true,  role: "level", min: 0, max: 255 }},
    {tag: "GAINR",        id: "gain_value_red",        name: "Gain value red",                     poll_off: false, dev_type: null, common: { type: "number",  write: true,  role: "level", min: 0, max: 255 }},
    {tag: "GAING",        id: "gain_value_green",      name: "Gain value green",                   poll_off: false, dev_type: null, common: { type: "number",  write: true,  role: "level", min: 0, max: 255 }},
    {tag: "GAINB",        id: "gain_value_blue",       name: "Gain value blue",                    poll_off: false, dev_type: null, common: { type: "number",  write: true,  role: "level", min: 0, max: 255 }},
    {tag: "GAMMA",        id: "gamma",                 name: "Gamma",                              poll_off: false, dev_type: null, common: { type: "string",  write: false, role: "state" }},
    {tag: "DESTRENGTH",   id: "detail_enhancement",    name: "Detail enhancement",                 poll_off: false, dev_type: null, common: { type: "number",  write: true,  role: "level", min: 0, max: 255 }},
    {tag: "MCFI",         id: "frame_interpolation",   name: "Frame interpolation",                poll_off: false, dev_type: null, common: { type: "string",  write: false, role: "state" }},
    {tag: "HREVERSE",     id: "horizontal_reverse",    name: "Horizontal reverse",                 poll_off: false, dev_type: null, common: { type: "boolean", write: true,  role: "switch", on: "ON", off: "OFF" }},
    {tag: "VREVERSE",     id: "vertical_reverse",      name: "Vertical reverse",                   poll_off: false, dev_type: null, common: { type: "boolean", write: true,  role: "switch", on: "ON", off: "OFF" }},
    {tag: "ILLUM",        id: "illumination",          name: "Illumination",                       poll_off: false, dev_type: null, common: { type: "boolean", write: true,  role: "switch", on: "01", off: "00" }},
    {tag: "LAMP",         id: "lamp_hours",            name: "Lamp hours",                         poll_off: true,  dev_type: null, common: { type: "number" , write: false, role: "state" }},
    {tag: "SNO",          id: "serial_number",         name: "Serial number",                      poll_off: true,  dev_type: null, common: { type: "string",  write: false, role: "state" }},

    {tag: "HPOS",         id: "horizontal_position",   name: "Horizontal position",                poll_off: false, dev_type: ["EHTW5650"], common: { type: "number",  write: true,  role: "level", min: 0, max: 255 }},
    {tag: "VPOS",         id: "vertical_position",     name: "Vertical position",                  poll_off: false, dev_type: ["EHTW5650"], common: { type: "number",  write: true,  role: "level", min: 0, max: 255 }},
    {tag: "TRACKING",     id: "tracking",              name: "Tracking",                           poll_off: false, dev_type: ["EHTW5650"], common: { type: "number",  write: true,  role: "level", min: 0, max: 255 }},
    {tag: "SYNC",         id: "sync_value",            name: "Sync value",                         poll_off: false, dev_type: ["EHTW5650"], common: { type: "number",  write: true,  role: "level", min: 0, max: 255 }},
    {tag: "VOL",          id: "volume",                name: "Volume",                             poll_off: false, dev_type: ["EHTW5650"], common: { type: "number" , write: true , role: "level.volume", min: 0, max: 255 }},
    {tag: "WDNAME",       id: "wfd_display_name",      name: "WFD display name",                   poll_off: false, dev_type: ["EHTW5650"], common: { type: "string",  write: false, role: "state" }},

    {tag: "ZOOM",         id: "zoom",                  name: "Zoom",                               poll_off: false, dev_type: ["EHLS12000"], common: { type: "number",  write: true, role: "level", min: 0, max: 1023 }},
    {tag: "FOCUS",        id: "focus",                 name: "Focus",                              poll_off: false, dev_type: ["EHLS12000"], common: { type: "number",  write: true, role: "level", min: 0, max: 1023 }},
    {tag: "LENS",         id: "vertical_lens_shift",   name: "Vertical lens shift",                poll_off: false, dev_type: ["EHLS12000"], common: { type: "number",  write: true, role: "level", min: 0, max: 1023 }},
    {tag: "HLENS",        id: "horizontal_lens_shift", name: "Horizontal lens shift",              poll_off: false, dev_type: ["EHLS12000"], common: { type: "number",  write: true, role: "level", min: 0, max: 1023 }},
    {tag: "SHRF",         id: "hr_fine_line_adjust",   name: "High resolution: Fine line adjust",  poll_off: false, dev_type: ["EHLS12000"], common: { type: "number",  write: true, role: "level", min: 0, max: 255 }},
    {tag: "SHRS",         id: "ht_soft_focus_detail",  name: "High resolution: Soft focus detail", poll_off: false, dev_type: ["EHLS12000"], common: { type: "number",  write: true, role: "level", min: 0, max: 255 }},
    {tag: "CONTENHANCE",  id: "contrast_enhancement",  name: "Auto contrast enhancement",          poll_off: false, dev_type: ["EHLS12000"], common: { type: "number",  write: true, role: "level", min: 0, max: 255 }},
    {tag: "ONTIME",       id: "operation_time",        name: "Operation time",                     poll_off: true,  dev_type: ["EHLS12000"], common: { type: "number" , write: false, role: "state" }},
];

/**
 * Maps the power value of PWR / IMEVENT replies to a readable state.
 * @param {string} val
 * @returns {{power_state: string, power: boolean}}
 */
function decodePower(val) {
    switch (val) {
        case "00": return { power_state: "Standby, network off", power: false };
        case "01": return { power_state: "Lamp on", power: true };
        case "02": return { power_state: "Warmup", power: true };
        case "03": return { power_state: "Cooldown", power: true };
        case "04": return { power_state: "Standby, network on", power: false };
        case "05": return { power_state: "Abnormality standby", power: false };
        default: return { power_state: "unknown", power: false };
    }
}

/**
 * @param {string} cmd
 * @returns {boolean} true if the command is a query ("TAG?\r")
 */
function isQuery(cmd) {
    return cmd.endsWith("?\r");
}

/**
 * @param {string} cmd
 * @returns {string} the tag of a command, e.g. "BRIGHT" for "BRIGHT 120\r"
 */
function commandTag(cmd) {
    return cmd.replace(/[?\r].*$/s, "").split(" ")[0];
}

class EpsonEscVp21 extends utils.Adapter {

    /**
     * @param {Partial<utils.AdapterOptions>} [options={}]
     */
    constructor(options) {
        super({
            ...options,
            name: "epson-esc-vp21",
        });

        /** @type {Net.Socket | null} */
        this._client = null;
        /** @type {string[]} */
        this._pending_commands = [];
        /** @type {string | null} command sent to the projector, waiting for the ":" prompt */
        this._process_command = null;
        this._handshake_done = false;
        this._power = false;
        this._rx = "";
        this._unloading = false;
        this._consecutive_timeouts = 0;
        this._reconnect_delay = RECONNECT_MIN_DELAY_MS;

        /** @type {NodeJS.Timeout | null} */
        this._poll_timer = null;
        /** @type {NodeJS.Timeout | null} */
        this._command_timer = null;
        /** @type {NodeJS.Timeout | null} */
        this._reconnect_timer = null;

        this.on("ready", this.onReady.bind(this));
        this.on("stateChange", this.onStateChange.bind(this));
        this.on("unload", this.onUnload.bind(this));
    }

    get pollIntervalMs() {
        const s = Number(this.config.poll_interval);
        return (Number.isFinite(s) && s >= 1 ? s : DEFAULT_POLL_INTERVAL_S) * 1000;
    }

    hasDevType(dev_type) {
        return dev_type === null || dev_type.includes(this.config.device_type);
    }

    // ---------------------------------------------------------------- command queue

    /**
     * Adds a command to the queue.
     * Queries already in the queue are not added twice. A set command replaces a still pending
     * set command for the same tag and is placed before the queued queries, so user actions
     * are not delayed by a running poll.
     * @param {string} cmd
     */
    addCommand(cmd) {
        if (isQuery(cmd)) {
            if (!this._pending_commands.includes(cmd))
                this._pending_commands.push(cmd);
        } else {
            const tag = commandTag(cmd);
            this._pending_commands = this._pending_commands.filter((c) => isQuery(c) || commandTag(c) !== tag);
            const first_query = this._pending_commands.findIndex(isQuery);
            if (first_query < 0)
                this._pending_commands.push(cmd);
            else
                this._pending_commands.splice(first_query, 0, cmd);
        }

        this.log.debug(`Queued command ${JSON.stringify(cmd)}, queue length ${this._pending_commands.length}`);
        this.processNextCommand();
    }

    processNextCommand() {
        if (!this._client || !this._handshake_done || this._process_command !== null)
            return;

        const cmd = this._pending_commands.shift();
        if (cmd === undefined) {
            this.schedulePoll();
            return;
        }

        this.log.debug(`Sending ${JSON.stringify(cmd)}, still in queue: ${this._pending_commands.length}`);
        this._process_command = cmd;
        this.startCommandTimer(cmd.startsWith("PWR ") ? POWER_COMMAND_TIMEOUT_MS : COMMAND_TIMEOUT_MS);
        this._client.write(cmd, "latin1");
    }

    commandFinished() {
        this.clearCommandTimer();
        this._process_command = null;
        this._consecutive_timeouts = 0;
        this.processNextCommand();
    }

    startCommandTimer(ms) {
        this.clearCommandTimer();
        this._command_timer = setTimeout(this.onCommandTimeout.bind(this), ms);
    }

    clearCommandTimer() {
        if (this._command_timer !== null) {
            clearTimeout(this._command_timer);
            this._command_timer = null;
        }
    }

    onCommandTimeout() {
        this._command_timer = null;

        if (!this._handshake_done) {
            this.log.warn(`No handshake reply from projector within ${HANDSHAKE_TIMEOUT_MS / 1000} s`);
            this.dropConnection();
            return;
        }

        ++this._consecutive_timeouts;
        this.log.warn(`No reply for command ${JSON.stringify(this._process_command)} (timeout ${this._consecutive_timeouts}/${MAX_CONSECUTIVE_TIMEOUTS})`);

        if (this._consecutive_timeouts >= MAX_CONSECUTIVE_TIMEOUTS) {
            this.log.warn("Too many timeouts, reconnecting");
            this.dropConnection();
            return;
        }

        this._process_command = null;
        this.processNextCommand();
    }

    // ---------------------------------------------------------------- polling

    schedulePoll() {
        if (this._poll_timer === null && !this._unloading)
            this._poll_timer = setTimeout(this.onPollTimer.bind(this), this.pollIntervalMs);
    }

    onPollTimer() {
        this._poll_timer = null;
        this.pollDeviceStatus();
    }

    // Poll all device data points
    pollDeviceStatus() {
        for (const s of device_states) {
            if ((this._power || s.poll_off) && this.hasDevType(s.dev_type))
                this.addCommand(s.tag + "?\r");
        }
    }

    // ---------------------------------------------------------------- reply handling

    gotValue(name, val) {
        this.log.debug(`Processing reply: ${name} = ${val}`);

        if (name === "PWR" || name === "IMEVENT") {
            // IMEVENT: "0001 03 00000002 00000000 T1 F1", second field is the power state
            const p = decodePower(name === "PWR" ? val : val.split(" ")[1]);
            this.setState(projector_name + ".power_state", p.power_state, true);
            this.setState(projector_name + ".state", p.power, true);

            const was_off = !this._power;
            this._power = p.power;
            if (was_off && p.power)
                this.pollDeviceStatus(); // more data points are available now
            return;
        }

        let handled = false;
        for (const s of device_states) {
            if (name === s.tag && this.hasDevType(s.dev_type)) {
                let v;
                if (s.common.type === "number")
                    v = parseInt(val, 10);
                else if (s.common.type === "boolean")
                    v = val === "1" || val === "ON" || val === "01";
                else
                    v = val;

                this.setState(projector_name + "." + s.id, v, true);
                handled = true;
            }
        }

        if (!handled)
            this.log.info(`Unknown reply: ${name} = ${val}`);
    }

    gotState(name) {
        this.log.debug(`Processing reply state: ${name}`);

        if (name !== "ERR") {
            this.log.warn(`Error, unknown state: ${name}`);
            return;
        }

        const cmd = this._process_command;
        if (cmd === null) {
            this.log.warn("Error reply without pending command");
            return;
        }

        if (cmd.startsWith("LAMP?"))
            return; // ignored

        let handled = false;
        for (const s of device_states) {
            if (cmd.startsWith(s.tag + "?") && this.hasDevType(s.dev_type)) {
                const v = (s.common.type === "number" || s.common.type === "boolean") ? null : "n/a";
                this.setState(projector_name + "." + s.id, v, true);
                handled = true;
            }
        }

        if (!handled)
            this.log.warn(`Error reply for command: ${cmd.slice(0, -1)}`);
    }

    /**
     * Handles one line received from the projector (without the terminating "\r").
     * @param {string} line
     */
    gotLine(line) {
        line = line.replace(/^\n+|\n+$/g, "");
        if (line === "")
            return;

        if (this._process_command === null && !line.startsWith("IMEVENT"))
            this.log.warn(`Got unexpected spurious reply: ${JSON.stringify(line)}`);

        const eq = line.indexOf("=");
        if (eq >= 0)
            this.gotValue(line.slice(0, eq), line.slice(eq + 1));
        else
            this.gotState(line);
    }

    /**
     * Collects received data and processes complete replies. TCP may split or merge replies
     * arbitrarily, so nothing is processed before it is complete.
     * @param {Buffer} data
     */
    readFromDevice(data) {
        this._rx += data.toString("latin1");

        if (!this._handshake_done) {
            if (this._rx.length < HANDSHAKE_LENGTH)
                return;

            const reply = this._rx.slice(0, HANDSHAKE_LENGTH);
            this._rx = this._rx.slice(HANDSHAKE_LENGTH);

            if (!reply.startsWith(HANDSHAKE_PREFIX)) {
                this.log.error(`Unexpected handshake reply from projector: ${JSON.stringify(reply)}`);
                this.dropConnection();
                return;
            }

            const status = reply.charCodeAt(14);
            if (status !== HANDSHAKE_STATUS_OK) {
                this.log.error(`Projector refused connection, status 0x${status.toString(16)}`);
                this.dropConnection();
                return;
            }

            this.log.info("Connection to projector established");
            this._handshake_done = true;
            this._reconnect_delay = RECONNECT_MIN_DELAY_MS;
            this.clearCommandTimer();
            this._process_command = null;
            this.setState("info.connection", true, true);
            this.pollDeviceStatus();
        }

        // Replies are lines terminated by "\r"; the ":" prompt (without "\r") marks the end of a command.
        while (this._rx.length > 0) {
            if (this._rx[0] === ":") {
                this._rx = this._rx.slice(1);
                if (this._process_command !== null)
                    this.commandFinished();
                continue;
            }

            const end = this._rx.indexOf("\r");
            if (end < 0)
                break;

            const line = this._rx.slice(0, end);
            this._rx = this._rx.slice(end + 1);
            this.gotLine(line);
        }

        if (this._rx.length > MAX_RX_BUFFER) {
            this.log.warn("Receive buffer overflow, discarding data");
            this._rx = "";
        }
    }

    // ---------------------------------------------------------------- connection handling

    connectToDevice() {
        this._reconnect_timer = null;
        if (this._unloading)
            return;

        const port = this.config.port_number;
        const host = this.config.net_address;
        this.log.info(`Connecting to ${host}:${port}`);

        this._rx = "";
        this._handshake_done = false;
        this._process_command = null;
        this._consecutive_timeouts = 0;

        const client = new Net.Socket();
        this._client = client;

        client.on("connect", () => {
            this.log.debug("TCP connection established, sending handshake");
            client.write(HANDSHAKE_REQUEST);
        });
        client.on("data", this.readFromDevice.bind(this));
        client.on("error", (err) => this.log.warn(`Connection error: ${err.message}`));
        client.on("close", () => this.onConnectionClosed(client));

        // Covers both the TCP connect and the handshake reply
        this.startCommandTimer(HANDSHAKE_TIMEOUT_MS);
        client.connect({ port: port, host: host });
    }

    // Closes the current connection; reconnecting is triggered by the "close" event.
    dropConnection() {
        if (this._client)
            this._client.destroy();
    }

    /**
     * @param {Net.Socket} client the socket that was closed
     */
    onConnectionClosed(client) {
        if (client !== this._client)
            return; // an old socket

        this._client = null;
        this._handshake_done = false;
        this._process_command = null;
        this._pending_commands = [];
        this._rx = "";
        this.clearCommandTimer();
        if (this._poll_timer !== null) {
            clearTimeout(this._poll_timer);
            this._poll_timer = null;
        }

        if (this._unloading)
            return;

        this.setState("info.connection", false, true);
        this.log.info(`Connection to projector closed, reconnecting in ${this._reconnect_delay / 1000} s`);

        this._reconnect_timer = setTimeout(this.connectToDevice.bind(this), this._reconnect_delay);
        this._reconnect_delay = Math.min(this._reconnect_delay * 2, RECONNECT_MAX_DELAY_MS);
    }

    // ---------------------------------------------------------------- adapter lifecycle

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        // Reset the connection indicator during startup
        await this.setStateAsync("info.connection", false, true);

        this.log.info("config device_type: " + this.config.device_type);
        this.log.debug(`config net_address: ${this.config.net_address}, port_number: ${this.config.port_number}, poll_interval: ${this.config.poll_interval}`);

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

        for (const s of device_states) {
            if (this.hasDevType(s.dev_type)) {
                // @ts-ignore
                await this.setObjectNotExistsAsync(projector_name + "." + s.id, {
                    type: "state",
                    common: {
                        name: s.name,
                        type: s.common.type,
                        role: s.common.role,
                        read: true,
                        write: s.common.write
                    },
                    native: {},
                });
            }
        }

        this.subscribeStates(projector_name + ".state");
        for (const s of device_states) {
            if (s.common.write && this.hasDevType(s.dev_type))
                this.subscribeStates(projector_name + "." + s.id);
        }

        this.connectToDevice();
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     * @param {() => void} callback
     */
    onUnload(callback) {
        try {
            this._unloading = true;

            for (const t of [this._poll_timer, this._command_timer, this._reconnect_timer]) {
                if (t !== null)
                    clearTimeout(t);
            }
            this._poll_timer = this._command_timer = this._reconnect_timer = null;

            if (this._client) {
                this._client.destroy();
                this._client = null;
            }

            this.setState("info.connection", false, true);
            callback();
        } catch (e) {
            callback();
        }
    }

    /**
     * Is called if a subscribed state changes
     * @param {string} id
     * @param {ioBroker.State | null | undefined} state
     */
    onStateChange(id, state) {
        id = id.substring(this.namespace.length + 1);

        if (!state) {
            this.log.warn(`state ${id} deleted`);
            return;
        }

        if (state.ack)
            return;

        this.log.debug(`State changed: ${id} = ${JSON.stringify(state.val)}`);

        if (!this._handshake_done)
            this.log.warn(`Not connected to projector, command for ${id} will be sent after the connection is established`);

        if (id === projector_name + ".state") {
            this.addCommand(state.val ? "PWR ON\r" : "PWR OFF\r");
            this.addCommand("PWR?\r");
            return;
        }

        for (const s of device_states) {
            if (id !== projector_name + "." + s.id || !this.hasDevType(s.dev_type))
                continue;

            if (s.common.type === "boolean")
                this.addCommand(s.tag + " " + (state.val ? s.common.on : s.common.off) + "\r");
            else
                this.addCommand(s.tag + " " + String(state.val) + "\r");

            // read back the value the projector actually accepted
            this.addCommand(s.tag + "?\r");
            return;
        }

        this.log.warn(`Unhandled object: ${id} = ${JSON.stringify(state.val)}`);
    }
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
