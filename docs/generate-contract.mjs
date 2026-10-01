import { writeFileSync } from "node:fs";
const string = { type: "string" },
  number = { type: "number" },
  boolean = { type: "boolean" },
  date = { type: ["string", "null"], format: "date-time" };
const obj = (properties, required = []) => ({
  type: "object",
  properties,
  ...(required.length ? { required } : {}),
  additionalProperties: true,
});
const fields = (names, type = string) =>
  Object.fromEntries(names.split(" ").map((n) => [n, { ...type }]));
const array = (items) => ({ type: "array", items });
const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const transport = obj({
  ...fields(
    "category transportationType transportationOtaType price transportCompanyId vehicleMake vehicleType",
    number,
  ),
  ...fields("tripNo instructionsAr instructionsEn"),
  tripDate: date,
});
const housing = obj({
  ...fields(
    "price hotelId reservedHeadCount foodProviderType foodServiceProviderId",
    number,
  ),
  ...fields(
    "hotelNameAr hotelNameEn hotelAddressAr hotelAddressEn hotelDescriptionAr hotelDescriptionEn breakfastDescription lunchDescription dinnerDescription otherMealDescription",
  ),
  checkInDate: date,
  checkOutDate: date,
  hasFoodServices: boolean,
});
const service = obj({
  ...fields("nameAr nameEn descriptionAr descriptionEn"),
  price: number,
});
const schemas = {
  GroupInfo: obj(
    fields(
      "otaId otaRequestId otaGroupId uoId eaId eaEmbassyId eaCountryId",
      number,
    ),
  ),
  Transportation: transport,
  Housing: housing,
  AdditionalService: service,
  GroundService: obj({
    ...service.properties,
    Category: number,
    code: string,
    BRN: string,
  }),
  EnrichmentService: obj({
    ...fields(
      "code descriptionAr descriptionEn tourGuideNameAr tourGuideNameEn tourGuidePhoneNumber",
    ),
    ...fields("tourGuidePhoneCountryKey serviceCost serviceProfit", number),
    date,
  }),
  Package: obj({
    type: {
      type: "number",
      description:
        "Guide: 0 package without UO; 1 customized package. Lookup/business validation not implemented.",
    },
    customizedPackageId: { type: ["number", "null"] },
    arrivalRoute: obj({
      arrivalFlightId: number,
      arrivalType: number,
      transportation: ref("Transportation"),
    }),
    departureRoute: obj({ departureFlightId: number, departureType: number }),
    groundServices: { anyOf: [array(ref("GroundService")), { type: "null" }] },
    packageRoutes: array(
      obj({
        housing: array(ref("Housing")),
        transportation: array(ref("Transportation")),
        additionalServices: array(ref("AdditionalService")),
        enrichmentServices: array(ref("EnrichmentService")),
      }),
    ),
  }),
  DisclosureAnswer: obj({
    questionId: number,
    answer: boolean,
    simpleReason: { type: ["string", "null"] },
    detailedAnswers: array(
      obj({
        ...fields("relativeName reasonOfTravel"),
        ...fields("relationId countryId", number),
        travelFromDate: date,
        travelToDate: date,
      }),
    ),
  }),
  Mutamer: obj(
    {
      ...fields(
        "otaMutamerId maritalStatus nationalityId birthCountryId passportTypeId passportIssuingCountryId gender relativeRelationId educationalLevel currentCountryId",
        number,
      ),
      ...fields(
        "firstNameEn fatherNameEn grandFatherNameEn familyNameEn firstNameAr fatherNameAr grandFatherNameAr familyNameAr birthCityName passportNumber passportIssuingCity profession mobileNumber emailAddress iqamaNo personalPicture passportPicture personalIqamaPicture",
      ),
      birthDate: date,
      passportIssueDate: date,
      passportExpiryDate: date,
      iqamaExpiryDate: date,
      disclosureAnswers: array(ref("DisclosureAnswer")),
    },
    ["otaMutamerId", "firstNameEn", "familyNameEn"],
  ),
  VerificationRequest: obj(
    {
      groupInfo: ref("GroupInfo"),
      package: ref("Package"),
      mutamers: { ...array(ref("Mutamer")), minItems: 1, maxItems: 10 },
      additionalInformation: {
        type: "object",
        additionalProperties: true,
        description:
          "OTA-only fields, booking context and consent metadata; preserved separately.",
      },
    },
    ["groupInfo", "package", "mutamers"],
  ),
  Certificate: obj({
    ...fields(
      "id issuedAt mode scope bookingId invitationId applicantName signature",
    ),
    simulated: boolean,
  }),
  Verification: obj({
    status: {
      type: "string",
      enum: ["pending", "verified", "needs_review", "rejected"],
    },
    mode: { type: "string", enum: ["demo", "ai"] },
    simulated: boolean,
    category: string,
    documentType: string,
    completedAt: { type: "string", format: "date-time" },
    revision: number,
    scope: string,
    checks: array(obj({ id: string, label: string, passed: boolean })),
    concerns: array(string),
    extractedFields: obj(
      fields("fullName documentNumber issuingCountry expiryDate", {
        type: ["string", "null"],
      }),
    ),
    certificate: { anyOf: [ref("Certificate"), { type: "null" }] },
    callbackDelivered: boolean,
  }),
  Error: obj({ error: string }),
};
schemas.Invitation = obj({
  ...fields("id token webUrl deepLink status"),
  otaMutamerId: number,
  certificate: { anyOf: [ref("Certificate"), { type: "null" }] },
  verification: { anyOf: [ref("Verification"), { type: "null" }] },
});
schemas.RequestStatus = obj({
  ...fields("id requestId createdAt"),
  status: {
    type: "string",
    enum: [
      "pending_verification",
      "verified",
      "needs_review",
      "action_required",
    ],
  },
  invitations: array(ref("Invitation")),
  notifications: array(
    obj({
      ...fields("id requestId invitationId preview createdAt"),
      channel: { type: "string", enum: ["sms", "whatsapp"] },
      to: { type: ["string", "null"] },
      status: { type: "string", enum: ["simulated", "not_configured"] },
      sentAt: { type: "null" },
    }),
  ),
  callback: obj({
    configured: boolean,
    deliveries: array(
      obj({
        eventId: string,
        status: {
          type: "string",
          enum: ["delivered", "queued", "not_configured"],
        },
        attempts: number,
      }),
    ),
  }),
});
const example = {
  groupInfo: {
    otaId: 11,
    otaRequestId: 100001,
    otaGroupId: 100001,
    uoId: 0,
    eaId: 0,
    eaEmbassyId: 0,
    eaCountryId: 784,
  },
  package: {
    type: 0,
    customizedPackageId: null,
    arrivalRoute: {
      arrivalFlightId: 0,
      arrivalType: 1,
      transportation: {
        category: 2,
        transportationType: 1,
        transportationOtaType: 4,
        price: 0,
        tripDate: "2026-11-15T12:00:00Z",
        tripNo: "DEMO-ARR",
        transportCompanyId: 0,
        vehicleMake: 0,
        vehicleType: 0,
        instructionsAr: "نقل تجريبي",
        instructionsEn: "Sample transfer",
      },
    },
    departureRoute: { departureFlightId: 0, departureType: 1 },
    groundServices: [
      {
        Category: 2,
        code: "utn",
        BRN: "DEMO",
        nameAr: "خدمات تجريبية",
        nameEn: "Essential + UTN",
        descriptionAr: "نموذج تجريبي",
        descriptionEn: "Sample ground service",
        price: 150,
      },
    ],
    packageRoutes: [
      {
        housing: [
          {
            price: 4204,
            checkInDate: "2026-11-15T12:00:00Z",
            checkOutDate: "2026-11-18T12:00:00Z",
            hotelId: 0,
            hotelNameAr: "فندق نموذجي",
            hotelNameEn: "Sample hotel",
            hotelAddressAr: "مكة المكرمة",
            hotelAddressEn: "Makkah",
            hotelDescriptionAr: "إقامة تجريبية",
            hotelDescriptionEn: "Sample stay",
            reservedHeadCount: 1,
            hasFoodServices: true,
            foodProviderType: 1,
            foodServiceProviderId: 0,
            breakfastDescription: "Sample breakfast",
            lunchDescription: "",
            dinnerDescription: "",
            otherMealDescription: "",
          },
        ],
        transportation: [],
        additionalServices: [],
        enrichmentServices: [],
      },
    ],
  },
  mutamers: [
    {
      otaMutamerId: 1,
      maritalStatus: 2,
      firstNameEn: "Omar",
      fatherNameEn: "Ahmed",
      grandFatherNameEn: "Ali",
      familyNameEn: "Hassan",
      firstNameAr: "عمر",
      fatherNameAr: "أحمد",
      grandFatherNameAr: "علي",
      familyNameAr: "حسن",
      nationalityId: 818,
      birthCountryId: 818,
      birthCityName: "Cairo",
      birthDate: "1991-05-12T12:00:00Z",
      passportNumber: "DEMO10001",
      passportTypeId: 1,
      passportIssueDate: "2024-01-15T12:00:00Z",
      passportExpiryDate: "2030-01-14T12:00:00Z",
      passportIssuingCity: "Cairo",
      passportIssuingCountryId: 818,
      gender: 1,
      relativeRelationId: 0,
      educationalLevel: 4,
      profession: "Architect",
      mobileNumber: "+971500000000",
      emailAddress: "traveler@example.com",
      currentCountryId: 784,
      iqamaNo: "DEMO-RES-1",
      iqamaExpiryDate: "2028-01-01T12:00:00Z",
      disclosureAnswers: [],
      personalPicture: "",
      passportPicture: "",
      personalIqamaPicture: "",
    },
  ],
  additionalInformation: {
    prototype: true,
    packageName: "The Signature Journey",
    consentToShare: true,
    lookupCodes:
      "Sample ISO numeric country values; not verified ministry lookup IDs",
  },
};
const json = (schema) => ({ "application/json": { schema } });
const errors = Object.fromEntries(
  ["400", "401", "404", "409", "410", "413", "502", "503"].map((code) => [
    code,
    {
      description: "See integration guide for errors",
      content: json(ref("Error")),
    },
  ]),
);
const spec = {
  openapi: "3.1.0",
  info: {
    title: "UTN partner sandbox",
    version: "1.0.0",
    description:
      "Prototype companion contract. Guide-shaped fields are preserved; this is not the ministry endpoint and does not implement full ministry validation.",
  },
  servers: [
    { url: "http://localhost:4101/api", description: "Local UTN service" },
    {
      url: "https://api.utn-staging.com",
      description: "Hosted partner sandbox API",
    },
  ],
  security: [{}, { PartnerApiKey: [] }],
  paths: {
    "/v1/verification-requests": {
      post: {
        summary:
          "Create a verification request from an OTA visa-shaped payload",
        parameters: [
          {
            name: "Idempotency-Key",
            in: "header",
            required: false,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: ref("VerificationRequest"), example },
          },
        },
        responses: {
          201: {
            description:
              "Created; includes per-traveler invitation URLs and request identifier",
            content: json({ type: "object", additionalProperties: true }),
          },
          200: {
            description: "Idempotent replay",
            content: json({ type: "object", additionalProperties: true }),
          },
          ...errors,
        },
      },
    },
    "/v1/verification-requests/{id}": {
      get: {
        summary: "Read request and per-traveler verification status",
        parameters: [
          { name: "id", in: "path", required: true, schema: string },
        ],
        responses: {
          200: {
            description: "Request status",
            content: json({ type: "object", additionalProperties: true }),
          },
          ...errors,
        },
      },
    },
  },
  components: {
    securitySchemes: {
      PartnerApiKey: { type: "apiKey", in: "header", name: "x-api-key" },
    },
    schemas,
  },
};
const collection = {
  info: {
    name: "UTN Partner Sandbox",
    schema:
      "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    description:
      "Public staging accepts synthetic requests without a key. For protected deployments enable the disabled x-api-key header and supply partnerApiKey locally. No keys included.",
  },
  variable: [
    { key: "baseUrl", value: "https://api.utn-staging.com" },
    { key: "partnerApiKey", value: "" },
    { key: "requestId", value: "" },
    { key: "idempotencyKey", value: "demo-request-100001" },
  ],
  item: [
    {
      name: "Create verification request",
      request: {
        method: "POST",
        header: [
          { key: "Content-Type", value: "application/json" },
          { key: "x-api-key", value: "{{partnerApiKey}}", disabled: true },
          { key: "Idempotency-Key", value: "{{idempotencyKey}}" },
        ],
        url: "{{baseUrl}}/v1/verification-requests",
        body: {
          mode: "raw",
          raw: JSON.stringify(example, null, 2),
          options: { raw: { language: "json" } },
        },
      },
    },
    {
      name: "Read verification request",
      request: {
        method: "GET",
        header: [{ key: "x-api-key", value: "{{partnerApiKey}}", disabled: true }],
        url: "{{baseUrl}}/v1/verification-requests/{{requestId}}",
      },
    },
  ],
};
for (const path of Object.values(spec.paths))
  for (const operation of Object.values(path))
    for (const code of ["200", "201"])
      if (operation.responses[code])
        operation.responses[code].content = json(ref("RequestStatus"));
spec.paths["/v1/verification-requests"].post.parameters[0].schema = {
  type: "string",
  minLength: 8,
  maxLength: 200,
};
collection.item[0].event = [
  {
    listen: "test",
    script: {
      type: "text/javascript",
      exec: [
        "if (pm.response.code === 200 || pm.response.code === 201) { pm.collectionVariables.set('requestId', pm.response.json().id); }",
      ],
    },
  },
];
for (const [name, value] of Object.entries({
  "openapi.json": spec,
  "example-request.json": example,
  "utn-partner.postman_collection.json": collection,
  "postman.json": collection,
}))
  writeFileSync(
    new URL(name, import.meta.url),
    JSON.stringify(value, null, 2) + "\n",
  );
