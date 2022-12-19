import DomainManager from "./domain-manager";
import * as WebSocket from "ws";
import { errToMessage, errToString, getLogger } from "../utils";

export interface ConnectionMessage {
    id: number;
    domain: string;
    command?: string;
    event?: string;
    parameters?: Array<any>;
}

export interface ConnectionErrorMessage {
    message: string;
}

export interface CommandResponse {
    id: number;
    response: any;
}

export interface CommandError {
    id: number;
    message: string;
    stack: string;
}

const log = getLogger("connection-manager");

/**
 * @private
 * @type{Array.<Connection>}
 * Currently active connections
 */
const _connections: Array<Connection> = [];

export class Connection {

    /**
     * @private
     * @type {WebSocket}
     * The connection's WebSocket
     */
    private _ws: WebSocket | null = null;

    /**
     * @private
     * @type {boolean}
     * Whether the connection is connected.
     */
    private _connected: boolean = false;

    /**
     * @private
     * @constructor
     * A WebSocket connection to a client. This is a private constructor.
     * Callers should use the ConnectionManager.createConnection function
     * instead.
     * @param {WebSocket} ws The WebSocket representing the client
     */
    constructor(ws: WebSocket) {
        this._ws = ws;
        this._connected = true;
        this._ws.on("message", this._receive.bind(this));
        this._ws.on("close", this.close.bind(this));
    }

    /**
     * @private
     * Sends a message over the WebSocket. Called by public sendX commands.
     * @param {string} type Message type. Currently supported types are
     *                 "event", "commandResponse", "commandError", "error"
     * @param {object} message Message body, must be JSON.stringify-able
     */
    private _send(type: string, message: ConnectionMessage | ConnectionErrorMessage | CommandResponse | CommandError): void {
        if (this._ws && this._connected) {
            try {
                this._ws.send(JSON.stringify({ type, message }));
            } catch (e) {
                console.error("[Connection] Unable to stringify message: " + e.message);
            }
        }
    }

    /**
     * @private
     * Sends a binary message over the WebSocket. Implicitly interpreted as a
     * message of type "commandResponse".
     * @param {Buffer} message
     */
    private _sendBinary(message: Buffer): void {
        if (this._ws && this._connected) {
            this._ws.send(message, {binary: true, mask: false});
        }
    }

    /**
     * @private
     * Receive event handler for the WebSocket. Responsible for parsing
     * message and handing it off to the appropriate handler.
     * @param {string} message Message received by WebSocket
     */
    private _receive(message: string): void {
        let m: ConnectionMessage;
        try {
            m = JSON.parse(message);
        } catch (ignoreErr) {
            // try again with potentially missing `}`, this should be fixed when we get rid of websockets
            try {
                m = JSON.parse(message + "}");
            } catch (err) {
                log.error(`Error parsing message json: ${err.name}: ${err.message}`);
                this.sendError("Unable to parse message: " + message);
                return;
            }
        }

        const validId = m.id !== null && m.id !== undefined;
        const hasDomain = !!m.domain;
        const hasCommand = typeof m.command === "string";

        if (validId && hasDomain && hasCommand) {
            // okay if m.parameters is null/undefined
            try {
                DomainManager.executeCommand(
                    this,
                    m.id,
                    m.domain,
                    m.command as string,
                    m.parameters
                );
            } catch (executionError) {
                this.sendCommandError(m.id, errToMessage(executionError), errToString(executionError));
            }
        } else {
            this.sendError(`Malformed message (${validId}, ${hasDomain}, ${hasCommand}): ${message}`);
        }
    }

    /**
     * Closes the connection and does necessary cleanup
     */
    public close(): void {
        if (this._ws) {
            try {
                this._ws.close();
            } catch (err) {
                // ignore
            }
        }
        this._connected = false;
        _connections.splice(_connections.indexOf(this), 1);
    }

    /**
     * Sends an Error message
     * @param {object} message Error message. Must be JSON.stringify-able.
     */
    public sendError(message: string): void {
        this._send("error", { message });
    }

    /**
     * Sends a response to a command execution
     * @param {number} id unique ID of the command that was executed. ID is
     *    generated by the client when the command is issued.
     * @param {object|Buffer} response Result of the command execution. Must
     *    either be JSON.stringify-able or a raw Buffer. In the latter case,
     *    the result will be sent as a binary response.
     */
    public sendCommandResponse(id: number, response: Object | Buffer): void {
        if (Buffer.isBuffer(response)) {
            // Assume the id is an unsigned 32-bit integer, which is encoded
            // as a four-byte header
            const header = new Buffer(4);

            header.writeUInt32LE(id, 0);

            // Prepend the header to the message
            const message = Buffer.concat([header, response], response.length + 4);

            this._sendBinary(message);
        } else {
            this._send("commandResponse", { id, response });
        }
    }

    /**
     * Sends a response indicating that an error occurred during command
     * execution
     * @param {number} id unique ID of the command that was executed. ID is
     *    generated by the client when the command is issued.
     * @param {string} message Error message
     * @param {?object} stack Call stack from the exception, if possible. Must
     *    be JSON.stringify-able.
     */
    public sendCommandError(id: number, message: string, stack?: string): void {
        this._send("commandError", { id, message, stack });
    }

    /**
     * Sends an event message
     * @param {number} id unique ID for the event.
     * @param {string} domain Domain of the event.
     * @param {string} event Name of the event
     * @param {object} parameters Event parameters. Must be JSON.stringify-able.
     */
    public sendEventMessage(id: number, domain: string, event: string, parameters?: Array<any>): void {
        this._send("event", { id, domain, event, parameters });
    }

}

/**
 * Factory function for creating a new Connection
 * @param {WebSocket} ws The WebSocket connected to the client.
 */
export function createConnection(ws: WebSocket): void {
    _connections.push(new Connection(ws));
}

/**
 * Closes all connections gracefully. Should be called during shutdown.
 */
export function closeAllConnections(): void {
    while (_connections.length > 0) {
        const conn = _connections.shift();
        if (conn) {
            try {
                conn.close();
            } catch (err) {
                // ignore
            }
        }
    }
}

/**
 * Sends all open connections the specified event
 * @param {number} id unique ID for the event.
 * @param {string} domain Domain of the event.
 * @param {string} event Name of the event
 * @param {object} parameters Event parameters. Must be JSON.stringify-able.
 */
export function sendEventToAllConnections(id: number, domain: string, event: string, parameters?: Array<any>): void {
    _connections.forEach(function (c) {
        c.sendEventMessage(id, domain, event, parameters);
    });
}
