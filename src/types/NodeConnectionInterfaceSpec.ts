/* eslint-disable */
/* tslint:disable:no-empty-interface */

export interface NodeConnectionCommandSpec {

}

export interface NodeConnectionEventSpec {
    parameters: Array<any>;
}

export interface NodeConnectionDomainSpec {
    commands: { [commandName: string]: NodeConnectionCommandSpec };
    events: { [eventName: string]: NodeConnectionEventSpec };
}

export interface NodeConnectionInterfaceSpec {
    [domainName: string]: NodeConnectionDomainSpec;
}
