// Generated internal upstream transport only; no runtime proxy. Run scripts/etsy-codegen.mjs.
export type paths = Record<string, never>;
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        Self: {
            /**
             * Format: int64
             * @description The numeric ID of a user. This number is also a valid shop ID for the user's shop.
             */
            user_id?: string;
            /**
             * Format: int64
             * @description The unique positive non-zero numeric ID for an Etsy Shop.
             */
            shop_id?: string;
        };
        Shop: {
            /**
             * Format: int64
             * @description The unique positive non-zero numeric ID for an Etsy Shop.
             */
            shop_id?: string;
            /**
             * Format: int64
             * @description The numeric user ID of the [user](/documentation/reference#tag/User) who owns this shop.
             */
            user_id?: string;
            /** @description The shop's name string. */
            shop_name?: string;
            /** @description The ISO (alphabetic) code for the shop's currency. The shop displays all prices in this currency by default. */
            currency_code?: string;
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export type operations = Record<string, never>;
