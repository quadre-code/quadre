import * as _ from "lodash";

const state = {};

export function get(key: string): any { return _.get(state, key); }

export function set(key: string, value: any): any { return _.set(state, key, value); }

// defaults
set("socketServer.state", "ERR_NODE_NOT_YET_STARTED");
set("socketServer.port", 0);
