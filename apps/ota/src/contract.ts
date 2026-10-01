export type Traveler = Record<string, string>;
export const countries = [
  ["682", "Saudi Arabia"],
  ["784", "United Arab Emirates"],
  ["634", "Qatar"],
  ["414", "Kuwait"],
  ["512", "Oman"],
  ["48", "Bahrain"],
  ["586", "Pakistan"],
  ["356", "India"],
  ["818", "Egypt"],
  ["360", "Indonesia"],
  ["840", "United States"],
  ["250", "France"],
  ["276", "Germany"],
  ["826", "United Kingdom"],
];
export const emptyTraveler = (): Traveler =>
  Object.fromEntries(
    [
      "firstNameEn",
      "fatherNameEn",
      "grandFatherNameEn",
      "familyNameEn",
      "firstNameAr",
      "fatherNameAr",
      "grandFatherNameAr",
      "familyNameAr",
      "nationalityId",
      "currentCountryId",
      "birthCountryId",
      "birthCityName",
      "birthDate",
      "passportNumber",
      "passportTypeId",
      "passportIssueDate",
      "passportExpiryDate",
      "passportIssuingCity",
      "passportIssuingCountryId",
      "gender",
      "maritalStatus",
      "educationalLevel",
      "profession",
      "mobileNumber",
      "emailAddress",
      "iqamaNo",
      "iqamaExpiryDate",
      "personalPicture",
      "passportPicture",
    ].map((k) => [k, ""]),
  );
export function sampleTraveler(i = 0): Traveler {
  return {
    ...emptyTraveler(),
    firstNameEn: i ? "Sara" : "Omar",
    fatherNameEn: "Ahmed",
    grandFatherNameEn: "Ali",
    familyNameEn: "Hassan",
    firstNameAr: i ? "سارة" : "عمر",
    fatherNameAr: "أحمد",
    grandFatherNameAr: "علي",
    familyNameAr: "حسن",
    nationalityId: "818",
    currentCountryId: "784",
    birthCountryId: "818",
    birthCityName: "Cairo",
    birthDate: "1991-05-12",
    passportNumber: `DEMO${10001 + i}`,
    passportTypeId: "1",
    passportIssueDate: "2024-01-15",
    passportExpiryDate: "2030-01-14",
    passportIssuingCity: "Cairo",
    passportIssuingCountryId: "818",
    gender: i ? "2" : "1",
    maritalStatus: "2",
    educationalLevel: "4",
    profession: "Architect",
    mobileNumber: "+971500000000",
    emailAddress: `traveler${i + 1}@example.com`,
    iqamaNo: `DEMO-RES-${i + 1}`,
    iqamaExpiryDate: "2028-01-01",
  };
}
export const packages = [
  {
    id: "serenity",
    name: "The Serenity Journey",
    tag: "ESSENTIAL",
    price: 2861,
    stars: 4,
    distance: "A considered stay in Makkah",
    transport: "Shared transfers",
    nights: 3,
    description:
      "A beautiful beginning. The essentials, thoughtfully arranged.",
  },
  {
    id: "signature",
    name: "The Signature Journey",
    tag: "OUR SIGNATURE",
    price: 4204,
    stars: 5,
    distance: "Close to the heart of Al Haram",
    transport: "Private transfers",
    nights: 3,
    description:
      "Exceptional comfort, meaningful moments, and space to reflect.",
  },
  {
    id: "sanctuary",
    name: "The Sanctuary Journey",
    tag: "PRIVATE COLLECTION",
    price: 5779,
    stars: 5,
    distance: "An elevated sanctuary in Makkah",
    transport: "Premium private transfers",
    nights: 5,
    description:
      "A little more time. A more personal way to experience your journey.",
  },
];
export type Package = (typeof packages)[number];
export function makePayload(
  travelers: Traveler[],
  pkg: Package,
  serviceId: string,
  departure: string,
  origin: string,
  requestId: number,
) {
  const date = (v: string) =>
    v ? new Date(v + "T12:00:00Z").toISOString() : null;
  const end = new Date(departure + "T12:00:00Z");
  end.setUTCDate(end.getUTCDate() + pkg.nights);
  return {
    serviceId,
    visaRequest: {
      groupInfo: {
        otaId: 11,
        otaRequestId: requestId,
        otaGroupId: requestId,
        uoId: 1,
        eaId: 1,
        eaEmbassyId: 1,
        eaCountryId: Number(travelers[0].currentCountryId),
      },
      package: {
        type: 0,
        customizedPackageId: null,
        arrivalRoute: {
          arrivalFlightId: 1,
          arrivalType: 1,
          transportation: {
            category: 2,
            transportationType: 1,
            transportationOtaType: 4,
            price: 0,
            tripDate: date(departure),
            tripNo: "DEMO-ARR",
            transportCompanyId: 0,
            vehicleMake: 0,
            vehicleType: 0,
            instructionsAr: "نقل تجريبي",
            instructionsEn: "Demonstration transfer",
          },
        },
        departureRoute: { departureFlightId: 2, departureType: 1 },
        groundServices: [
          {
            Category: 2,
            code: serviceId,
            BRN: "DEMO",
            nameAr:
              serviceId === "utn"
                ? "الخدمات الأساسية مع شبكة UTN"
                : "الخدمات الأساسية",
            nameEn:
              serviceId === "utn"
                ? "Essential + UTN Trusted Network"
                : "Essential services",
            descriptionAr: "نموذج تجريبي",
            descriptionEn: "Prototype ground service",
            price: serviceId === "utn" ? 150 : 0,
          },
        ],
        packageRoutes: [
          {
            housing: [
              {
                price: pkg.price,
                checkInDate: date(departure),
                checkOutDate: end.toISOString(),
                hotelId: 1,
                hotelNameAr: "فندق نموذجي",
                hotelNameEn: pkg.name,
                hotelAddressAr: "مكة المكرمة",
                hotelAddressEn: "Makkah",
                hotelDescriptionAr: "إقامة تجريبية",
                hotelDescriptionEn: pkg.description,
                reservedHeadCount: travelers.length,
                hasFoodServices: true,
                foodProviderType: 1,
                foodServiceProviderId: 0,
                breakfastDescription: "Breakfast included",
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
      mutamers: travelers.map((t, i) => ({
        ...t,
        otaMutamerId: i + 1,
        maritalStatus: Number(t.maritalStatus),
        nationalityId: Number(t.nationalityId),
        birthCountryId: Number(t.birthCountryId),
        passportTypeId: Number(t.passportTypeId),
        passportIssuingCountryId: Number(t.passportIssuingCountryId),
        gender: Number(t.gender),
        relativeRelationId: 0,
        educationalLevel: Number(t.educationalLevel) || 0,
        currentCountryId: Number(t.currentCountryId),
        birthDate: date(t.birthDate),
        passportIssueDate: date(t.passportIssueDate),
        passportExpiryDate: date(t.passportExpiryDate),
        iqamaExpiryDate: date(t.iqamaExpiryDate),
        personalIqamaPicture: "",
        disclosureAnswers: [],
      })),
    },
    otaExtras: {
      packageId: pkg.id,
      packageName: pkg.name,
      departureCity: origin,
      travelDate: departure,
      consentToShare: true,
      prototype: true,
      lookupCodes:
        "Demo ISO numeric country codes; not verified ministry lookup IDs",
      disclosureNote:
        "Official disclosure questions require live lookup integration; not fabricated in this prototype",
    },
  };
}
