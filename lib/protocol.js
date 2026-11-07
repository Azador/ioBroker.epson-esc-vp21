"use strict";

/*
 * Pure helper functions for the ESC/VP21 protocol (no adapter or socket dependencies).
 */

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

/**
 * Returns a new queue with the command added.
 * Queries already in the queue are not added twice. A set command replaces a still pending
 * set command for the same tag and is placed before the queued queries, so user actions
 * are not delayed by a running poll.
 * @param {string[]} queue
 * @param {string} cmd
 * @returns {string[]}
 */
function enqueueCommand(queue, cmd) {
    if (isQuery(cmd))
        return queue.includes(cmd) ? queue : [...queue, cmd];

    const tag = commandTag(cmd);
    const result = queue.filter((c) => isQuery(c) || commandTag(c) !== tag);
    const first_query = result.findIndex(isQuery);
    if (first_query < 0)
        result.push(cmd);
    else
        result.splice(first_query, 0, cmd);
    return result;
}

/**
 * Splits received data into complete replies. Replies are lines terminated by "\r";
 * a ":" at the start of a line is the prompt that marks the end of a command.
 * Incomplete data is returned in `rest` and has to be prepended to the next data.
 * @param {string} rx
 * @returns {{items: Array<{prompt: true} | {line: string}>, rest: string}}
 */
function extractReplies(rx) {
    /** @type {Array<{prompt: true} | {line: string}>} */
    const items = [];

    while (rx.length > 0) {
        if (rx[0] === ":") {
            items.push({ prompt: true });
            rx = rx.slice(1);
            continue;
        }

        const end = rx.indexOf("\r");
        if (end < 0)
            break;

        const line = rx.slice(0, end).replace(/^\n+|\n+$/g, "");
        rx = rx.slice(end + 1);
        if (line !== "")
            items.push({ line });
    }

    return { items, rest: rx };
}

module.exports = {
    decodePower,
    isQuery,
    commandTag,
    enqueueCommand,
    extractReplies,
};
