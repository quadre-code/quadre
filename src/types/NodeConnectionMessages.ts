/* eslint-disable */

export interface NodeConnectionRequestMessage {
    id: number;
    domain: string;
    command: string;
    parameters: Array<any>;
}

export interface NodeConnectionResponseMessage {
    id: number;
    domain: string;
    event: string;
    message: any;
    parameters: Array<any>;
    response: any;
    stack: string;
}
