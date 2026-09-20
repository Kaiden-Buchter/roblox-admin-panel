const json = (data, status = 200, headers = {}) =>
    new Response(JSON.stringify(data), {
        status,
        headers: {
            "content-type": "application/json; charset=utf-8",
            ...headers
        }
    });

const now = () => Date.now();

const ACTIVE_SESSION_TTL = 30 * 1000;

const SERVER_TTL = 10 * 60 * 1000;
const AUDIT_LOG_LIMIT = 500;

const id = () => crypto.randomUUID();

function cors(env) {
    return {
        "Access-Control-Allow-Origin":
            env.CORS_ORIGIN || "https://detailingzone.org",

        "Access-Control-Allow-Credentials": "true",

        "Access-Control-Allow-Headers":
            "Content-Type, Authorization, X-Server-Secret",

        "Access-Control-Allow-Methods":
            "GET, POST, OPTIONS"
    };
}

function withCors(response, env) {
    const headers = new Headers(response.headers);

    for (const [key, value] of Object.entries(cors(env))) {
        headers.set(key, value);
    }

    return new Response(response.body, {
        status: response.status,
        headers
    });
}

/* -------------------------------------------------------
   BASE64 URL HELPERS
------------------------------------------------------- */

function b64url(bytes) {
    let s = "";

    for (const b of bytes) {
        s += String.fromCharCode(b);
    }

    return btoa(s)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}

function unb64url(s) {
    return Uint8Array.from(
        atob(
            s
                .replace(/-/g, "+")
                .replace(/_/g, "/") +
            "=".repeat((4 - (s.length % 4)) % 4)
        ),
        c => c.charCodeAt(0)
    );
}

/* -------------------------------------------------------
   HMAC SESSION TOKENS
------------------------------------------------------- */

async function hmac(secret, text) {
    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        {
            name: "HMAC",
            hash: "SHA-256"
        },
        false,
        ["sign", "verify"]
    );

    return new Uint8Array(
        await crypto.subtle.sign(
            "HMAC",
            key,
            new TextEncoder().encode(text)
        )
    );
}

async function sign(payload, secret) {
    const body = b64url(
        new TextEncoder().encode(JSON.stringify(payload))
    );

    const signature = await hmac(secret, body);

    return `${body}.${b64url(signature)}`;
}

async function verify(token, secret) {
    try {
        if (!token || !secret) {
            return null;
        }

        const parts = token.split(".");

        if (parts.length !== 2) {
            return null;
        }

        const [body, signature] = parts;

        const key = await crypto.subtle.importKey(
            "raw",
            new TextEncoder().encode(secret),
            {
                name: "HMAC",
                hash: "SHA-256"
            },
            false,
            ["verify"]
        );

        const valid = await crypto.subtle.verify(
            "HMAC",
            key,
            unb64url(signature),
            new TextEncoder().encode(body)
        );

        if (!valid) {
            return null;
        }

        const payload = JSON.parse(
            new TextDecoder().decode(
                unb64url(body)
            )
        );

        if (!payload.exp || payload.exp <= now()) {
            return null;
        }

        return payload;

    } catch {
        return null;
    }
}

function bytesEqual(left, right) {
    if (left.length !== right.length) return false;
    let difference = 0;
    for (let index = 0; index < left.length; index += 1) {
        difference |= left[index] ^ right[index];
    }
    return difference === 0;
}

async function passwordHash(password, salt) {
    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(password),
        "PBKDF2",
        false,
        ["deriveBits"]
    );
    return new Uint8Array(await crypto.subtle.deriveBits({
        name: "PBKDF2",
        salt,
        iterations: 100000,
        hash: "SHA-256"
    }, key, 256));
}

async function createPasswordCredential(password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const hash = await passwordHash(password, salt);
    return { salt: b64url(salt), hash: b64url(hash) };
}

async function checkPassword(password, credential) {
    if (!credential?.password_salt || !credential?.password_hash) return false;
    const hash = await passwordHash(password, unb64url(credential.password_salt));
    return bytesEqual(hash, unb64url(credential.password_hash));
}

/* -------------------------------------------------------
   AUTHENTICATION
------------------------------------------------------- */

function cookieToken(req) {
    const cookies = req.headers.get("cookie") || "";

    return cookies
        .split(";")
        .map(x => x.trim())
        .find(x => x.startsWith("session="))
        ?.slice(8);
}

async function auth(req, env) {
    const cookie = cookieToken(req);

    const authorization =
        req.headers.get("authorization") || "";

    const bearer = authorization.replace(
        /^Bearer\s+/i,
        ""
    );

    const token = cookie || bearer;

    if (!token) {
        return null;
    }

    return verify(
        token,
        env.SESSION_SECRET
    );
}

/* -------------------------------------------------------
   AUDIT LOGGING
------------------------------------------------------- */

async function audit(env, data) {
    try {
        let adminDisplayName = data.adminDisplayName || null;
        if (!adminDisplayName && data.adminId) {
            const admin = await env.DB.prepare(
                "SELECT display_name FROM admins WHERE id=?"
            ).bind(data.adminId).first();
            adminDisplayName = admin?.display_name || null;
        }

        await env.DB.prepare(`
            INSERT INTO audit_logs (
                timestamp,
                admin_id,
                admin_username,
                admin_display_name,
                action,
                target_user_id,
                target_username,
                server_id,
                reason,
                changed_values_json,
                success,
                error_message,
                request_id
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
            .bind(
                now(),
                data.adminId || null,
                data.adminUsername || null,
                adminDisplayName,
                data.action || "UNKNOWN",
                data.targetUserId || null,
                data.targetUsername || null,
                data.serverId || null,
                data.reason || null,
                data.changedValues
                    ? JSON.stringify(data.changedValues)
                    : null,
                data.success ? 1 : 0,
                data.error || null,
                data.requestId || id()
            )
            .run();
    } catch (error) {
        console.error(
            "Audit log error:",
            error
        );
    }
}

/* -------------------------------------------------------
   ROBLOX SERVER AUTHENTICATION
------------------------------------------------------- */

function requireServer(req, env) {
    const secret =
        req.headers.get("x-server-secret");

    return (
        !!secret &&
        !!env.ROBLOX_SERVER_SECRET &&
        secret === env.ROBLOX_SERVER_SECRET
    );
}

/* -------------------------------------------------------
   ADMIN ACTIONS
------------------------------------------------------- */

async function adminAction(
    req,
    env,
    session,
    type
) {
    const body = await req
        .json()
        .catch(() => ({}));

    if (!body.userId) {
        return json(
            {
                error: "userId is required"
            },
            400
        );
    }

    const userId = String(body.userId);

    const player = await env.DB
        .prepare(
            "SELECT * FROM players WHERE user_id=?"
        )
        .bind(userId)
        .first();

    const targetUsername =
        body.username ||
        player?.username ||
        "Unknown";

    const requestId = id();

    try {

        /* -----------------------------
           BAN
        ----------------------------- */

        if (type === "BAN") {

            let duration = null;

            if (
                body.durationMinutes !== undefined &&
                body.durationMinutes !== null &&
                body.durationMinutes !== ""
            ) {
                duration = Math.max(
                    1,
                    Number(body.durationMinutes)
                );
            }

            const expires =
                duration === null
                    ? null
                    : now() +
                      duration * 60 * 1000;

            const reason =
                String(
                    body.reason ||
                    "No reason provided"
                );

            await env.DB.prepare(`
                INSERT INTO bans (
                    user_id,
                    username,
                    reason,
                    expires_at,
                    created_by,
                    created_at
                )
                VALUES (?, ?, ?, ?, ?, ?)
            `)
                .bind(
                    userId,
                    targetUsername,
                    reason,
                    expires,
                    session.adminId,
                    now()
                )
                .run();

            await env.DB.prepare(`
                INSERT INTO commands (
                    command_type,
                    target_user_id,
                    server_id,
                    payload_json,
                    created_by,
                    created_at
                )
                VALUES (?, ?, ?, ?, ?, ?)
            `)
                .bind(
                    "BAN",
                    userId,
                    body.serverId || null,
                    JSON.stringify({
                        reason,
                        expiresAt: expires
                    }),
                    session.adminId,
                    now()
                )
                .run();
        }

        /* -----------------------------
           UNBAN
        ----------------------------- */

        else if (type === "UNBAN") {

            await env.DB.prepare(`
                UPDATE bans
                SET
                    revoked_at=?,
                    revoked_by=?
                WHERE
                    user_id=?
                    AND revoked_at IS NULL
                    AND (
                        expires_at IS NULL
                        OR expires_at>?
                    )
            `)
                .bind(
                    now(),
                    session.adminId,
                    userId,
                    now()
                )
                .run();
        }

        /* -----------------------------
           OTHER COMMANDS
           KICK
           EDIT_STATS
           RESET_STATS
        ----------------------------- */

        else {

            await env.DB.prepare(`
                INSERT INTO commands (
                    command_type,
                    target_user_id,
                    server_id,
                    payload_json,
                    created_by,
                    created_at
                )
                VALUES (?, ?, ?, ?, ?, ?)
            `)
                .bind(
                    type,
                    userId,
                    body.serverId || null,
                    JSON.stringify(
                        body.payload || {}
                    ),
                    session.adminId,
                    now()
                )
                .run();
        }

        await audit(env, {
            adminId: session.adminId,
            adminUsername: session.username,
            action: type,
            targetUserId: userId,
            targetUsername,
            serverId: body.serverId,
            reason: body.reason,
            changedValues: body.payload,
            success: true,
            requestId
        });

        return json({
            ok: true,
            requestId
        });

    } catch (error) {

        await audit(env, {
            adminId: session.adminId,
            adminUsername: session.username,
            action: type,
            targetUserId: userId,
            targetUsername,
            serverId: body.serverId,
            reason: body.reason,
            success: false,
            error: error.message,
            requestId
        });

        return json(
            {
                error: "Action failed",
                requestId
            },
            500
        );
    }
}

/* -------------------------------------------------------
   MAIN WORKER
------------------------------------------------------- */

export default {

    async fetch(req, env) {

        const url = new URL(req.url);

        const path = url.pathname;

        const method = req.method;

        /* -----------------------------
           CORS PREFLIGHT
        ----------------------------- */

        if (method === "OPTIONS") {

            return withCors(
                new Response(null, {
                    status: 204
                }),
                env
            );
        }

        try {

            /* =================================================
               LOGIN
            ================================================= */

            if (
                path === "/api/auth/login" &&
                method === "POST"
            ) {

                const body = await req
                    .json()
                    .catch(() => ({}));

                const username =
                    String(body.username || "");

                const password =
                    String(body.password || "");

                let admin = await env.DB.prepare(
                    "SELECT * FROM admins WHERE username=?"
                ).bind(username).first();
                let credential = admin
                    ? await env.DB.prepare("SELECT * FROM admin_credentials WHERE admin_id=?").bind(admin.id).first()
                    : null;
                let valid = credential
                    ? await checkPassword(password, credential)
                    : username === env.ADMIN_USERNAME && password === env.ADMIN_PASSWORD;

                if (!valid) {
                    return withCors(
                        json(
                            {
                                error:
                                    "Invalid credentials"
                            },
                            401
                        ),
                        env
                    );
                }

                if (!admin) {

                    const result =
                        await env.DB
                            .prepare(`
                                INSERT INTO admins (
                                    username,
                                    display_name,
                                    role,
                                    created_at
                                )
                                VALUES (?, ?, ?, ?)
                            `)
                            .bind(
                                username,
                                username,
                                "admin",
                                now()
                            )
                            .run();

                    admin = {
                        id:
                            result.meta
                                .last_row_id,
                        username,
                        display_name:
                            username,
                        role: "admin"
                    };
                }

                if (!credential) {
                    const generated = await createPasswordCredential(password);
                    await env.DB.prepare(`
                        INSERT OR REPLACE INTO admin_credentials (admin_id, password_hash, password_salt, updated_at)
                        VALUES (?, ?, ?, ?)
                    `).bind(admin.id, generated.hash, generated.salt, now()).run();
                }

                const token =
                    await sign(
                        {
                            adminId: admin.id,
                            username:
                                admin.username,
                            displayName:
                                admin.display_name,
                            role:
                                admin.role,
                            exp:
                                now() +
                                8 *
                                    60 *
                                    60 *
                                    1000
                        },
                        env.SESSION_SECRET
                    );

                const response =
                    json({
                        ok: true,
                        user: {
                            id: admin.id,
                            username:
                                admin.username,
                            displayName:
                                admin.display_name,
                            role:
                                admin.role
                        }
                    });

                response.headers.set(
                    "Set-Cookie",
                    `session=${token}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=28800`
                );

                return withCors(
                    response,
                    env
                );
            }

            /* =================================================
               LOGOUT
            ================================================= */

            if (
                path === "/api/auth/logout" &&
                method === "POST"
            ) {

                const response =
                    json({
                        ok: true
                    });

                response.headers.set(
                    "Set-Cookie",
                    "session=; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=0"
                );

                return withCors(
                    response,
                    env
                );
            }

            /* =================================================
               ROBLOX API
            ================================================= */

            if (
                path.startsWith("/api/roblox/")
            ) {

                return withCors(
                    await roblox(
                        req,
                        env,
                        path,
                        method
                    ),
                    env
                );
            }

            /* =================================================
               ADMIN AUTH
            ================================================= */

            const session =
                await auth(req, env);

            if (!session) {

                return withCors(
                    json(
                        {
                            error:
                                "Unauthorized"
                        },
                        401
                    ),
                    env
                );
            }

            /* =================================================
               CURRENT ADMIN
            ================================================= */

            if (path === "/api/me") {

                const admin = await env.DB.prepare(
                    "SELECT id, username, display_name, role FROM admins WHERE id=?"
                ).bind(session.adminId).first();

                return withCors(
                    json({
                        user: admin ? {
                            id: admin.id,
                            username: admin.username,
                            displayName: admin.display_name,
                            role: admin.role
                        } : session
                    }),
                    env
                );
            }

            if (path === "/api/admin/profile" && method === "POST") {
                const body = await req.json().catch(() => ({}));
                const currentPassword = String(body.currentPassword || "");
                const username = session.username;
                const displayName = String(body.displayName || username).trim();
                const newPassword = String(body.newPassword || "");
                const credential = await env.DB.prepare(
                    "SELECT * FROM admin_credentials WHERE admin_id=?"
                ).bind(session.adminId).first();

                if (!await checkPassword(currentPassword, credential)) {
                    return withCors(json({ error: "Current password is invalid" }, 400), env);
                }

                if (newPassword && newPassword.length < 8) {
                    return withCors(json({ error: "New password must be at least 8 characters" }, 400), env);
                }

                try {
                    await env.DB.prepare(
                        "UPDATE admins SET display_name=? WHERE id=?"
                    ).bind(displayName || username, session.adminId).run();

                    if (newPassword) {
                        const generated = await createPasswordCredential(newPassword);
                        await env.DB.prepare(`
                            UPDATE admin_credentials
                            SET password_hash=?, password_salt=?, updated_at=?
                            WHERE admin_id=?
                        `).bind(generated.hash, generated.salt, now(), session.adminId).run();
                    }

                    const token = await sign({
                        adminId: session.adminId,
                        username,
                        displayName: displayName || username,
                        role: session.role,
                        exp: now() + 8 * 60 * 60 * 1000
                    }, env.SESSION_SECRET);
                    const response = json({
                        ok: true,
                        user: { id: session.adminId, username, displayName: displayName || username, role: session.role }
                    });
                    response.headers.set("Set-Cookie", `session=${token}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=28800`);
                    return withCors(response, env);
                } catch (error) {
                    return withCors(json({ error: error.message.includes("UNIQUE") ? "Username is already in use" : "Profile update failed" }, 400), env);
                }
            }

            /* =================================================
               DASHBOARD
            ================================================= */

            if (
                path === "/api/dashboard"
            ) {

                const [
                    activePlayers,
                    players,
                    servers,
                    bans,
                    recentAudit
                ] =
                    await Promise.all([

                        env.DB
                            .prepare(`
                                SELECT COUNT(*) AS c
                                FROM active_sessions
                                WHERE last_heartbeat_at > ?
                            `)
                            .bind(
                                now() - ACTIVE_SESSION_TTL
                            )
                            .first(),

                        env.DB
                            .prepare(`
                                SELECT COUNT(*) AS c
                                FROM players
                            `)
                            .first(),

                        env.DB
                            .prepare(`
                                SELECT COUNT(*) AS c
                                FROM servers
                                WHERE last_heartbeat_at > ?
                                AND player_count > 0
                            `)
                            .bind(
                                now() - SERVER_TTL
                            )
                            .first(),

                        env.DB
                            .prepare(`
                                SELECT COUNT(*) AS c
                                FROM bans
                                WHERE revoked_at IS NULL
                                AND (
                                    expires_at IS NULL
                                    OR expires_at > ?
                                )
                            `)
                            .bind(now())
                            .first(),

                        env.DB
                            .prepare(`
                                SELECT *
                                FROM audit_logs
                                ORDER BY id DESC
                                LIMIT 10
                            `)
                            .all()
                    ]);

                return withCors(
                    json({
                        activePlayers:
                            activePlayers?.c || 0,

                        players:
                            players?.c || 0,

                        servers:
                            servers?.c || 0,

                        bans:
                            bans?.c || 0,

                        recentAudit:
                            recentAudit.results || []
                    }),
                    env
                );
            }

            /* =================================================
               ACTIVE PLAYERS
            ================================================= */

            if (
                path === "/api/active"
            ) {

                const result =
                    await env.DB
                        .prepare(`
                            SELECT *
                            FROM active_sessions
                            WHERE last_heartbeat_at > ?
                            ORDER BY username
                        `)
                        .bind(
                            now() - ACTIVE_SESSION_TTL
                        )
                        .all();

                return withCors(
                    json(
                        result.results || []
                    ),
                    env
                );
            }

            /* =================================================
               PLAYER SEARCH
            ================================================= */

            if (
                path === "/api/players"
            ) {

                const q =
                    url.searchParams.get(
                        "q"
                    ) || "";

                const result =
                    await env.DB
                        .prepare(`
                            SELECT *
                            FROM players
                            WHERE user_id LIKE ?
                            OR username LIKE ?
                            ORDER BY updated_at DESC
                            LIMIT 100
                        `)
                        .bind(
                            `%${q}%`,
                            `%${q}%`
                        )
                        .all();

                return withCors(
                    json(
                        result.results || []
                    ),
                    env
                );
            }

            /* =================================================
               INDIVIDUAL PLAYER
            ================================================= */

            if (
                path.startsWith(
                    "/api/players/"
                )
            ) {

                const uid =
                    decodeURIComponent(
                        path
                            .split("/")
                            .pop()
                    );

                const player =
                    await env.DB
                        .prepare(`
                            SELECT *
                            FROM players
                            WHERE user_id=?
                        `)
                        .bind(uid)
                        .first();

                if (!player) {

                    return withCors(
                        json(
                            {
                                error:
                                    "Player not found"
                            },
                            404
                        ),
                        env
                    );
                }

                const bans =
                    await env.DB
                        .prepare(`
                            SELECT *
                            FROM bans
                            WHERE user_id=?
                            ORDER BY id DESC
                        `)
                        .bind(uid)
                        .all();

                let stats = {};

                try {
                    stats =
                        JSON.parse(
                            player.stats_json ||
                            "{}"
                        );
                } catch {
                    stats = {};
                }

                return withCors(
                    json({
                        ...player,
                        stats,
                        bans:
                            bans.results || []
                    }),
                    env
                );
            }

            /* =================================================
               SERVERS
            ================================================= */

            if (
                path === "/api/servers"
            ) {

                await env.DB
                    .prepare(`
                        DELETE FROM servers
                        WHERE last_heartbeat_at <= ?
                        OR player_count <= 0
                    `)
                    .bind(now() - SERVER_TTL)
                    .run();

                const result =
                    await env.DB
                        .prepare(`
                            SELECT *
                            FROM servers
                            WHERE last_heartbeat_at > ?
                            AND player_count > 0
                            ORDER BY last_heartbeat_at DESC
                        `)
                        .bind(now() - SERVER_TTL)
                        .all();

                return withCors(
                    json(
                        result.results || []
                    ),
                    env
                );
            }

            /* =================================================
               BANS
            ================================================= */

            if (
                path === "/api/bans"
            ) {

                const result =
                    await env.DB
                        .prepare(`
                            SELECT *
                            FROM bans
                            ORDER BY id DESC
                            LIMIT 200
                        `)
                        .all();

                return withCors(
                    json(
                        result.results || []
                    ),
                    env
                );
            }

            /* =================================================
               AUDIT LOGS
            ================================================= */

            if (
                path === "/api/audit-logs"
            ) {

                const q =
                    url.searchParams.get(
                        "q"
                    ) || "";

                const result =
                    await env.DB
                        .prepare(`
                            SELECT *
                            FROM audit_logs
                            WHERE admin_username LIKE ?
                            OR target_username LIKE ?
                            OR target_user_id LIKE ?
                            OR action LIKE ?
                            ORDER BY id DESC
                            LIMIT ?
                        `)
                        .bind(
                            `%${q}%`,
                            `%${q}%`,
                            `%${q}%`,
                            `%${q}%`,
                            AUDIT_LOG_LIMIT
                        )
                        .all();

                return withCors(
                    json(
                        result.results || []
                    ),
                    env
                );
            }

            /* =================================================
               ADMIN: KICK
            ================================================= */

            if (
                path === "/api/admin/kick" &&
                method === "POST"
            ) {

                return withCors(
                    await adminAction(
                        req,
                        env,
                        session,
                        "KICK"
                    ),
                    env
                );
            }

            /* =================================================
               ADMIN: BAN
            ================================================= */

            if (
                path === "/api/admin/ban" &&
                method === "POST"
            ) {

                return withCors(
                    await adminAction(
                        req,
                        env,
                        session,
                        "BAN"
                    ),
                    env
                );
            }

            /* =================================================
               ADMIN: UNBAN
            ================================================= */

            if (
                path === "/api/admin/unban" &&
                method === "POST"
            ) {

                return withCors(
                    await adminAction(
                        req,
                        env,
                        session,
                        "UNBAN"
                    ),
                    env
                );
            }

            /* =================================================
               ADMIN: EDIT STATS
            ================================================= */

            if (
                path ===
                    "/api/admin/stats/edit" &&
                method === "POST"
            ) {

                return withCors(
                    await adminAction(
                        req,
                        env,
                        session,
                        "EDIT_STATS"
                    ),
                    env
                );
            }

            /* =================================================
               ADMIN: RESET STATS
            ================================================= */

            if (
                path ===
                    "/api/admin/stats/reset" &&
                method === "POST"
            ) {

                return withCors(
                    await adminAction(
                        req,
                        env,
                        session,
                        "RESET_STATS"
                    ),
                    env
                );
            }

            return withCors(
                json(
                    {
                        error:
                            "Not found"
                    },
                    404
                ),
                env
            );

        } catch (error) {

            console.error(
                "Worker error:",
                error
            );

            return withCors(
                json(
                    {
                        error:
                            error?.message ||
                            "Server error"
                    },
                    500
                ),
                env
            );
        }
    }
};

/* =========================================================
   ROBLOX API
========================================================= */

async function roblox(
    req,
    env,
    path,
    method
) {

    if (
        !requireServer(
            req,
            env
        )
    ) {

        return json(
            {
                error:
                    "Unauthorized"
            },
            401
        );
    }

    const body =
        method === "POST"
            ? await req
                  .json()
                  .catch(() => ({}))
            : {};

    /* =====================================================
       SERVER HEARTBEAT
    ===================================================== */

    if (
        path ===
        "/api/roblox/heartbeat"
    ) {

        if (!body.serverId) {

            return json(
                {
                    error:
                        "serverId is required"
                },
                400
            );
        }

        const playerCount = Math.max(0, Number(body.playerCount || 0));

        if (playerCount === 0) {
            await env.DB
                .prepare("DELETE FROM servers WHERE server_id=?")
                .bind(body.serverId)
                .run();

            return json({
                ok: true,
                removed: true
            });
        }

        await env.DB.prepare(`
            INSERT INTO servers (
                server_id,
                job_id,
                player_count,
                max_players,
                last_heartbeat_at,
                updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?)

            ON CONFLICT(server_id)
            DO UPDATE SET
                job_id=excluded.job_id,
                player_count=excluded.player_count,
                max_players=excluded.max_players,
                last_heartbeat_at=excluded.last_heartbeat_at,
                updated_at=excluded.updated_at
        `)
            .bind(
                body.serverId,
                body.jobId || null,
                playerCount,
                Number(
                    body.maxPlayers || 0
                ),
                now(),
                now()
            )
            .run();

        return json({
            ok: true
        });
    }

    /* =====================================================
       PLAYER JOIN
    ===================================================== */

    if (
        path ===
        "/api/roblox/player-join"
    ) {

        if (!body.userId) {

            return json(
                {
                    error:
                        "userId is required"
                },
                400
            );
        }

        const userId =
            String(body.userId);

        await env.DB.prepare(`
            INSERT INTO players (
                user_id,
                username,
                display_name,
                last_seen_at,
                last_server_id,
                stats_json,
                created_at,
                updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)

            ON CONFLICT(user_id)
            DO UPDATE SET
                username=excluded.username,
                display_name=excluded.display_name,
                last_seen_at=excluded.last_seen_at,
                last_server_id=excluded.last_server_id,
                stats_json=excluded.stats_json,
                updated_at=excluded.updated_at
        `)
            .bind(
                userId,
                body.username ||
                    "Unknown",
                body.displayName ||
                    body.username ||
                    "Unknown",
                now(),
                body.serverId || null,
                JSON.stringify(
                    body.stats || {}
                ),
                now(),
                now()
            )
            .run();

        await env.DB.prepare(`
            INSERT INTO active_sessions (
                user_id,
                username,
                server_id,
                state,
                joined_at,
                last_heartbeat_at,
                metadata_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)

            ON CONFLICT(user_id)
            DO UPDATE SET
                username=excluded.username,
                server_id=excluded.server_id,
                state=excluded.state,
                last_heartbeat_at=excluded.last_heartbeat_at,
                metadata_json=excluded.metadata_json
        `)
            .bind(
                userId,
                body.username ||
                    "Unknown",
                body.serverId || null,
                body.state ||
                    "Playing",
                now(),
                now(),
                JSON.stringify(
                    body.metadata || {}
                )
            )
            .run();

        return json({
            ok: true
        });
    }

    /* =====================================================
       PLAYER LEAVE
    ===================================================== */

    if (
        path ===
        "/api/roblox/player-leave"
    ) {

        if (!body.userId) {

            return json(
                {
                    error:
                        "userId is required"
                },
                400
            );
        }

        await env.DB.prepare(`
            DELETE FROM active_sessions
            WHERE user_id=?
        `)
            .bind(
                String(body.userId)
            )
            .run();

        return json({
            ok: true
        });
    }

    /* =====================================================
       PLAYER STATS
    ===================================================== */

    if (
        path ===
        "/api/roblox/player-stats"
    ) {

        if (!body.userId) {

            return json(
                {
                    error:
                        "userId is required"
                },
                400
            );
        }

        await env.DB.prepare(`
            UPDATE players
            SET
                username=?,
                display_name=?,
                last_seen_at=?,
                last_server_id=?,
                stats_json=?,
                updated_at=?
            WHERE user_id=?
        `)
            .bind(
                body.username ||
                    "Unknown",
                body.displayName ||
                    body.username ||
                    "Unknown",
                now(),
                body.serverId || null,
                JSON.stringify(
                    body.stats || {}
                ),
                now(),
                String(body.userId)
            )
            .run();

        await env.DB.prepare(`
            INSERT INTO active_sessions (
                user_id,
                username,
                server_id,
                state,
                joined_at,
                last_heartbeat_at,
                metadata_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id)
            DO UPDATE SET
                username=excluded.username,
                server_id=excluded.server_id,
                state=excluded.state,
                last_heartbeat_at=excluded.last_heartbeat_at
        `)
            .bind(
                String(body.userId),
                body.username || "Unknown",
                body.serverId || "Unknown",
                body.state || "Playing",
                now(),
                now(),
                JSON.stringify(body.metadata || {})
            )
            .run();

        return json({
            ok: true
        });
    }

    /* =====================================================
       BAN CHECK
    ===================================================== */

    if (
        path.startsWith(
            "/api/roblox/ban-check/"
        )
    ) {

        const uid =
            decodeURIComponent(
                path.split("/").pop()
            );

        const ban =
            await env.DB
                .prepare(`
                    SELECT *
                    FROM bans
                    WHERE user_id=?
                    AND revoked_at IS NULL
                    AND (
                        expires_at IS NULL
                        OR expires_at>?
                    )
                    ORDER BY id DESC
                    LIMIT 1
                `)
                .bind(
                    uid,
                    now()
                )
                .first();

        return json({
            banned: !!ban,
            ban: ban || null
        });
    }

    /* =====================================================
       COMMAND POLLING
    ===================================================== */

    if (
        path ===
            "/api/roblox/commands" &&
        method === "GET"
    ) {

        const serverId =
            new URL(req.url)
                .searchParams
                .get("serverId");

        if (!serverId) {

            return json(
                {
                    error:
                        "serverId is required"
                },
                400
            );
        }

        const result =
            await env.DB
                .prepare(`
                    SELECT *
                    FROM commands
                    WHERE status='pending'
                    AND (
                        server_id=?
                        OR server_id IS NULL
                    )
                    ORDER BY id
                    LIMIT 25
                `)
                .bind(serverId)
                .all();

        const commands = [];

        for (
            const command of
            result.results || []
        ) {

            const claimed =
                await env.DB
                    .prepare(`
                        UPDATE commands
                        SET
                            status='claimed',
                            claimed_at=?
                        WHERE
                            id=?
                            AND status='pending'
                    `)
                    .bind(
                        now(),
                        command.id
                    )
                    .run();

            if (
                claimed.meta
                    .changes > 0
            ) {

                let payload = {};

                try {
                    payload =
                        JSON.parse(
                            command.payload_json ||
                            "{}"
                        );
                } catch {
                    payload = {};
                }

                commands.push({
                    ...command,
                    payload
                });
            }
        }

        return json({
            commands
        });
    }

    /* =====================================================
       COMMAND ACKNOWLEDGEMENT
    ===================================================== */

    if (
        /^\/api\/roblox\/commands\/\d+\/ack$/.test(
            path
        ) &&
        method === "POST"
    ) {

        const parts =
            path.split("/");

        const commandId =
            parts[4];

        await env.DB.prepare(`
            UPDATE commands
            SET
                status=?,
                completed_at=?,
                result_json=?
            WHERE id=?
        `)
            .bind(
                body.success
                    ? "completed"
                    : "failed",
                now(),
                JSON.stringify(
                    body.result || {}
                ),
                commandId
            )
            .run();

        return json({
            ok: true
        });
    }

    return json(
        {
            error:
                "Not found"
        },
        404
    );
}