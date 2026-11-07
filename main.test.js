"use strict";

/**
 * Unit tests for the ESC/VP21 protocol helpers and for the adapter running against a
 * simulated projector (real TCP socket on localhost, stubbed ioBroker adapter core).
 */

const { expect } = require("chai");
const EventEmitter = require("events");
const net = require("net");
const proxyquire = require("proxyquire");

const { decodePower, isQuery, commandTag, enqueueCommand, extractReplies } = require("./lib/protocol");

const HANDSHAKE_OK = Buffer.from([0x45, 0x53, 0x43, 0x2f, 0x56, 0x50, 0x2e, 0x6e, 0x65, 0x74, 0x10, 0x03, 0x00, 0x00, 0x20, 0x00]);

describe("protocol helpers", () => {
    describe("decodePower", () => {
        it("decodes known power states", () => {
            expect(decodePower("01")).to.deep.equal({ power_state: "Lamp on", power: true });
            expect(decodePower("02").power).to.equal(true);
            expect(decodePower("03").power).to.equal(true);
            expect(decodePower("04")).to.deep.equal({ power_state: "Standby, network on", power: false });
        });

        it("returns unknown for unexpected values", () => {
            expect(decodePower("99")).to.deep.equal({ power_state: "unknown", power: false });
            expect(decodePower(/** @type {any} */ (undefined))).to.deep.equal({ power_state: "unknown", power: false });
        });
    });

    describe("isQuery / commandTag", () => {
        it("distinguishes queries from set commands", () => {
            expect(isQuery("PWR?\r")).to.equal(true);
            expect(isQuery("PWR ON\r")).to.equal(false);
        });

        it("extracts the tag", () => {
            expect(commandTag("BRIGHT?\r")).to.equal("BRIGHT");
            expect(commandTag("BRIGHT 120\r")).to.equal("BRIGHT");
            expect(commandTag("PWR ON\r")).to.equal("PWR");
        });
    });

    describe("enqueueCommand", () => {
        it("does not add a query twice", () => {
            expect(enqueueCommand(["PWR?\r", "LAMP?\r"], "PWR?\r")).to.deep.equal(["PWR?\r", "LAMP?\r"]);
        });

        it("appends new queries", () => {
            expect(enqueueCommand(["PWR?\r"], "LAMP?\r")).to.deep.equal(["PWR?\r", "LAMP?\r"]);
        });

        it("puts set commands before pending queries", () => {
            expect(enqueueCommand(["PWR?\r", "LAMP?\r"], "BRIGHT 10\r")).to.deep.equal(["BRIGHT 10\r", "PWR?\r", "LAMP?\r"]);
        });

        it("keeps the order of set commands for different tags", () => {
            expect(enqueueCommand(["BRIGHT 10\r", "PWR?\r"], "CONTRAST 5\r")).to.deep.equal(["BRIGHT 10\r", "CONTRAST 5\r", "PWR?\r"]);
        });

        it("replaces a pending set command for the same tag", () => {
            expect(enqueueCommand(["BRIGHT 10\r", "CONTRAST 5\r", "BRIGHT?\r"], "BRIGHT 20\r"))
                .to.deep.equal(["CONTRAST 5\r", "BRIGHT 20\r", "BRIGHT?\r"]);
        });

        it("does not modify the given queue", () => {
            const q = ["PWR?\r"];
            enqueueCommand(q, "BRIGHT 1\r");
            expect(q).to.deep.equal(["PWR?\r"]);
        });
    });

    describe("extractReplies", () => {
        it("parses a value and the prompt", () => {
            expect(extractReplies("PWR=01\r:")).to.deep.equal({ items: [{ line: "PWR=01" }, { prompt: true }], rest: "" });
        });

        it("keeps incomplete data", () => {
            expect(extractReplies("PWR=0")).to.deep.equal({ items: [], rest: "PWR=0" });
            expect(extractReplies("PWR=01\r:LAMP=1")).to.deep.equal({ items: [{ line: "PWR=01" }, { prompt: true }], rest: "LAMP=1" });
        });

        it("handles merged replies, errors and empty lines", () => {
            expect(extractReplies("ERR\r:\r\nIMEVENT=0001 01 0 0 T1 F1\r")).to.deep.equal({
                items: [{ line: "ERR" }, { prompt: true }, { line: "IMEVENT=0001 01 0 0 T1 F1" }],
                rest: "",
            });
        });
    });
});

// -------------------------------------------------------------------------------- adapter

/**
 * Minimal stand-in for utils.Adapter from @iobroker/adapter-core
 */
class FakeAdapter extends EventEmitter {
    constructor(options) {
        super();
        this.name = options.name;
        this.namespace = options.name + ".12"; // two-digit instance on purpose
        this.config = { net_address: "127.0.0.1", port_number: 0, poll_interval: 60, device_type: "generic" };
        /** @type {Record<string, any>} */
        this.states = {};
        /** @type {string[]} */
        this.logs = [];
        const log = (level) => (msg) => this.logs.push(`${level}: ${msg}`);
        this.log = { silly: log("silly"), debug: log("debug"), info: log("info"), warn: log("warn"), error: log("error") };
    }
    setState(id, val) { this.states[id] = val; }
    async setStateAsync(id, val) { this.states[id] = val; }
    async setObjectNotExistsAsync() { /* not needed */ }
    subscribeStates() { /* not needed */ }
}

const createAdapter = proxyquire("./main", {
    "@iobroker/adapter-core": { Adapter: FakeAdapter, "@noCallThru": true },
});

/**
 * Simulated projector. Replies are split into two TCP chunks to exercise the receive buffer.
 */
class FakeProjector {
    constructor() {
        this.power = "04";
        /** @type {Record<string, () => string>} */
        this.values = { PWR: () => this.power, LAMP: () => "1234", SNO: () => "X1Y2", BRIGHT: () => "128" };
        /** @type {string[]} */
        this.received = [];
        /** @type {Set<string>} commands that are never answered */
        this.hang = new Set();
        /** @type {Buffer} */
        this.handshake_reply = HANDSHAKE_OK;
        this.handshake_extra = "";
        this.connections = 0;
        /** @type {net.Socket[]} */
        this.sockets = [];
        this.server = net.createServer(this.onConnection.bind(this));
    }

    listen() {
        return new Promise((resolve) => this.server.listen(0, "127.0.0.1", () => resolve(/** @type {net.AddressInfo} */ (this.server.address()).port)));
    }

    close() {
        for (const s of this.sockets)
            s.destroy();
        return new Promise((resolve) => this.server.close(() => resolve(undefined)));
    }

    dropConnections() {
        for (const s of this.sockets)
            s.destroy();
        this.sockets = [];
    }

    onConnection(sock) {
        this.connections++;
        this.sockets.push(sock);
        let buf = "";
        let handshake_done = false;

        const send = (s) => {
            const half = Math.ceil(s.length / 2);
            sock.write(s.slice(0, half), "latin1");
            setImmediate(() => !sock.destroyed && sock.write(s.slice(half), "latin1"));
        };

        sock.on("error", () => { /* ignore */ });
        sock.on("data", (d) => {
            buf += d.toString("latin1");
            if (!handshake_done) {
                if (buf.length < 16)
                    return;
                buf = buf.slice(16);
                handshake_done = true;
                sock.write(Buffer.concat([this.handshake_reply, Buffer.from(this.handshake_extra, "latin1")]));
            }

            let i;
            while ((i = buf.indexOf("\r")) >= 0) {
                const cmd = buf.slice(0, i);
                buf = buf.slice(i + 1);
                this.received.push(cmd);
                if (this.hang.has(cmd))
                    continue;

                const m = cmd.match(/^(\w+)(\?| (.*))$/);
                if (!m) {
                    send("ERR\r:");
                } else if (m[2] === "?") {
                    const v = this.values[m[1]];
                    send(v ? `${m[1]}=${v()}\r:` : "ERR\r:");
                } else {
                    if (m[1] === "PWR")
                        this.power = m[3] === "ON" ? "01" : "04";
                    send(":");
                }
            }
        });
    }
}

/**
 * @param {() => boolean} cond
 * @param {number} [timeout]
 */
async function waitFor(cond, timeout = 3000) {
    const start = Date.now();
    while (!cond()) {
        if (Date.now() - start > timeout)
            throw new Error("Condition not met within " + timeout + " ms");
        await new Promise((r) => setTimeout(r, 5));
    }
}

describe("adapter with simulated projector", function () {
    this.timeout(10000);

    /** @type {FakeProjector} */
    let projector;
    /** @type {any} */
    let adapter;

    async function start() {
        const port = await projector.listen();
        adapter = createAdapter({});
        adapter.config.port_number = port;
        adapter._timing.reconnect_min_delay = 50;
        adapter._reconnect_delay = 50;
        adapter.emit("ready");
        await waitFor(() => adapter.states["info.connection"] === true);
    }

    beforeEach(() => {
        projector = new FakeProjector();
    });

    afterEach(async () => {
        if (adapter)
            await new Promise((r) => adapter.emit("unload", r));
        adapter = null;
        await projector.close();
    });

    it("connects and polls the states available in standby", async () => {
        await start();
        await waitFor(() => adapter.states["projector.serial_number"] === "X1Y2");
        expect(adapter.states["projector.power_state"]).to.equal("Standby, network on");
        expect(adapter.states["projector.state"]).to.equal(false);
        expect(adapter.states["projector.lamp_hours"]).to.equal(1234);
        expect(projector.received).to.not.include("BRIGHT?");
        expect(adapter.logs.filter((l) => l.startsWith("warn") || l.startsWith("error"))).to.deep.equal([]);
    });

    it("handles an IMEVENT in the same chunk as the handshake reply", async () => {
        projector.handshake_extra = "IMEVENT=0001 01 00000000 00000000 T1 F1\r";
        await start();
        await waitFor(() => adapter.states["projector.power_state"] !== undefined);
        expect(adapter.logs.filter((l) => l.startsWith("warn"))).to.deep.equal([]);
    });

    it("does not connect if the projector refuses the handshake", async () => {
        projector.handshake_reply = Buffer.from([0x45, 0x53, 0x43, 0x2f, 0x56, 0x50, 0x2e, 0x6e, 0x65, 0x74, 0x10, 0x03, 0x00, 0x00, 0x53, 0x00]);
        const port = await projector.listen();
        adapter = createAdapter({});
        adapter.config.port_number = port;
        adapter._reconnect_delay = 1000;
        adapter.emit("ready");
        await waitFor(() => adapter.logs.some((l) => l.includes("refused connection, status 0x53")));
        expect(adapter.states["info.connection"]).to.equal(false);
    });

    it("powers on (instance >= 10) and polls everything afterwards", async () => {
        await start();
        adapter.emit("stateChange", adapter.namespace + ".projector.state", { val: true, ack: false });
        await waitFor(() => adapter.states["projector.brightness"] === 128);
        expect(projector.received).to.include("PWR ON");
        expect(adapter.states["projector.state"]).to.equal(true);
        expect(adapter.states["projector.power_state"]).to.equal("Lamp on");
    });

    it("sets unsupported number states to null on ERR", async () => {
        projector.power = "01";
        await start();
        await waitFor(() => "projector.contrast" in adapter.states);
        expect(adapter.states["projector.contrast"]).to.equal(null);
        expect(adapter.states["projector.wfd_display_name"]).to.equal(undefined); // not for device type generic
    });

    it("sends only the last of several quick changes of the same value", async () => {
        projector.power = "01";
        await start();
        projector.received = [];
        adapter.emit("stateChange", adapter.namespace + ".projector.brightness", { val: 100, ack: false });
        adapter.emit("stateChange", adapter.namespace + ".projector.brightness", { val: 120, ack: false });
        await waitFor(() => projector.received.includes("BRIGHT?"));
        const sets = projector.received.filter((c) => c.startsWith("BRIGHT "));
        expect(sets[sets.length - 1]).to.equal("BRIGHT 120");
        expect(sets.length).to.be.at.most(2);
    });

    it("converts boolean states into the projector values", async () => {
        projector.power = "01";
        await start();
        adapter.emit("stateChange", adapter.namespace + ".projector.auto_keystone", { val: true, ack: false });
        adapter.emit("stateChange", adapter.namespace + ".projector.illumination", { val: false, ack: false });
        await waitFor(() => projector.received.includes("ILLUM 00"));
        expect(projector.received).to.include("AUTOKEYSTONE ON");
    });

    it("continues with the next command after a timeout", async () => {
        projector.hang.add("LAMP?");
        const port = await projector.listen();
        adapter = createAdapter({});
        adapter.config.port_number = port;
        adapter._timing.command_timeout = 100;
        adapter.emit("ready");
        await waitFor(() => adapter.states["projector.serial_number"] === "X1Y2");
        expect(adapter.logs.some((l) => l.includes("No reply for command \"LAMP?\\r\""))).to.equal(true);
        expect(projector.connections).to.equal(1);
    });

    it("reconnects after too many timeouts in a row", async () => {
        for (const c of ["PWR?", "LAMP?", "SNO?"])
            projector.hang.add(c);
        const port = await projector.listen();
        adapter = createAdapter({});
        adapter.config.port_number = port;
        adapter._timing.command_timeout = 50;
        adapter._timing.reconnect_min_delay = 50;
        adapter.emit("ready");
        await waitFor(() => projector.connections >= 2);
        expect(adapter.logs.some((l) => l.includes("Too many timeouts"))).to.equal(true);
    });

    it("reconnects after the connection was lost", async () => {
        await start();
        projector.dropConnections();
        await waitFor(() => adapter.states["info.connection"] === false);
        await waitFor(() => adapter.states["info.connection"] === true);
        expect(projector.connections).to.equal(2);
    });

    it("does not reconnect after unload", async () => {
        await start();
        await new Promise((r) => adapter.emit("unload", r));
        expect(adapter.states["info.connection"]).to.equal(false);
        await new Promise((r) => setTimeout(r, 200));
        expect(projector.connections).to.equal(1);
        adapter = null;
    });
});
