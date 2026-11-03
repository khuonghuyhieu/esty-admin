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
        AppError: {
            /** @enum {string} */
            code: "invalid_request" | "unauthenticated" | "forbidden" | "not_found" | "revision_conflict" | "last_owner" | "invitation_conflict" | "delivery_unavailable" | "dependency_unavailable" | "bootstrap_conflict";
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
            capabilities: ("profile.read.self" | "profile.update.self" | "team.read" | "team.invite" | "team.invite.manage" | "team.role.assign" | "team.membership.manage" | "workspace.read" | "workspace.update" | "audit.read")[];
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
            action: "workspace.bootstrap" | "profile.update" | "workspace.update" | "membership.update" | "invitation.create" | "invitation.revoke" | "invitation.accept" | "invitation.delivery" | "invitation.reconcile";
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
