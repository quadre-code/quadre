import * as _ from "lodash";
import { remote } from "electron";

const app = _.extend({}, require("./app"), remote.require("./appshell/app-menu"));
const fs = _.extend({}, require("fs-extra"), require("./fs-additions"));
const shell = remote.require("./appshell/shell");

// prevent using this alias, rather use .remove
delete fs.delete;

// make sure extensions folder exists
fs.ensureDir(app.getExtensionsFolder());

// this needs to be node-require style export
module.exports = { app, fs, shell, inElectron: true, windowGoingAway: false };
