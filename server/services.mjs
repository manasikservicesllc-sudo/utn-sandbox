import { createServer } from "node:http";
import { join } from "node:path";
import {
  token,
  sign,
  equal,
  fail,
  store,
  body,
  json,
  handler,
  post,
  documents,
  validateDocument,
} from "./shared.mjs";
import { reviewImage } from "./ai.mjs";

export function createRuntime(options = {}) {
  const publicSandbox = options.publicSandbox ?? process.env.PUBLIC_SANDBOX === "true";
  const createStore = options.store || store;
  const dir =
    options.dataDir || process.env.DATA_DIR || join(process.cwd(), "data");
  const settings = createStore(join(dir, "settings.json"), {
    secret: token(),
    partnerKey: token(),
  });
  settings.data.partnerKey ||= token();
  settings.save();
  const secret =
    options.secret || process.env.SERVICE_SECRET || settings.data.secret;
  const partnerApiKey =
    options.partnerApiKey ||
    process.env.SANDBOX_PARTNER_API_KEY ||
    settings.data.partnerKey;
  const partnerCallbackUrl =
    options.partnerCallbackUrl || process.env.PARTNER_CALLBACK_URL || null;
  settings.data.partnerCallbackSecret ||= token();
  settings.save();
  const partnerCallbackSecret =
    options.partnerCallbackSecret ||
    process.env.PARTNER_CALLBACK_SECRET ||
    settings.data.partnerCallbackSecret;
  const ota = createStore(join(dir, "ota.json"), {
    bookings: {},
    events: [],
    idempotency: {},
  });
  ota.data.idempotency ||= {};
  for (const booking of Object.values(ota.data.bookings))
    if (booking.status === "creating_invitations")
      booking.status = "invitation_failed";
  const utn = createStore(join(dir, "utn.json"), {
    invitations: {},
    outbox: [],
  });
  utn.data.requests ||= {};
  utn.data.notifications ||= [];
  utn.data.idempotency ||= {};
  const config = {
    apiKey: options.apiKey ?? process.env.OPENAI_API_KEY,
    model: options.model || process.env.OPENAI_MODEL || "gpt-4.1-mini",
  };
  const origins =
    publicSandbox ? ["*"] : options.origins ||
    (
      process.env.ALLOWED_ORIGINS ||
      "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8081,http://127.0.0.1:8081"
    ).split(",");
  const utnWebUrl =
    options.utnWebUrl ||
    process.env.UTN_WEB_URL ||
    "http://localhost:8081/?token=";
  const sendPost = options.post || post;
  let otaUrl, utnUrl;
  const inFlight = new Set();
  const publicBooking = (b) => ({
    id: b.id,
    accessToken: b.accessToken,
    status: b.status,
    invitations: b.invitations.map((i) => ({
      ...i,
      status: b.verifications[i.otaMutamerId]?.status || "pending",
      certificate: b.verifications[i.otaMutamerId]?.certificate || null,
      applicantName: b.visaRequest.mutamers
        .filter((a) => a.otaMutamerId === i.otaMutamerId)
        .map((a) =>
          [a.firstNameEn, a.familyNameEn].filter(Boolean).join(" "),
        )[0],
    })),
    createdAt: b.createdAt,
    visaRequest: b.visaRequest,
    otaExtras: b.otaExtras,
    serviceId: b.serviceId,
    verifications: b.verifications,
    requestId: b.visaRequest.groupInfo.otaRequestId,
    utnRequestId: b.utnRequestId || null,
    notifications: b.notifications || [],
  });
  const invitation = (t) => {
    const i = utn.data.invitations[t];
    if (!i) fail(404, "Invitation not found");
    if (Date.parse(i.expiresAt) < Date.now()) fail(410, "Invitation expired");
    return i;
  };
  const inviteView = (i) => ({
    id: i.id,
    token: i.token,
    otaMutamerId: i.otaMutamerId,
    webUrl: `${utnWebUrl}${i.token}`,
    deepLink: `utn://verify/${i.token}`,
    status: i.status,
    certificate: i.verification?.certificate || null,
    verification: i.verification,
  });
  const requestView = (r) => {
    const invites = Object.values(utn.data.invitations).filter(
      (i) => i.requestId === r.id,
    );
    const statuses = invites.map((i) => i.status);
    return {
      id: r.id,
      requestId: r.id,
      createdAt: r.createdAt,
      status: statuses.every((s) => s === "verified")
        ? "verified"
        : statuses.includes("rejected")
          ? "action_required"
          : statuses.includes("needs_review")
            ? "needs_review"
            : "pending_verification",
      invitations: invites.map(inviteView),
      notifications: utn.data.notifications.filter((n) => n.requestId === r.id),
      callback: {
        configured: !!r.callbackUrl,
        deliveries: utn.data.outbox
          .filter((e) => e.payload.requestId === r.id)
          .map((e) => ({
            eventId: e.payload.eventId,
            status: e.delivered
              ? "delivered"
              : e.disabled
                ? "not_configured"
                : "queued",
            attempts: e.attempts,
          })),
      },
    };
  };
  function validateVisa(v) {
    if (
      !v.groupInfo ||
      !v.package ||
      !Array.isArray(v.mutamers) ||
      v.mutamers.length < 1 ||
      v.mutamers.length > 10
    )
      fail(400, "Expected direct groupInfo, package, and 1–10 mutamers");
    const seen = new Set();
    for (const a of v.mutamers) {
      if (
        a.otaMutamerId == null ||
        seen.has(String(a.otaMutamerId)) ||
        !a.firstNameEn ||
        !a.familyNameEn
      )
        fail(
          400,
          "Each applicant requires unique otaMutamerId and English first/family names",
        );
      seen.add(String(a.otaMutamerId));
    }
  }
  function createInvitations(v) {
    return v.visaRequest.mutamers.map((applicant) => {
      const t = token(),
        id = "UTN-" + token().slice(0, 10).toUpperCase();
      const i = {
        id,
        token: t,
        requestId: v.requestId || null,
        bookingId: v.bookingId,
        otaMutamerId: applicant.otaMutamerId,
        applicant: structuredClone(applicant),
        booking: {
          id: v.bookingId,
          package: v.visaRequest.package,
          serviceId: v.serviceId,
        },
        status: "invited",
        verification: null,
        expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
      };
      utn.data.invitations[t] = i;
      return inviteView(i);
    });
  }
  async function submitOta(b) {
    return sendPost(
      `${utnUrl}/api/v1/verification-requests`,
      {
        ...b.visaRequest,
        additionalInformation: {
          ...b.otaExtras,
          otaBookingId: b.id,
          serviceId: b.serviceId,
          notificationMode: "demo",
        },
      },
      {
        "x-api-key": partnerApiKey,
        "x-internal-ota": sign(b.id, secret),
        "Idempotency-Key": b.id,
      },
    );
  }
  async function queueResult(i, verification) {
    const request = utn.data.requests[i.requestId];
    const callbackUrl = request
      ? request.callbackUrl
      : `${otaUrl}/api/webhooks/utn`;
    const event = {
      callbackUrl,
      external: request && !request.internal,
      disabled: !callbackUrl,
      payload: {
        eventId: token(),
        requestId: i.requestId,
        bookingId: i.bookingId,
        invitationId: i.id,
        otaMutamerId: i.otaMutamerId,
        verification,
      },
      attempts: 0,
      delivered: false,
    };
    utn.data.outbox.push(event);
    utn.save();
    return event.disabled ? false : deliver(event);
  }
  async function deliver(event) {
    if (event.disabled) return false;
    const payload = JSON.stringify(event.payload),
      stamp = String(Date.now());
    event.attempts++;
    try {
      await sendPost(
        event.callbackUrl || `${otaUrl}/api/webhooks/utn`,
        event.payload,
        {
          "x-utn-timestamp": stamp,
          "x-utn-signature": sign(
            stamp + "." + payload,
            event.external ? partnerCallbackSecret : secret,
          ),
        },
      );
      event.delivered = true;
      event.deliveredAt = new Date().toISOString();
    } catch {
      event.delivered = false;
    }
    utn.save();
    return event.delivered;
  }
  const otaHandler = handler(async (req, res, path) => {
    if (req.method === "GET" && path === "/api/health")
      return json(res, 200, { service: "ota", status: "ok", demo: true });
    if (req.method === "POST" && path === "/api/bookings") {
      const { value: v } = await body(req);
      const idempotencyKey = req.headers["idempotency-key"];
      if (
        idempotencyKey &&
        (typeof idempotencyKey !== "string" ||
          idempotencyKey.length > 200 ||
          idempotencyKey.length < 8)
      )
        fail(400, "Idempotency-Key must contain 8–200 characters");
      const idemHash = idempotencyKey ? sign(idempotencyKey, secret) : null;
      const payloadHash = sign(JSON.stringify(v), secret);
      const existing = idemHash && ota.data.idempotency[idemHash];
      if (existing) {
        if (existing.payloadHash !== payloadHash)
          fail(409, "Idempotency-Key was already used for a different request");
        const previous = ota.data.bookings[existing.bookingId];
        if (previous.status === "creating_invitations")
          fail(409, "This booking request is still processing. Retry shortly.");
        if (previous.status !== "invitation_failed")
          return json(res, 200, {
            ...publicBooking(previous),
            idempotentReplay: true,
          });
        // The previous cross-service call failed. Reuse the booking identity on retry.
        previous.status = "creating_invitations";
        ota.save();
        try {
          const result = await submitOta(previous);
          previous.invitations = result.invitations;
          previous.utnRequestId = result.requestId;
          previous.notifications = result.notifications;
          previous.status = "pending_verification";
          ota.save();
          return json(res, 200, publicBooking(previous));
        } catch (e) {
          previous.status = "invitation_failed";
          ota.save();
          throw e;
        }
      }
      if (
        !v.visaRequest ||
        !v.visaRequest.groupInfo ||
        !v.visaRequest.package ||
        !Array.isArray(v.visaRequest.mutamers) ||
        v.visaRequest.mutamers.length < 1 ||
        v.visaRequest.mutamers.length > 10
      )
        fail(400, "visaRequest requires groupInfo, package, and 1–10 mutamers");
      const seen = new Set();
      for (const a of v.visaRequest.mutamers) {
        if (
          a.otaMutamerId == null ||
          seen.has(a.otaMutamerId) ||
          !a.firstNameEn ||
          !a.familyNameEn
        )
          fail(
            400,
            "Each applicant requires unique otaMutamerId, firstNameEn and familyNameEn",
          );
        seen.add(a.otaMutamerId);
      }
      if (!["utn", "essential", "essential-utn"].includes(v.serviceId))
        fail(400, "Select essential or utn service");
      const b = {
        id: "OTA-" + token().slice(0, 10).toUpperCase(),
        accessToken: token(),
        createdAt: new Date().toISOString(),
        status:
          v.serviceId === "essential" ? "not_required" : "creating_invitations",
        visaRequest: v.visaRequest,
        otaExtras: v.otaExtras || {},
        serviceId: v.serviceId,
        invitations: [],
        verifications: {},
      };
      if (idemHash)
        ota.data.idempotency[idemHash] = { bookingId: b.id, payloadHash };
      ota.data.bookings[b.id] = b;
      ota.save();
      if (v.serviceId === "essential") return json(res, 201, publicBooking(b));
      try {
        const result = await submitOta(b);
        b.invitations = result.invitations;
        b.utnRequestId = result.requestId;
        b.notifications = result.notifications;
        b.status = "pending_verification";
        ota.save();
      } catch (e) {
        b.status = "invitation_failed";
        ota.save();
        throw e;
      }
      return json(res, 201, publicBooking(b));
    }
    if (req.method === "GET" && /^\/api\/bookings\/[^/]+$/.test(path)) {
      const b = ota.data.bookings[path.split("/").at(-1)];
      if (!b || !equal(req.headers.authorization, `Bearer ${b.accessToken}`))
        fail(401, "Valid booking access token required");
      return json(res, 200, publicBooking(b));
    }
    if (req.method === "POST" && path === "/api/webhooks/utn") {
      const { raw, value: v } = await body(req);
      const stamp = req.headers["x-utn-timestamp"];
      if (
        !stamp ||
        !Number.isFinite(Number(stamp)) ||
        Math.abs(Date.now() - Number(stamp)) > 300000 ||
        !equal(req.headers["x-utn-signature"], sign(stamp + "." + raw, secret))
      )
        fail(401, "Invalid callback signature");
      const b = ota.data.bookings[v.bookingId];
      if (!b) fail(404, "Booking not found");
      if (ota.data.events.includes(v.eventId))
        return json(res, 200, { received: true, duplicate: true });
      if (
        !b.invitations.some(
          (i) => i.id === v.invitationId && i.otaMutamerId === v.otaMutamerId,
        ) ||
        !["verified", "needs_review", "rejected", "pending"].includes(
          v.verification?.status,
        )
      )
        fail(400, "Callback does not match this booking");
      if (
        (b.verifications[v.otaMutamerId]?.revision || 0) >
        (v.verification.revision || 0)
      ) {
        ota.data.events.push(v.eventId);
        ota.save();
        return json(res, 200, { received: true, stale: true });
      }
      b.verifications[v.otaMutamerId] = v.verification;
      const statuses = b.invitations.map(
        (i) => b.verifications[i.otaMutamerId]?.status || "pending",
      );
      b.status = statuses.every((s) => s === "verified")
        ? "verified"
        : statuses.includes("rejected")
          ? "action_required"
          : statuses.includes("needs_review")
            ? "needs_review"
            : "pending_verification";
      ota.data.events.push(v.eventId);
      ota.save();
      return json(res, 200, { received: true });
    }
    fail(404, "Endpoint not found");
  }, origins);
  const utnHandler = handler(async (req, res, path) => {
    if (req.method === "GET" && path === "/api/health")
      return json(res, 200, {
        service: "utn",
        status: "ok",
        aiAvailable: !!config.apiKey,
        model: config.model,
        publicSandbox,
      });
    if (
      path === "/api/v1/verification-requests" ||
      /^\/api\/v1\/verification-requests\/[^/]+$/.test(path)
    ) {
      if (!publicSandbox && !equal(req.headers["x-api-key"], partnerApiKey))
        fail(401, "Valid partner X-API-Key required");
      if (req.method === "GET") {
        const r = utn.data.requests[path.split("/").at(-1)];
        if (!r) fail(404, "Verification request not found");
        return json(res, 200, requestView(r));
      }
      if (req.method === "POST" && path === "/api/v1/verification-requests") {
        const { value: v } = await body(req);
        validateVisa(v);
        const extra = v.additionalInformation || {};
        if (extra.callbackUrl && extra.callbackUrl !== partnerCallbackUrl)
          fail(400, "Callback URL must match the registered partner callback");
        const key = req.headers["idempotency-key"];
        if (
          key &&
          (typeof key !== "string" || key.length < 8 || key.length > 200)
        )
          fail(400, "Idempotency-Key must contain 8–200 characters");
        const hash = key ? sign(key, partnerApiKey) : null;
        const payloadHash = sign(JSON.stringify(v), secret);
        const previous = hash && utn.data.idempotency[hash];
        if (previous) {
          if (previous.payloadHash !== payloadHash)
            fail(409, "Idempotency-Key was used for a different request");
          return json(res, 200, {
            ...requestView(utn.data.requests[previous.id]),
            idempotentReplay: true,
          });
        }
        const id = "REQ-" + token().slice(0, 14).toUpperCase();
        const internal =
          !!extra.otaBookingId &&
          equal(
            req.headers["x-internal-ota"],
            sign(extra.otaBookingId, secret),
          );
        const r = {
          id,
          createdAt: new Date().toISOString(),
          internal,
          visaRequest: {
            groupInfo: v.groupInfo,
            package: v.package,
            mutamers: v.mutamers,
          },
          additionalInformation: extra,
          callbackUrl: internal
            ? `${otaUrl}/api/webhooks/utn`
            : partnerCallbackUrl,
        };
        utn.data.requests[id] = r;
        const invitations = createInvitations({
          requestId: id,
          bookingId: internal ? extra.otaBookingId : id,
          visaRequest: r.visaRequest,
          serviceId: extra.serviceId || "utn",
        });
        for (const invite of invitations) {
          const applicant = v.mutamers.find(
            (a) => a.otaMutamerId === invite.otaMutamerId,
          );
          for (const channel of ["sms", "whatsapp"])
            utn.data.notifications.push({
              id: token(),
              requestId: id,
              invitationId: invite.id,
              channel,
              to: applicant.mobileNumber || null,
              status:
                extra.notificationMode === "demo"
                  ? "simulated"
                  : "not_configured",
              preview: `Welcome ${applicant.firstNameEn}. Your UTN document assessment is ready. Continue securely: ${invite.webUrl}`,
              createdAt: r.createdAt,
              sentAt: null,
            });
        }
        if (hash) utn.data.idempotency[hash] = { id, payloadHash };
        utn.save();
        return json(res, 201, requestView(r));
      }
      fail(405, "Method not allowed");
    }
    if (req.method === "POST" && path === "/api/invitations") {
      if (!equal(req.headers.authorization, `Bearer ${secret}`))
        fail(401, "Service authorization required");
      const { value: v } = await body(req);
      if (!v.bookingId || !Array.isArray(v.visaRequest?.mutamers))
        fail(400, "Invalid invitation request");
      const previous = Object.values(utn.data.invitations).filter(
        (i) => i.bookingId === v.bookingId,
      );
      if (previous.length)
        return json(res, 200, {
          invitations: previous.map((i) => ({
            id: i.id,
            token: i.token,
            otaMutamerId: i.otaMutamerId,
            webUrl: `${utnWebUrl}${i.token}`,
            deepLink: `utn://verify/${i.token}`,
          })),
        });
      const invitations = v.visaRequest.mutamers.map((applicant) => {
        const t = token(),
          id = "UTN-" + token().slice(0, 10).toUpperCase();
        const i = {
          id,
          token: t,
          bookingId: v.bookingId,
          otaMutamerId: applicant.otaMutamerId,
          applicant,
          booking: {
            id: v.bookingId,
            package: v.visaRequest.package,
            serviceId: v.serviceId,
          },
          status: "invited",
          verification: null,
          expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
        };
        utn.data.invitations[t] = i;
        return {
          id,
          token: t,
          otaMutamerId: applicant.otaMutamerId,
          webUrl: `${utnWebUrl}${t}`,
          deepLink: `utn://verify/${t}`,
        };
      });
      utn.save();
      return json(res, 201, { invitations });
    }
    const match = path.match(
      /^\/api\/invitations\/([^/]+)(?:\/(verify|certificate))?$/,
    );
    if (match) {
      const i = invitation(match[1]);
      if (req.method === "GET" && !match[2])
        return json(res, 200, {
          ...i,
          allowedCategories: documents,
          aiAvailable: !!config.apiKey,
        });
      if (req.method === "PATCH" && !match[2]) {
        if (inFlight.has(i.id))
          fail(409, "Wait for the current verification to complete");
        const { value: v } = await body(req);
        const changes = v.applicant || v;
        const allowed = [
          "firstNameEn",
          "fatherNameEn",
          "grandFatherNameEn",
          "familyNameEn",
          "firstNameAr",
          "fatherNameAr",
          "grandFatherNameAr",
          "familyNameAr",
          "emailAddress",
          "mobileNumber",
          "passportNumber",
          "passportExpiryDate",
          "iqamaNo",
          "iqamaExpiryDate",
        ];
        if (
          !changes ||
          Array.isArray(changes) ||
          !Object.keys(changes).length ||
          Object.keys(changes).some(
            (k) =>
              !allowed.includes(k) ||
              typeof changes[k] !== "string" ||
              changes[k].length > 200 ||
              (["firstNameEn", "familyNameEn"].includes(k) &&
                !changes[k].trim()),
          )
        )
          fail(
            400,
            "Only permitted applicant name, contact and document fields can be corrected",
          );
        const audit = {
          at: new Date().toISOString(),
          fields: Object.keys(changes),
          previous: Object.fromEntries(
            Object.keys(changes).map((k) => [k, i.applicant[k] ?? null]),
          ),
          changes,
        };
        i.audit ||= [];
        i.audit.push(audit);
        Object.assign(i.applicant, changes);
        i.revision = (i.revision || 0) + 1;
        i.status = "pending";
        i.verification = {
          status: "pending",
          revision: i.revision,
          certificate: null,
          reason: "Applicant information corrected; repeat document assessment",
          completedAt: new Date().toISOString(),
        };
        const callbackDelivered = await queueResult(i, i.verification);
        utn.save();
        return json(res, 200, {
          ...i,
          callbackDelivered,
          allowedCategories: documents,
          aiAvailable: !!config.apiKey,
        });
      }
      if (req.method === "GET" && match[2] === "certificate") {
        if (!i.verification?.certificate)
          fail(404, "Certificate not available");
        return json(res, 200, i.verification.certificate);
      }
      if (req.method === "POST" && match[2] === "verify") {
        if (inFlight.has(i.id)) fail(409, "Verification is already running");
        const { value: v } = await body(req);
        if (!documents[v.category]?.includes(v.documentType))
          fail(400, "Document type does not match the selected category");
        if (!["demo", "ai"].includes(v.mode))
          fail(400, "Choose demo or ai verification mode");
        if (v.mode === "ai" && v.consent !== true)
          fail(
            400,
            "Consent is required before sending a document to the AI provider",
          );
        if (v.document) validateDocument(v.document);
        else if (v.mode === "ai") fail(400, "Upload a document for AI review");
        if (
          v.mode === "demo" &&
          !["verified", "review", "rejected"].includes(v.scenario || "verified")
        )
          fail(400, "Unknown demo scenario");
        if (v.mode === "ai") {
          if (!config.apiKey)
            fail(
              503,
              "AI is not configured. Set OPENAI_API_KEY on the server.",
            );
          i.aiAttempts = (i.aiAttempts || []).filter(
            (t) => t > Date.now() - 86400000,
          );
          if (i.aiAttempts.length >= 5)
            fail(
              429,
              "AI assessment limit reached for this invitation. Try again after 24 hours.",
            );
          if (i.aiAttempts.some((t) => t > Date.now() - 30000))
            fail(429, "Please wait 30 seconds before another AI assessment.");
          i.aiAttempts.push(Date.now());
          utn.save();
        }
        inFlight.add(i.id);
        try {
          let verification;
          if (v.mode === "ai")
            verification = await reviewImage(
              { ...v, applicant: i.applicant },
              config,
            );
          else {
            const status = {
              verified: "verified",
              review: "needs_review",
              rejected: "rejected",
            }[v.scenario || "verified"];
            verification = {
              status,
              mode: "demo",
              simulated: true,
              checks: [
                "Document readability",
                "Name consistency",
                "Document type",
                "Issuing country consistency",
                "Document validity date",
              ].map((label, n) => ({
                id: [
                  "readability",
                  "name",
                  "document_type",
                  "issuer",
                  "expiry",
                ][n],
                label,
                passed: status === "verified" || n < 3,
              })),
              concerns:
                status === "verified"
                  ? []
                  : [
                      status === "needs_review"
                        ? "Simulated ambiguity requires review"
                        : "Simulated document inconsistency",
                    ],
              scope:
                "Simulated demonstration only. No real document verification or visa eligibility decision.",
            };
          }
          if (v.mode === "demo") {
            verification.extractedFieldsSource = "simulated_fixture";
            verification.extractedFields = {
              fullName: [i.applicant.firstNameEn, i.applicant.familyNameEn]
                .filter(Boolean)
                .join(" "),
              documentNumber: "DEMO-DOC-001",
              issuingCountry: "Demonstration issuer",
              expiryDate: "2028-01-01",
            };
          }
          i.revision = (i.revision || 0) + 1;
          verification.revision = i.revision;
          verification.category = v.category;
          verification.documentType = v.documentType;
          verification.completedAt = new Date().toISOString();
          if (verification.status === "verified") {
            const certificate = {
              id: "UTN-CERT-" + token().slice(0, 12).toUpperCase(),
              issuedAt: verification.completedAt,
              mode: verification.mode,
              simulated: verification.simulated,
              scope: verification.scope,
              bookingId: i.bookingId,
              invitationId: i.id,
              applicantName: [
                i.applicant.firstNameEn,
                i.applicant.familyNameEn,
              ].join(" "),
            };
            certificate.signature = sign(JSON.stringify(certificate), secret);
            verification.certificate = certificate;
          }
          i.verification = verification;
          i.status = verification.status;
          const callbackDelivered = await queueResult(i, verification);
          return json(res, 200, { ...verification, callbackDelivered });
        } finally {
          inFlight.delete(i.id);
        }
      }
    }
    fail(404, "Endpoint not found");
  }, origins);
  return {
    otaHandler,
    utnHandler,
    setUrls(urls) {
      otaUrl = urls.otaUrl;
      utnUrl = urls.utnUrl;
    },
    async retryCallbacks() {
      for (const event of utn.data.outbox.filter(
        (e) => !e.delivered && !e.disabled,
      ))
        await deliver(event);
    },
  };
}
export async function startServices(options = {}) {
  const runtime = createRuntime(options);
  const otaServer = createServer(runtime.otaHandler),
    utnServer = createServer(runtime.utnHandler);
  const listen = (server, port) =>
    new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, "127.0.0.1", () =>
        resolve(`http://127.0.0.1:${server.address().port}`),
      );
    });
  const otaUrl = await listen(
    otaServer,
    options.otaPort ?? Number(process.env.OTA_PORT || 4100),
  );
  let utnUrl;
  try {
    utnUrl = await listen(
      utnServer,
      options.utnPort ?? Number(process.env.UTN_PORT || 4101),
    );
  } catch (e) {
    otaServer.close();
    throw e;
  }
  runtime.setUrls({ otaUrl, utnUrl });
  const timer = setInterval(
    () => runtime.retryCallbacks().catch(() => {}),
    10000,
  );
  timer.unref();
  return {
    otaUrl,
    utnUrl,
    async close() {
      clearInterval(timer);
      await Promise.all(
        [otaServer, utnServer].map(
          (s) =>
            new Promise((r) => {
              s.closeAllConnections();
              s.close(r);
            }),
        ),
      );
    },
  };
}
