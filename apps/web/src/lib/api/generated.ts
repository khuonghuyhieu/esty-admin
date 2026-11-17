// Generated from feature 001 OpenAPI. Run npm run codegen --workspace=@esty-admin/web; do not edit.
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
    "/v1/app/integrations/etsy": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Owner-only local persisted status. Zero provider requests or refresh. */
        get: operations["getEtsyConnection"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/app/integrations/etsy/invitations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getEtsyInvitations"];
        put?: never;
        post: operations["createEtsyInvitation"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/app/integrations/etsy/invitations/{id}/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["cancelEtsyInvitation"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/app/integrations/etsy/disconnect": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["disconnectEtsyConnection"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/app/integrations/etsy/read": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Explicit Owner sync: getMe, bound getShop and at most one durable refresh. Never background polling. */
        post: operations["syncEtsyShop"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/integrations/etsy/invite/start": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Exact configured Host and same Origin only. Scoped invitation proof; no app membership. Maximum8KiB JSON. Recipient confirmation page is separately FE-owned. */
        post: operations["startEtsyConsent"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/integrations/etsy/callback": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Exact configured Host/raw path only; single-use transaction-authenticated callback. Success query is exactly state+code; denial is state+error with optional error_description/error_uri. Maximum4096 bytes; duplicate and unknown fields rejected. No public status or confirmation page. */
        get: operations["completeEtsyConsent"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/app/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getAppMe"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch: operations["updateAppProfile"];
        trace?: never;
    };
    "/v1/app/workspace": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getAppWorkspace"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch: operations["updateAppWorkspace"];
        trace?: never;
    };
    "/v1/app/team": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getAppTeam"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/app/team/{memberId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch: operations["updateAppMember"];
        trace?: never;
    };
    "/v1/app/audit": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getAppAudit"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/app/invitations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getAppInvitations"];
        put?: never;
        post: operations["createAppInvitation"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/app/invitations/{id}/reinvite": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["reinviteAppInvitation"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/app/invitations/{id}/revoke": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["revokeAppInvitation"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/app/invitations/{id}/accept": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["acceptAppInvitation"];
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
        EtsyConnection: {
            /** Format: uuid */
            connectionId: string | null;
            /** @enum {string} */
            state: "unconnected" | "verification_pending" | "active" | "reconnect_required" | "refresh_unknown" | "disconnected";
            revision: number;
            shopId: string | null;
            etsyUserId: string | null;
            /** Format: date-time */
            verifiedAt: string | null;
            /** Format: date-time */
            observedAt: string | null;
            /** @description Persisted consent/refresh phase; expired submitted work is reported unknown without reconciliation writes or provider requests */
            attemptPhase: string | null;
            outcome: string | null;
        };
        EtsyInvitation: {
            /** Format: uuid */
            id: string;
            shopId: string;
            /** @enum {string} */
            state: "pending" | "in_progress" | "connected" | "declined" | "expired" | "cancelled" | "failed" | "outcome_unknown";
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            expiresAt: string;
        };
        EtsyInvitationPage: {
            items: components["schemas"]["EtsyInvitation"][];
            /** Format: uuid */
            nextCursor: string | null;
            connection: components["schemas"]["EtsyConnection"];
        };
        EtsyCreateInvitation: {
            expectedShopId: string;
            expectedRevision: number;
            /** Format: uuid */
            idempotencyKey: string;
        };
        EtsyCreatedInvitation: {
            /** Format: uuid */
            invitationId: string;
            revision: number;
            /** Format: date-time */
            expiresAt: string;
            /**
             * Format: uri
             * @description Secret invitation fragment; never retained in tables, logs or idempotency replays
             */
            shareUrl?: string;
        };
        EtsyMutation: {
            expectedRevision: number;
            /** Format: uuid */
            idempotencyKey: string;
        };
        EtsyDisposition: {
            revision: number;
            localDisconnected: boolean;
            /** @enum {string} */
            providerRevocation: "not_confirmed";
        };
        EtsyShopObservation: {
            etsyUserId: string;
            shopId: string;
            shopName: string;
            currencyCode: string;
            /** Format: uuid */
            connectionId: string;
            revision: number;
            /** Format: date-time */
            observedAt: string;
        };
        AppError: {
            /** @enum {string} */
            code: "invalid_request" | "unauthenticated" | "forbidden" | "not_found" | "revision_conflict" | "last_owner" | "invitation_conflict" | "delivery_unavailable" | "dependency_unavailable" | "bootstrap_conflict" | "configuration_unavailable" | "upstream_unavailable" | "upstream_rate_limited" | "reconnect_required" | "outcome_unknown" | "connection_changed" | "connection_busy";
            retryAfterSeconds?: number;
            /** Format: uuid */
            requestId: string;
        };
        AppProfile: {
            /** Format: uuid */
            userId: string;
            /** @description Trimmed nonblank Unicode name; reject control characters and malformed Unicode. */
            displayName: string;
            revision: number;
        };
        AppWorkspace: {
            /** Format: uuid */
            id: string;
            /** @description Trimmed nonblank Unicode name; reject control characters and malformed Unicode. */
            displayName: string;
            revision: number;
        };
        AppMember: {
            /** Format: uuid */
            userId: string;
            /** @description Trimmed nonblank Unicode name; reject control characters and malformed Unicode. */
            displayName: string;
            /** @enum {string} */
            role: "owner" | "member";
            /** @enum {string} */
            status: "active" | "disabled";
            revision: number;
        };
        AppMe: {
            profile: components["schemas"]["AppProfile"];
            /** Format: email */
            readonly email: string;
            workspace: components["schemas"]["AppWorkspace"];
            membership: components["schemas"]["AppMember"];
            capabilities: ("profile.read.self" | "profile.update.self" | "team.read" | "team.invite" | "team.invite.manage" | "team.role.assign" | "team.membership.manage" | "workspace.read" | "workspace.update" | "audit.read" | "etsy.connection.read" | "etsy.connection.manage")[];
        };
        AppNamePatch: {
            /** @description Trimmed nonblank Unicode name; reject control characters and malformed Unicode. */
            displayName: string;
            revision: number;
        };
        AppMemberPatch: {
            /** @enum {string} */
            role?: "owner" | "member";
            /** @enum {string} */
            status?: "active" | "disabled";
            revision: number;
        } | unknown | unknown;
        AppProfileResult: {
            profile: components["schemas"]["AppProfile"];
        };
        AppWorkspaceResult: {
            workspace: components["schemas"]["AppWorkspace"];
        };
        AppMemberResult: {
            member: components["schemas"]["AppMember"];
        };
        AppInvitation: {
            /** Format: uuid */
            id: string;
            /** Format: email */
            email: string;
            /** @constant */
            role: "member";
            /** @enum {string} */
            status: "pending" | "accepted" | "revoked" | "expired";
            /** @enum {string} */
            delivery: "pending" | "confirmed" | "failed" | "unknown";
            revision: number;
            /** Format: date-time */
            expiresAt: string;
        };
        AppInvitationResult: {
            invitation: components["schemas"]["AppInvitation"];
        };
        AppInvitationCreate: {
            /** Format: email */
            email: string;
            /** Format: uuid */
            idempotencyKey: string;
        };
        AppInvitationReinvite: {
            /** Format: uuid */
            idempotencyKey: string;
            revision: number;
        };
        AppInvitationRevoke: {
            revision: number;
        };
        AppInvitationAccept: {
            /** @description Trimmed nonblank Unicode name; reject control characters and malformed Unicode. */
            displayName: string;
        };
        AppAuditEvent: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            actorUserId: string;
            /** @enum {string} */
            action: "workspace.bootstrap" | "profile.update" | "workspace.update" | "membership.update" | "invitation.create" | "invitation.revoke" | "invitation.accept" | "invitation.delivery" | "invitation.reconcile" | "etsy.invitation.create" | "etsy.invitation.cancel" | "etsy.attempt.start" | "etsy.callback" | "etsy.sync" | "etsy.refresh" | "etsy.disconnect" | "etsy.prune";
            /** Format: uuid */
            targetId: string;
            /** @enum {string} */
            outcome: "accepted" | "confirmed" | "failed" | "unknown";
            /** Format: uuid */
            requestId: string;
            /** Format: date-time */
            occurredAt: string;
            beforeRevision: number | null;
            afterRevision: number | null;
            /** @enum {string|null} */
            beforeRole: "owner" | "member" | null;
            /** @enum {string|null} */
            afterRole: "owner" | "member" | null;
            /** @enum {string|null} */
            beforeStatus: "active" | "disabled" | null;
            /** @enum {string|null} */
            afterStatus: "active" | "disabled" | null;
        };
        AppMemberPage: {
            items: components["schemas"]["AppMember"][];
            /** Format: uuid */
            nextCursor: string | null;
        };
        AppInvitationPage: {
            items: components["schemas"]["AppInvitation"][];
            /** Format: uuid */
            nextCursor: string | null;
        };
        AppAuditEventPage: {
            items: components["schemas"]["AppAuditEvent"][];
            /** Format: uuid */
            nextCursor: string | null;
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
        /** @description Strict input validation failed. */
        AppBadRequest: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["AppError"];
            };
        };
        /** @description Invalid technical key or user authentication/session. */
        AppUnauthorized: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Unauthorized"] | components["schemas"]["AppError"];
            };
        };
        /** @description Current membership/capability denied. */
        AppForbidden: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["AppError"];
            };
        };
        /** @description Unknown or inaccessible scoped object. */
        AppNotFound: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["AppError"];
            };
        };
        /** @description Revision, invitation, ownership or idempotency conflict. */
        AppConflict: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["AppError"];
            };
        };
        /** @description Dependency unavailable or outcome uncertain; do not blindly retry delivery. */
        AppUnavailable: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["AppError"];
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
    getEtsyConnection: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Local status */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EtsyConnection"];
                };
            };
            401: components["responses"]["AppUnauthorized"];
            default: components["responses"]["AppBadRequest"];
        };
    };
    getEtsyInvitations: {
        parameters: {
            query?: {
                limit?: number;
                cursor?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Safe paginated history without link secrets */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EtsyInvitationPage"];
                };
            };
            401: components["responses"]["AppUnauthorized"];
            default: components["responses"]["AppBadRequest"];
        };
    };
    createEtsyInvitation: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["EtsyCreateInvitation"];
            };
        };
        responses: {
            /** @description Durable receipt; shareUrl appears only on first acknowledged creation */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EtsyCreatedInvitation"];
                };
            };
            401: components["responses"]["AppUnauthorized"];
            default: components["responses"]["AppBadRequest"];
        };
    };
    cancelEtsyInvitation: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["EtsyMutation"];
            };
        };
        responses: {
            /** @description Local cancellation receipt */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EtsyDisposition"];
                };
            };
            401: components["responses"]["AppUnauthorized"];
            default: components["responses"]["AppBadRequest"];
        };
    };
    disconnectEtsyConnection: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["EtsyMutation"];
            };
        };
        responses: {
            /** @description Local disconnect, not provider revocation */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EtsyDisposition"];
                };
            };
            401: components["responses"]["AppUnauthorized"];
            default: components["responses"]["AppBadRequest"];
        };
    };
    syncEtsyShop: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    expectedRevision: number;
                };
            };
        };
        responses: {
            /** @description Fresh verified four-field projection */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EtsyShopObservation"];
                };
            };
            401: components["responses"]["AppUnauthorized"];
            default: components["responses"]["AppBadRequest"];
        };
    };
    startEtsyConsent: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    secret: string;
                };
            };
        };
        responses: {
            /** @description One bound Etsy consent navigation; private/no-store/no-referrer */
            303: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Generic invalid or consumed invitation */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Generic dependency failure */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    completeEtsyConsent: {
        parameters: {
            query: {
                state: string;
                code?: string;
                error?: string;
                error_description?: string;
                error_uri?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Fixed clean neutral return origin; not proof of connection success */
            303: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Generic invalid, expired or replayed transaction */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Generic dependency failure */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    getAppMe: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Confirmed application result. Invitation delivery is reported separately and never implies admission or receipt. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AppMe"];
                };
            };
            400: components["responses"]["AppBadRequest"];
            401: components["responses"]["AppUnauthorized"];
            403: components["responses"]["AppForbidden"];
            404: components["responses"]["AppNotFound"];
            409: components["responses"]["AppConflict"];
            503: components["responses"]["AppUnavailable"];
        };
    };
    updateAppProfile: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AppNamePatch"];
            };
        };
        responses: {
            /** @description Confirmed application result. Invitation delivery is reported separately and never implies admission or receipt. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AppProfileResult"];
                };
            };
            400: components["responses"]["AppBadRequest"];
            401: components["responses"]["AppUnauthorized"];
            403: components["responses"]["AppForbidden"];
            404: components["responses"]["AppNotFound"];
            409: components["responses"]["AppConflict"];
            503: components["responses"]["AppUnavailable"];
        };
    };
    getAppWorkspace: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Confirmed application result. Invitation delivery is reported separately and never implies admission or receipt. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AppWorkspaceResult"];
                };
            };
            400: components["responses"]["AppBadRequest"];
            401: components["responses"]["AppUnauthorized"];
            403: components["responses"]["AppForbidden"];
            404: components["responses"]["AppNotFound"];
            409: components["responses"]["AppConflict"];
            503: components["responses"]["AppUnavailable"];
        };
    };
    updateAppWorkspace: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AppNamePatch"];
            };
        };
        responses: {
            /** @description Confirmed application result. Invitation delivery is reported separately and never implies admission or receipt. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AppWorkspaceResult"];
                };
            };
            400: components["responses"]["AppBadRequest"];
            401: components["responses"]["AppUnauthorized"];
            403: components["responses"]["AppForbidden"];
            404: components["responses"]["AppNotFound"];
            409: components["responses"]["AppConflict"];
            503: components["responses"]["AppUnavailable"];
        };
    };
    getAppTeam: {
        parameters: {
            query?: {
                limit?: number;
                cursor?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Confirmed application result. Invitation delivery is reported separately and never implies admission or receipt. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AppMemberPage"];
                };
            };
            400: components["responses"]["AppBadRequest"];
            401: components["responses"]["AppUnauthorized"];
            403: components["responses"]["AppForbidden"];
            404: components["responses"]["AppNotFound"];
            409: components["responses"]["AppConflict"];
            503: components["responses"]["AppUnavailable"];
        };
    };
    updateAppMember: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                memberId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AppMemberPatch"];
            };
        };
        responses: {
            /** @description Confirmed application result. Invitation delivery is reported separately and never implies admission or receipt. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AppMemberResult"];
                };
            };
            400: components["responses"]["AppBadRequest"];
            401: components["responses"]["AppUnauthorized"];
            403: components["responses"]["AppForbidden"];
            404: components["responses"]["AppNotFound"];
            409: components["responses"]["AppConflict"];
            503: components["responses"]["AppUnavailable"];
        };
    };
    getAppAudit: {
        parameters: {
            query?: {
                limit?: number;
                cursor?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Confirmed application result. Invitation delivery is reported separately and never implies admission or receipt. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AppAuditEventPage"];
                };
            };
            400: components["responses"]["AppBadRequest"];
            401: components["responses"]["AppUnauthorized"];
            403: components["responses"]["AppForbidden"];
            404: components["responses"]["AppNotFound"];
            409: components["responses"]["AppConflict"];
            503: components["responses"]["AppUnavailable"];
        };
    };
    getAppInvitations: {
        parameters: {
            query?: {
                limit?: number;
                cursor?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Confirmed application result. Invitation delivery is reported separately and never implies admission or receipt. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AppInvitationPage"];
                };
            };
            400: components["responses"]["AppBadRequest"];
            401: components["responses"]["AppUnauthorized"];
            403: components["responses"]["AppForbidden"];
            404: components["responses"]["AppNotFound"];
            409: components["responses"]["AppConflict"];
            503: components["responses"]["AppUnavailable"];
        };
    };
    createAppInvitation: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AppInvitationCreate"];
            };
        };
        responses: {
            /** @description Confirmed application result. Invitation delivery is reported separately and never implies admission or receipt. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AppInvitationResult"];
                };
            };
            400: components["responses"]["AppBadRequest"];
            401: components["responses"]["AppUnauthorized"];
            403: components["responses"]["AppForbidden"];
            404: components["responses"]["AppNotFound"];
            409: components["responses"]["AppConflict"];
            503: components["responses"]["AppUnavailable"];
        };
    };
    reinviteAppInvitation: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AppInvitationReinvite"];
            };
        };
        responses: {
            /** @description Confirmed application result. Invitation delivery is reported separately and never implies admission or receipt. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AppInvitationResult"];
                };
            };
            400: components["responses"]["AppBadRequest"];
            401: components["responses"]["AppUnauthorized"];
            403: components["responses"]["AppForbidden"];
            404: components["responses"]["AppNotFound"];
            409: components["responses"]["AppConflict"];
            503: components["responses"]["AppUnavailable"];
        };
    };
    revokeAppInvitation: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AppInvitationRevoke"];
            };
        };
        responses: {
            /** @description Confirmed application result. Invitation delivery is reported separately and never implies admission or receipt. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AppInvitationResult"];
                };
            };
            400: components["responses"]["AppBadRequest"];
            401: components["responses"]["AppUnauthorized"];
            403: components["responses"]["AppForbidden"];
            404: components["responses"]["AppNotFound"];
            409: components["responses"]["AppConflict"];
            503: components["responses"]["AppUnavailable"];
        };
    };
    acceptAppInvitation: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AppInvitationAccept"];
            };
        };
        responses: {
            /** @description Confirmed application result. Invitation delivery is reported separately and never implies admission or receipt. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AppMemberResult"];
                };
            };
            400: components["responses"]["AppBadRequest"];
            401: components["responses"]["AppUnauthorized"];
            403: components["responses"]["AppForbidden"];
            404: components["responses"]["AppNotFound"];
            409: components["responses"]["AppConflict"];
            503: components["responses"]["AppUnavailable"];
        };
    };
}
