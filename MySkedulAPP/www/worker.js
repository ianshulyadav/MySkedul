/**
 * MySkedul — Unified Production Cloudflare Worker (V2 - Short IDs)
 * ================================================
 * KV Binding: "SKEDUL_KV"
 * Secret:     "ADMIN_PASSWORD"
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const ADMIN_SESSION_TTL_SECONDS = 12 * 60 * 60;
const DAY_SET = new Set(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
const TIME_RE = /^\d{2}:\d{2}$/;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function err(msg, status = 400) {
  return json({ error: msg }, status);
}

function clientKey(request) {
  return request.headers.get("CF-Connecting-IP")
    || request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim()
    || "unknown";
}

async function checkRateLimit(request, env, bucket, limit, windowSecs) {
  const key = `RL:${bucket}:${clientKey(request)}:${Math.floor(Date.now() / (windowSecs * 1000))}`;
  const current = parseInt(await env.SKEDUL_KV.get(key) || "0", 10);
  if (current >= limit) {
    return json({ error: "Rate limit exceeded", retryAfter: windowSecs }, 429);
  }
  await env.SKEDUL_KV.put(key, String(current + 1), { expirationTtl: windowSecs + 30 });
  return null;
}

function genCode() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  for (const b of bytes) code += chars[b % chars.length];
  return code;
}

function genAdminToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let raw = "";
  for (const b of bytes) raw += String.fromCharCode(b);
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256Hex(value) {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function requireAdmin(request, env) {
  const auth = request.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return err("Admin authorization required", 401);

  const token = auth.slice(7).trim();
  if (!token) return err("Admin authorization required", 401);

  const tokenHash = await sha256Hex(token);
  const session = await env.SKEDUL_KV.get(`ADMIN_SESSION:${tokenHash}`);
  if (!session) return err("Admin session expired", 401);

  return null;
}

// Optimized code generation with BARE keys (no prefix in KV)
async function uniqueCode(env) {
  for (let i = 0; i < 15; i++) {
    const candidate = genCode();
    const existing = await env.SKEDUL_KV.get(candidate);
    if (!existing) return candidate;
  }
  throw new Error("Code generation conflict. Please retry.");
}

function shortBranch(branch) {
  const map = { "CSE-AI": "CSAI", "CSE-DS": "CSDS", "CSE-IT": "CSIT", "CSE": "CSE", "UNI": "UNI" };
  return map[branch?.toUpperCase()] || branch?.replace(/[^A-Z0-9]/gi, "").toUpperCase() || "UNK";
}

function timeToMins(time) {
  if (!TIME_RE.test(String(time || ""))) return NaN;
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function validateDistributionPayload(body) {
  if (!body || typeof body !== "object") throw new Error("Invalid JSON payload");
  const year = parseInt(body.year);
  if (!Number.isInteger(year) || year < 1 || year > 6) throw new Error("Invalid year");
  if (typeof body.branch !== "string" || !body.branch.trim()) throw new Error("Invalid branch");
  if (!body.sections || typeof body.sections !== "object" || Array.isArray(body.sections)) throw new Error("Invalid sections");

  const sectionEntries = Object.entries(body.sections);
  if (!sectionEntries.length) throw new Error("No sections found");

  for (const [sectionName, sectionData] of sectionEntries) {
    if (!sectionData || typeof sectionData !== "object" || !sectionData.groups || typeof sectionData.groups !== "object" || Array.isArray(sectionData.groups)) {
      throw new Error(`Section ${sectionName} is missing groups`);
    }

    const groupEntries = Object.entries(sectionData.groups);
    if (!groupEntries.length) throw new Error(`Section ${sectionName} has no groups`);

    for (const [groupName, groupData] of groupEntries) {
      const classes = Array.isArray(groupData) ? groupData : groupData?.classes;
      if (!Array.isArray(classes) || classes.length === 0) throw new Error(`${sectionName}/${groupName} has no classes`);

      classes.forEach((cls, idx) => {
        if (!cls || typeof cls !== "object") throw new Error(`${sectionName}/${groupName} class ${idx + 1} is invalid`);
        const start = cls.start || cls.startTime;
        const end = cls.end || cls.endTime;
        const startMins = timeToMins(start);
        const endMins = timeToMins(end);
        if (!Number.isFinite(startMins) || !Number.isFinite(endMins) || startMins >= endMins) {
          throw new Error(`${sectionName}/${groupName} class ${idx + 1} has invalid time`);
        }
        if (!Array.isArray(cls.days) || !cls.days.length || cls.days.some(d => !DAY_SET.has(d))) {
          throw new Error(`${sectionName}/${groupName} class ${idx + 1} has invalid days`);
        }
      });
    }
  }
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    const url = new URL(request.url);
    const path = url.pathname;
    const segments = path.split("/").filter(Boolean);

    try {
      // --- ROUTE: POST /admin/login (Admin Auth) ---
      if (segments[0] === "admin" && segments[1] === "login" && request.method === "POST") {
        const limited = await checkRateLimit(request, env, "admin-login", 10, 900);
        if (limited) return limited;

        if (!env.ADMIN_PASSWORD) return err("Admin password is not configured", 500);

        const body = await request.json().catch(() => null);
        if (!body || typeof body.password !== "string") return err("Password required", 400);
        if (body.password !== env.ADMIN_PASSWORD) return err("Invalid admin password", 401);

        const token = genAdminToken();
        const tokenHash = await sha256Hex(token);
        const expiresAt = Date.now() + ADMIN_SESSION_TTL_SECONDS * 1000;

        await env.SKEDUL_KV.put(
          `ADMIN_SESSION:${tokenHash}`,
          JSON.stringify({ createdAt: Date.now(), expiresAt }),
          { expirationTtl: ADMIN_SESSION_TTL_SECONDS }
        );

        return json({ token, expiresAt });
      }

      // --- ROUTE: POST /admin/logout (Admin Auth) ---
      if (segments[0] === "admin" && segments[1] === "logout" && request.method === "POST") {
        const adminError = await requireAdmin(request, env);
        if (adminError) return adminError;

        const token = (request.headers.get("Authorization") || "").slice(7).trim();
        const tokenHash = await sha256Hex(token);
        await env.SKEDUL_KV.delete(`ADMIN_SESSION:${tokenHash}`);

        return json({ success: true });
      }

      // --- ROUTE: POST /upload-bulk (Admin Distribution) ---
      if (segments[0] === "upload-bulk" && request.method === "POST") {
        const adminError = await requireAdmin(request, env);
        if (adminError) return adminError;
        const limited = await checkRateLimit(request, env, "upload-bulk", 30, 3600);
        if (limited) return limited;

        const body = await request.json().catch(() => null);
        if (!body || !body.sections) return err("Invalid data structure");
        try { validateDistributionPayload(body); } catch (e) { return err(e.message, 400); }

        const year = parseInt(body.year);
        const bShort = shortBranch(body.branch);
        let manifest = [];
        const existingRaw = await env.SKEDUL_KV.get("GROUPS_DB");
        if (existingRaw) try { manifest = JSON.parse(existingRaw); } catch {}

        const newEntries = [];
        for (const secKey of Object.keys(body.sections)) {
          const secData = body.sections[secKey];
          if (!secData?.groups) continue;
          
          const sectionIdent = `${year}${bShort}-${secKey}`;

          for (const gId of Object.keys(secData.groups)) {
            const timetable = secData.groups[gId];
            const formatId = `${sectionIdent}-${gId}`;
            
            const existingEntry = manifest.find(g => g.formatId === formatId);
            if (existingEntry && existingEntry.code) {
               const oldBare = existingEntry.code.replace('SCH-', '').replace('S-', '');
               await env.SKEDUL_KV.delete(oldBare);
               await env.SKEDUL_KV.delete(existingEntry.code);
               await env.SKEDUL_KV.delete(`SCHEDULE_${existingEntry.code}`);
            }

            const codeBare = await uniqueCode(env);
            await env.SKEDUL_KV.put(codeBare, JSON.stringify(timetable));

            const userVisibleCode = `SCH-${codeBare}`;
            manifest = manifest.filter(g => g.formatId !== formatId);
            manifest.push({ 
              year, 
              branch: body.branch, 
              sectionIdent, 
              section: secKey, 
              group: gId, 
              formatId, 
              code: userVisibleCode, 
              fullName: `${sectionIdent} • ${gId}`,
              updatedAt: new Date().toISOString()
            });

            // Trigger push notifications
            const subKey = `SUB_TOKENS:${formatId}`;
            const subRaw = await env.SKEDUL_KV.get(subKey);
            if (subRaw) {
              try {
                const tokens = JSON.parse(subRaw);
                await sendFcmPush(env, tokens, { formatId, code: userVisibleCode, timetable });
              } catch (e) {
                console.error("[FCM Trigger Error]", e);
              }
            }

            newEntries.push({ formatId, code: userVisibleCode });
          }
        }
        await env.SKEDUL_KV.put("GROUPS_DB", JSON.stringify(manifest));
        return json({ success: true, distributed: newEntries.length });
      }

      // --- ROUTE: GET /groups (Manifest Fetching) ---
      if (segments[0] === "groups" && request.method === "GET") {
        const raw = await env.SKEDUL_KV.get("GROUPS_DB");
        return new Response(raw || "[]", { headers: { ...CORS, "Content-Type": "application/json" } });
      }

      // --- ROUTE: GET /get/:code (Smart Fetching) ---
      if ((segments[0] === "get" || segments[0] === "schedule") && segments[1]) {
        const limited = await checkRateLimit(request, env, "get-code", 120, 60);
        if (limited) return limited;

        const input = segments[1].toUpperCase();
        
        let bare = input;
        if (input.startsWith("SCH-")) bare = input.slice(4);
        else if (input.startsWith("S-")) bare = input.slice(2);
        
        let data = await env.SKEDUL_KV.get(bare);
        if (!data) data = await env.SKEDUL_KV.get(`SCH-${bare}`);
        if (!data) data = await env.SKEDUL_KV.get(`S-${bare}`);
        if (!data) data = await env.SKEDUL_KV.get(`SCHEDULE_SCH-${bare}`);

        if (!data) return err("Schedule not found", 404);

        const parsed = JSON.parse(data);

        if (!Array.isArray(parsed) && (parsed.classes || parsed.subjects)) {
           return json(parsed); 
        }

        const timetable = Array.isArray(parsed) ? parsed : (parsed.data || parsed.timetable || []);
        return json({ data: timetable });
      }

      // --- ROUTE: POST /share (Legacy Quick-Share) ---
      if (segments[0] === "share" && request.method === "POST") {
        const limited = await checkRateLimit(request, env, "share", 20, 3600);
        if (limited) return limited;

        const body = await request.json().catch(() => null);
        if (!body?.data) return err("No data");
        
        const codeBare = await uniqueCode(env);
        await env.SKEDUL_KV.put(codeBare, JSON.stringify(body.data), { expirationTtl: 2592000 });
        
        return json({ id: `SCH-${codeBare}` });
      }

      // --- ROUTE: POST /backup (Admin Snapshot) ---
      if (segments[0] === "backup" && request.method === "POST") {
        const adminError = await requireAdmin(request, env);
        if (adminError) return adminError;
        const limited = await checkRateLimit(request, env, "backup-write", 60, 3600);
        if (limited) return limited;

        const body = await request.json().catch(() => null);
        if (!body || !body.sectionIdent || !body.title || !body.data) return err("Missing backup fields");

        let history = [];
        const existingHistRaw = await env.SKEDUL_KV.get("HISTORY_DB");
        if (existingHistRaw) try { history = JSON.parse(existingHistRaw); } catch {}

        let existing = history.find(h => h.sectionIdent === body.sectionIdent && h.title === body.title);
        
        const codeBare = existing ? existing.code.replace('SCH-', '') : await uniqueCode(env);
        await env.SKEDUL_KV.put(codeBare, JSON.stringify(body.data));

        if (existing) {
          existing.updatedAt = new Date().toISOString();
        } else {
          history.push({
            sectionIdent: body.sectionIdent,
            title: body.title,
            code: `SCH-${codeBare}`,
            updatedAt: new Date().toISOString()
          });
        }

        await env.SKEDUL_KV.put("HISTORY_DB", JSON.stringify(history));
        return json({ success: true, code: `SCH-${codeBare}` });
      }

      // --- ROUTE: GET /history/:sectionIdent ---
      if (segments[0] === "history" && segments[1]) {
        const sIdent = segments[1];
        const raw = await env.SKEDUL_KV.get("HISTORY_DB");
        if (!raw) return json([]);
        const history = JSON.parse(raw);
        const filtered = history.filter(h => h.sectionIdent === sIdent);
        return json(filtered);
      }

      // --- ROUTE: DELETE /backup/:code (Admin Only) ---
      if (segments[0] === "backup" && segments[1] && request.method === "DELETE") {
        const adminError = await requireAdmin(request, env);
        if (adminError) return adminError;
        const limited = await checkRateLimit(request, env, "backup-delete", 60, 3600);
        if (limited) return limited;

        let history = [];
        const raw = await env.SKEDUL_KV.get("HISTORY_DB");
        if (raw) history = JSON.parse(raw);

        const code = segments[1];
        const bare = code.replace('SCH-', '');
        
        await env.SKEDUL_KV.delete(bare);
        history = history.filter(h => h.code !== code);
        
        await env.SKEDUL_KV.put("HISTORY_DB", JSON.stringify(history));
        return json({ success: true });
      }

      // --- NEW ROUTES FOR ADMIN TOOLS, FEEDBACK, SUGGESTIONS & ANALYTICS ---

      // 1. Analytics Ping
      if (segments[0] === "analytics" && segments[1] === "ping" && request.method === "POST") {
        const body = await request.json().catch(() => null);
        if (!body || !body.deviceId) return err("Device ID required", 400);
        await env.SKEDUL_KV.put(`DEVICE_ACTIVE:${body.deviceId}`, "1", { expirationTtl: 604800 }); // 7 days
        return json({ success: true });
      }

      // 2. Get Analytics (Admin Only)
      if (segments[0] === "admin" && segments[1] === "analytics" && request.method === "GET") {
        const adminError = await requireAdmin(request, env);
        if (adminError) return adminError;
        
        let keysCount = 0;
        let list = await env.SKEDUL_KV.list({ prefix: "DEVICE_ACTIVE:" });
        keysCount += list.keys.length;
        while (!list.list_complete) {
          list = await env.SKEDUL_KV.list({ prefix: "DEVICE_ACTIVE:", cursor: list.cursor });
          keysCount += list.keys.length;
        }
        return json({ activeUsers7Days: keysCount });
      }

      // 3. Subscribe Device FCM Token to formatId
      if (segments[0] === "subscribe" && request.method === "POST") {
        const body = await request.json().catch(() => null);
        if (!body || !body.formatId || !body.token) return err("formatId and token required", 400);
        
        const key = `SUB_TOKENS:${body.formatId}`;
        let tokens = [];
        const existing = await env.SKEDUL_KV.get(key);
        if (existing) {
          try { tokens = JSON.parse(existing); } catch {}
        }
        if (!tokens.includes(body.token)) {
          tokens.push(body.token);
          await env.SKEDUL_KV.put(key, JSON.stringify(tokens));
        }
        return json({ success: true });
      }

      // 4. Submit User Feedback (with 6-hour cooldown)
      if (segments[0] === "feedback" && segments[1] === "submit" && request.method === "POST") {
        const body = await request.json().catch(() => null);
        if (!body || !body.text || !body.deviceId) return err("Feedback text and deviceId required", 400);
        
        // 6-hour cooldown check (21600 seconds)
        const cooldownKey = `FEEDBACK_COOLDOWN:${body.deviceId}`;
        const hasCooldown = await env.SKEDUL_KV.get(cooldownKey);
        if (hasCooldown) {
          return err("6-hour cooldown active. Please wait before submitting feedback again.", 429);
        }

        const name = (body.name && body.name.trim()) ? body.name.trim() : "Anonymous";
        const newFeedback = {
          id: crypto.randomUUID ? crypto.randomUUID() : genAdminToken(),
          name,
          text: body.text,
          timestamp: new Date().toISOString()
        };
        
        let feedbacks = [];
        const existing = await env.SKEDUL_KV.get("FEEDBACK_DB");
        if (existing) {
          try { feedbacks = JSON.parse(existing); } catch {}
        }
        feedbacks.push(newFeedback);
        await env.SKEDUL_KV.put("FEEDBACK_DB", JSON.stringify(feedbacks));
        await env.SKEDUL_KV.put(cooldownKey, "1", { expirationTtl: 21600 }); // 6 hours
        
        return json({ success: true });
      }

      // 5. Get Feedbacks (Admin Only)
      if (segments[0] === "admin" && segments[1] === "feedbacks" && request.method === "GET") {
        const adminError = await requireAdmin(request, env);
        if (adminError) return adminError;
        
        const existing = await env.SKEDUL_KV.get("FEEDBACK_DB");
        let feedbacks = [];
        if (existing) {
          try { feedbacks = JSON.parse(existing); } catch {}
        }
        feedbacks.reverse();
        return json(feedbacks);
      }

      // GET Suggestions Config (Abuse prevention toggle status)
      if (segments[0] === "suggestions" && segments[1] === "config" && request.method === "GET") {
        const disabled = await env.SKEDUL_KV.get("CONFIG:SUGGESTIONS_DISABLED") === "1";
        return json({ suggestionsDisabled: disabled });
      }

      // POST Set Suggestions Config (Admin Only)
      if (segments[0] === "admin" && segments[1] === "config" && request.method === "POST") {
        const adminError = await requireAdmin(request, env);
        if (adminError) return adminError;
        
        const body = await request.json().catch(() => null);
        if (!body || typeof body.suggestionsDisabled !== "boolean") return err("suggestionsDisabled boolean required", 400);
        
        await env.SKEDUL_KV.put("CONFIG:SUGGESTIONS_DISABLED", body.suggestionsDisabled ? "1" : "0");
        return json({ success: true, suggestionsDisabled: body.suggestionsDisabled });
      }

      // 6. Get Suggestions Board
      if (segments[0] === "suggestions" && request.method === "GET") {
        const existing = await env.SKEDUL_KV.get("SUGGESTIONS_DB");
        let suggestions = [];
        if (existing) {
          try { suggestions = JSON.parse(existing); } catch {}
        }
        // Score sorting
        suggestions.sort((a, b) => (b.score || (b.upvotes || 0) - (b.downvotes || 0)) - (a.score || (a.upvotes || 0) - (a.downvotes || 0)));
        return json(suggestions);
      }

      // 7. Submit Suggestion (with 6-hour cooldown and admin enable/disable control toggle)
      if (segments[0] === "suggestions" && segments[1] === "submit" && request.method === "POST") {
        // Admin toggle check
        const disabled = await env.SKEDUL_KV.get("CONFIG:SUGGESTIONS_DISABLED") === "1";
        if (disabled) {
          return err("Posting suggestions is currently disabled by administrator.", 403);
        }

        const body = await request.json().catch(() => null);
        if (!body || !body.text || !body.deviceId) return err("text and deviceId required", 400);
        
        // 6-hour cooldown check (21600 seconds)
        const cooldownKey = `SUGGESTION_COOLDOWN:${body.deviceId}`;
        const hasCooldown = await env.SKEDUL_KV.get(cooldownKey);
        if (hasCooldown) {
          return err("6-hour cooldown active. Please wait before suggesting again.", 429);
        }
        
        const name = (body.name && body.name.trim()) ? body.name.trim() : "Anonymous";
        const newSuggestion = {
          id: body.id || (crypto.randomUUID ? crypto.randomUUID() : genAdminToken()),
          name,
          text: body.text,
          upvotes: 1,
          downvotes: 0,
          score: 1,
          timestamp: new Date().toISOString(),
          comments: []
        };
        
        let suggestions = [];
        const existing = await env.SKEDUL_KV.get("SUGGESTIONS_DB");
        if (existing) {
          try { suggestions = JSON.parse(existing); } catch {}
        }
        suggestions.push(newSuggestion);
        await env.SKEDUL_KV.put("SUGGESTIONS_DB", JSON.stringify(suggestions));
        await env.SKEDUL_KV.put(cooldownKey, "1", { expirationTtl: 21600 }); // 6 hours
        await env.SKEDUL_KV.put(`VOTE_LOCKED:${newSuggestion.id}:${body.deviceId}`, "1"); // Locked as upvoted
        
        return json({ success: true, suggestion: newSuggestion });
      }

      // 8. Vote/Upvote/Downvote Suggestion
      if (segments[0] === "suggestions" && segments[1] === "vote" && request.method === "POST") {
        const body = await request.json().catch(() => null);
        if (!body || !body.id || !body.deviceId || typeof body.direction !== "number") return err("id, direction, and deviceId required", 400);
        
        const dir = body.direction; // 1, -1, or 0
        const lockKey = `VOTE_LOCKED:${body.id}:${body.deviceId}`;
        const previousVote = parseInt(await env.SKEDUL_KV.get(lockKey) || "0", 10);
        
        if (previousVote === dir) {
          return json({ success: true, message: "No change" });
        }
        
        let suggestions = [];
        const existing = await env.SKEDUL_KV.get("SUGGESTIONS_DB");
        if (existing) {
          try { suggestions = JSON.parse(existing); } catch {}
        }
        
        const sug = suggestions.find(s => s.id === body.id);
        if (!sug) return err("Suggestion not found", 404);
        
        sug.upvotes = sug.upvotes || 0;
        sug.downvotes = sug.downvotes || 0;

        // Undo previous vote
        if (previousVote === 1) sug.upvotes--;
        else if (previousVote === -1) sug.downvotes--;

        // Apply new vote
        if (dir === 1) sug.upvotes++;
        else if (dir === -1) sug.downvotes++;

        sug.score = sug.upvotes - sug.downvotes;
        
        await env.SKEDUL_KV.put("SUGGESTIONS_DB", JSON.stringify(suggestions));
        if (dir === 0) {
          await env.SKEDUL_KV.delete(lockKey);
        } else {
          await env.SKEDUL_KV.put(lockKey, String(dir));
        }
        
        return json({ success: true, score: sug.score });
      }

      // Add Comment to Suggestion Thread (with 6-hour cooldown)
      if (segments[0] === "suggestions" && segments[1] === "comment" && request.method === "POST") {
        const body = await request.json().catch(() => null);
        if (!body || !body.id || !body.text || !body.deviceId) return err("id, text, and deviceId required", 400);
        
        // 6-hour comment cooldown check
        const cooldownKey = `COMMENT_COOLDOWN:${body.deviceId}`;
        const hasCooldown = await env.SKEDUL_KV.get(cooldownKey);
        if (hasCooldown) {
          return err("6-hour cooldown active. Please wait before commenting again.", 429);
        }

        let suggestions = [];
        const existing = await env.SKEDUL_KV.get("SUGGESTIONS_DB");
        if (existing) {
          try { suggestions = JSON.parse(existing); } catch {}
        }
        
        const sug = suggestions.find(s => s.id === body.id);
        if (!sug) return err("Suggestion not found", 404);
        
        if (!sug.comments) sug.comments = [];
        sug.comments.push({
          name: (body.name && body.name.trim()) ? body.name.trim() : "Anonymous",
          text: body.text,
          timestamp: new Date().toISOString()
        });
        
        await env.SKEDUL_KV.put("SUGGESTIONS_DB", JSON.stringify(suggestions));
        await env.SKEDUL_KV.put(cooldownKey, "1", { expirationTtl: 21600 }); // 6 hours
        
        return json({ success: true, comments: sug.comments });
      }

      // 9. Complete Suggestion & Move to Changelog (Admin Only)
      if (segments[0] === "suggestions" && segments[1] === "complete" && request.method === "POST") {
        const adminError = await requireAdmin(request, env);
        if (adminError) return adminError;
        
        const body = await request.json().catch(() => null);
        if (!body || !body.id) return err("id required", 400);
        
        let suggestions = [];
        const existingSug = await env.SKEDUL_KV.get("SUGGESTIONS_DB");
        if (existingSug) {
          try { suggestions = JSON.parse(existingSug); } catch {}
        }
        
        const sugIdx = suggestions.findIndex(s => s.id === body.id);
        if (sugIdx === -1) return err("Suggestion not found", 404);
        const sug = suggestions[sugIdx];
        
        suggestions.splice(sugIdx, 1);
        await env.SKEDUL_KV.put("SUGGESTIONS_DB", JSON.stringify(suggestions));
        
        let changelogs = [];
        const existingCh = await env.SKEDUL_KV.get("CHANGELOG_DB");
        if (existingCh) {
          try { changelogs = JSON.parse(existingCh); } catch {}
        }
        
        changelogs.push({
          id: sug.id,
          title: sug.text,
          description: `Completed community suggestion by ${sug.name}`,
          timestamp: new Date().toISOString()
        });
        
        await env.SKEDUL_KV.put("CHANGELOG_DB", JSON.stringify(changelogs));
        return json({ success: true });
      }

      // Delete Suggestion (Admin Only)
      if (segments[0] === "suggestions" && segments[1] === "delete" && request.method === "POST") {
        const adminError = await requireAdmin(request, env);
        if (adminError) return adminError;
        
        const body = await request.json().catch(() => null);
        if (!body || !body.id) return err("id required", 400);
        
        let suggestions = [];
        const existingSug = await env.SKEDUL_KV.get("SUGGESTIONS_DB");
        if (existingSug) {
          try { suggestions = JSON.parse(existingSug); } catch {}
        }
        
        const sugIdx = suggestions.findIndex(s => s.id === body.id);
        if (sugIdx === -1) return err("Suggestion not found", 404);
        
        suggestions.splice(sugIdx, 1);
        await env.SKEDUL_KV.put("SUGGESTIONS_DB", JSON.stringify(suggestions));
        return json({ success: true });
      }

      // 10. Get Changelogs List
      if (segments[0] === "changelogs" && request.method === "GET") {
        const existing = await env.SKEDUL_KV.get("CHANGELOG_DB");
        let changelogs = [];
        if (existing) {
          try { changelogs = JSON.parse(existing); } catch {}
        }
        changelogs.reverse();
        return json(changelogs);
      }

      return json({ status: "MySkedul AI Worker Online" });

    } catch (e) {
      return err(e.message, 500);
    }
  },
};

async function getAccessToken(env) {
  const privateKeyPem = env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
  const clientEmail = env.FIREBASE_CLIENT_EMAIL;

  const header = {
    alg: "RS256",
    typ: "JWT"
  };

  const now = Math.floor(Date.now() / 1000);
  const claimSet = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now
  };

  const base64UrlEncode = (str) => {
    const base64 = btoa(str);
    return base64.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  };

  const headerStr = base64UrlEncode(JSON.stringify(header));
  const claimSetStr = base64UrlEncode(JSON.stringify(claimSet));
  const signatureInput = `${headerStr}.${claimSetStr}`;

  const pemHeader = "-----BEGIN PRIVATE KEY-----";
  const pemFooter = "-----END PRIVATE KEY-----";
  const pemContents = privateKeyPem
    .substring(privateKeyPem.indexOf(pemHeader) + pemHeader.length, privateKeyPem.indexOf(pemFooter))
    .replace(/\s/g, "");
  
  const binaryDerString = atob(pemContents);
  const binaryDer = new Uint8Array(binaryDerString.length);
  for (let i = 0; i < binaryDerString.length; i++) {
    binaryDer[i] = binaryDerString.charCodeAt(i);
  }

  const key = await crypto.subtle.importKey(
    "pkcs8",
    binaryDer.buffer,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: { name: "SHA-256" }
    },
    false,
    ["sign"]
  );

  const enc = new TextEncoder();
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    enc.encode(signatureInput)
  );

  const signatureStr = base64UrlEncode(String.fromCharCode(...new Uint8Array(signature)));
  const jwt = `${signatureInput}.${signatureStr}`;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  });

  const data = await response.json();
  return data.access_token;
}

async function sendFcmPush(env, tokens, payload) {
  if (!tokens || !tokens.length) return;
  
  // Use modern FCM HTTP v1 API if Service Account keys are present
  if (env.FIREBASE_PRIVATE_KEY && env.FIREBASE_CLIENT_EMAIL) {
    try {
      const accessToken = await getAccessToken(env);
      const projectId = env.FIREBASE_PROJECT_ID || "myskedulapp";
      
      const promises = tokens.map(token => {
        return fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            message: {
              token: token,
              notification: {
                title: "Schedule Updated!",
                body: `The schedule for ${payload.formatId} has been updated.`
              },
              data: {
                formatId: payload.formatId,
                code: payload.code,
                scheduleJson: JSON.stringify(payload.timetable)
              }
            }
          })
        });
      });
      
      await Promise.all(promises);
      console.log(`[FCM v1] Broadcasted updates to ${tokens.length} subscribers.`);
    } catch (e) {
      console.error("[FCM v1] Broadcast failed:", e);
    }
  } else if (env.FIREBASE_SERVER_KEY) {
    // Fallback to legacy Cloud Messaging endpoint
    try {
      await fetch('https://fcm.googleapis.com/fcm/send', {
        method: 'POST',
        headers: {
          'Authorization': `key=${env.FIREBASE_SERVER_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          registration_ids: tokens,
          notification: {
            title: "Schedule Updated!",
            body: `The schedule for ${payload.formatId} has been updated.`
          },
          data: {
            formatId: payload.formatId,
            code: payload.code,
            scheduleJson: JSON.stringify(payload.timetable)
          }
        })
      });
      console.log(`[FCM Legacy] Broadcasted updates to ${tokens.length} subscribers.`);
    } catch (e) {
      console.error("[FCM Legacy] Broadcast failed:", e);
    }
  } else {
    console.log(`[FCM Mock] Push triggered for ${payload.formatId} (${tokens.length} subscribers).`);
  }
}
