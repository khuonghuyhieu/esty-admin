// Generated from feature 001 OpenAPI. Run api:codegen; do not edit.
export interface paths {
    "/health/live": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getLiveness"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/health/ready": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getReadiness"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        Unauthorized: {
            /** @constant */
            status: "unauthorized";
        };
        Liveness: {
            /** @constant */
            status: "ok";
        };
        Ready: {
            /** @constant */
            status: "ready";
            /** @constant */
            database: "up";
            /** @constant */
            migrations: "current";
        };
        Degraded: {
            /** @constant */
            status: "degraded";
            /** @enum {string} */
            reason: "database_unavailable" | "database_timeout" | "migrations_pending";
        };
    };
    responses: {
        /** @description Generic Vercel denial before database work. */
        Unauthorized: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Unauthorized"];
            };
        };
    };
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    getLiveness: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Liveness */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Liveness"];
                };
            };
            401: components["responses"]["Unauthorized"];
        };
    };
    getReadiness: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Ready */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Ready"];
                };
            };
            401: components["responses"]["Unauthorized"];
            /** @description Degraded */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Degraded"];
                };
            };
        };
    };
}
