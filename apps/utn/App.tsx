import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import * as ExpoLinking from "expo-linking";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";

const API = process.env.EXPO_PUBLIC_UTN_API_URL || "http://localhost:4101";
const OTA = process.env.EXPO_PUBLIC_OTA_URL || "http://localhost:5173";
const C = {
  ink: "#101f29",
  muted: "#74817f",
  green: "#1c6252",
  mint: "#dcebe3",
  cream: "#f6f5ef",
  gold: "#c7ac76",
  line: "#e1e5de",
  white: "#fff",
  red: "#a14739",
};
const categories = [
  {
    id: "gcc_citizen",
    title: "GCC citizen",
    description: "National of a Gulf Cooperation Council country",
    documentType: "national_id",
    documentLabel: "National identity card",
    icon: "◈",
  },
  {
    id: "gcc_resident",
    title: "GCC resident",
    description: "Holding a GCC residence permit",
    documentType: "residence_permit",
    documentLabel: "GCC residence permit",
    icon: "⌂",
  },
  {
    id: "schengen_resident",
    title: "Schengen resident",
    description: "Holding a residence permit in the Schengen area",
    documentType: "residence_permit",
    documentLabel: "Schengen residence permit",
    icon: "◉",
  },
  {
    id: "schengen_visa",
    title: "Schengen visa holder",
    description: "Holding a Schengen visa",
    documentType: "visa",
    documentLabel: "Schengen visa",
    icon: "◇",
  },
  {
    id: "us_resident",
    title: "US resident",
    description: "Holding a US residence document",
    documentType: "residence_permit",
    documentLabel: "US residence document",
    icon: "⌂",
  },
  {
    id: "us_visa",
    title: "US visa holder",
    description: "Holding a United States visa",
    documentType: "visa",
    documentLabel: "US visa",
    icon: "◇",
  },
];
type UploadedDocument = { name: string; mimeType: string; base64: string };
type AnyRecord = Record<string, any>;
function Button({
  children,
  onPress,
  disabled = false,
  secondary = false,
}: {
  children: React.ReactNode;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        secondary && s.secondary,
        disabled && { opacity: 0.45 },
        pressed && { opacity: 0.8 },
      ]}
    >
      <Text style={[s.buttonText, secondary && { color: C.green }]}>
        {children}
      </Text>
    </Pressable>
  );
}
function Label({ children }: { children: React.ReactNode }) {
  return <Text style={s.label}>{children}</Text>;
}
function tokenFromUrl(url: string | null) {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    return (
      parsed.searchParams.get("token") ||
      (parsed.protocol === "utn:"
        ? parsed.pathname.split("/").filter(Boolean).pop() || ""
        : "")
    );
  } catch {
    return "";
  }
}
async function request(path: string, options?: RequestInit) {
  const response = await fetch(`${API}${path}`, {
    credentials: "same-origin",
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      typeof data.error === "string"
        ? data.error
        : data.error?.message ||
          data.message ||
          `Request failed (${response.status}). Please try again.`,
    );
  return data;
}
export default function App() {
  const { width } = useWindowDimensions();
  const wide = width >= 960;
  const [token, setToken] = useState("");
  const [invitation, setInvitation] = useState<AnyRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [step, setStep] = useState(0);
  const [category, setCategory] = useState(categories[1]);
  const [document, setDocument] = useState<UploadedDocument | null>(null);
  const [mode, setMode] = useState<"demo" | "ai">("demo");
  const [scenario, setScenario] = useState<"verified" | "review" | "rejected">(
    "verified",
  );
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AnyRecord | null>(null);
  const [certificate, setCertificate] = useState<AnyRecord | null>(null);
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState(false);
  const [corrections, setCorrections] = useState<Record<string, string>>({});
  useEffect(() => {
    ExpoLinking.getInitialURL().then((url) => {
      const found = tokenFromUrl(url);
      setToken(found);
      if (!found) setLoading(false);
    });
    const listener = ExpoLinking.addEventListener("url", ({ url }) => {
      setToken(tokenFromUrl(url));
      setStep(0);
      setResult(null);
      setCertificate(null);
    });
    return () => listener.remove();
  }, []);
  useEffect(() => {
    if (!token) return;
    setLoading(true);
    setError("");
    request(`/api/invitations/${encodeURIComponent(token)}`)
      .then((data) => {
        const invite = data.invitation || data;
        setInvitation(invite);
        if (invite.verification && invite.verification.status !== "pending") {
          setResult(invite.verification);
          setCertificate(invite.verification.certificate || null);
          setMode(invite.verification.mode || "demo");
          setStep(3);
          const selected = categories.find(
            (item) => item.id === invite.verification.category,
          );
          if (selected) setCategory(selected);
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);
  const traveler =
    invitation?.traveler || invitation?.applicant || invitation?.pilgrim || {};
  const travelerName =
    traveler.fullName ||
    [
      traveler.firstName || traveler.firstNameEn || traveler.first_name,
      traveler.lastName ||
        traveler.lastNameEn ||
        traveler.familyNameEn ||
        traveler.last_name,
    ]
      .filter(Boolean)
      .join(" ") ||
    invitation?.travelerName ||
    "Your traveler profile";
  const bookingRef =
    invitation?.bookingReference ||
    invitation?.bookingId ||
    invitation?.booking?.reference ||
    "Connected OTA booking";
  const returnUrl = invitation?.returnUrl || `${OTA}/`;
  const verdict =
    result?.status || result?.decision || result?.assessment?.status;
  const verified = verdict === "verified";
  async function saveCorrections() {
    setBusy(true);
    setError("");
    try {
      const updated = await request(
        `/api/invitations/${encodeURIComponent(token)}`,
        { method: "PATCH", body: JSON.stringify({ applicant: corrections }) },
      );
      setInvitation(updated);
      setEditing(false);
      setResult(null);
      setCertificate(null);
      setNotice(
        "Your details have been updated. A new assessment will use the corrected information.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function pickDocument() {
    setError("");
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ["image/jpeg", "image/png", "image/webp"],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (picked.canceled) return;
      const file = picked.assets[0];
      if (file.size && file.size > 5 * 1024 * 1024)
        throw new Error("Please choose a document smaller than 5 MB.");
      let base64: string;
      if (Platform.OS === "web") {
        const blob = await (await fetch(file.uri)).blob();
        base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(",")[1]);
          reader.onerror = () =>
            reject(
              new Error("Unable to read this file. Please choose it again."),
            );
          reader.readAsDataURL(blob);
        });
      } else
        base64 = await FileSystem.readAsStringAsync(file.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
      setDocument({
        name: file.name,
        mimeType: file.mimeType || "application/octet-stream",
        base64,
      });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function verify() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const data = await request(
        `/api/invitations/${encodeURIComponent(token)}/verify`,
        {
          method: "POST",
          body: JSON.stringify({
            category: category.id,
            documentType: category.documentType,
            document,
            mode,
            scenario,
            consent,
          }),
        },
      );
      setResult(data);
      setStep(3);
      if ((data.status || data.decision) === "verified") {
        try {
          const cert = await request(
            `/api/invitations/${encodeURIComponent(token)}/certificate`,
          );
          setCertificate(cert.certificate || cert);
        } catch {
          setNotice(
            "Your assessment completed. The credential could not be loaded; try opening it again.",
          );
        }
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function exportCertificate() {
    if (!certificate) return;
    const contents = JSON.stringify(certificate, null, 2);
    if (Platform.OS === "web") {
      const link = globalThis.document.createElement("a");
      const url = URL.createObjectURL(
        new Blob([contents], { type: "application/json" }),
      );
      link.href = url;
      link.download = `UTN-credential-${certificate.id || certificate.certificateId || "assessment"}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } else
      await Share.share({
        title: "UTN assessment credential",
        message: contents,
      });
  }
  const details = [
    ["Traveler", travelerName],
    ["Booking reference", String(bookingRef)],
    [
      "Passport",
      traveler.passportNumber
        ? `•••• ${String(traveler.passportNumber).slice(-4)}`
        : "Provided by your travel partner",
    ],
    ["Journey", "Umrah · Saudi Arabia"],
  ];
  return (
    <SafeAreaView style={s.root}>
      <ScrollView contentContainerStyle={s.page}>
        <View style={s.nav}>
          <View style={s.brand}>
            <View style={s.brandMark}>
              <Text style={s.markText}>u</Text>
            </View>
            <View>
              <Text style={s.brandName}>UTN</Text>
              <Text style={s.brandSub}>TRUSTED NETWORK</Text>
            </View>
          </View>
          <View style={s.navRight}>
            <Text style={s.navCaption}>
              A little certainty. A meaningful journey.
            </Text>
            <View style={s.prototype}>
              <Text style={s.prototypeText}>PROTOTYPE</Text>
            </View>
          </View>
        </View>
        <View style={[s.layout, !wide && { flexDirection: "column" }]}>
          <View
            style={[
              s.editorial,
              !wide && { width: "100%", minHeight: 300, padding: 28 },
            ]}
          >
            <View style={s.orbitOne} />
            <View style={s.orbitTwo} />
            <Label>UMRAH TRUSTED NETWORK</Label>
            <Text
              style={[
                s.heroTitle,
                !wide && { fontSize: 42, lineHeight: 48, marginTop: 25 },
              ]}
            >
              Travel with{"\n"}peace of mind.
            </Text>
            <Text style={s.heroDescription}>
              Your details, connected.{"\n"}Your documents, carefully assessed.
              {"\n"}Your next chapter, closer.
            </Text>
            {wide && (
              <View style={s.seal}>
                <Text style={s.sealStar}>✧</Text>
                <Text style={s.sealTitle}>A TRUSTED{"\n"}BEGINNING</Text>
                <Text style={s.sealFoot}>UTN · UMRAH</Text>
              </View>
            )}
            {wide && (
              <View style={s.editorialBottom}>
                <View style={s.smallLine} />
                <Text style={s.editorialQuote}>
                  “Every meaningful journey begins{"\n"}with a confident first
                  step.”
                </Text>
                <Text style={s.editorialFine}>
                  A connected experience with your travel partner.
                </Text>
              </View>
            )}
          </View>
          <View style={[s.content, !wide && { padding: 24 }]}>
            {loading ? (
              <View style={s.center}>
                <ActivityIndicator color={C.green} />
                <Text style={s.subtitle}>Opening your secure invitation…</Text>
              </View>
            ) : !invitation ? (
              <View style={s.empty}>
                <Text style={s.eyebrow}>YOUR PERSONAL INVITATION</Text>
                <Text style={s.title}>
                  Your next step{"\n"}starts with a journey.
                </Text>
                <Text style={s.subtitle}>
                  Choose an Umrah package with UTN on your travel partner’s
                  website. Your invitation will bring your traveler details
                  here, ready to review.
                </Text>
                {!!error && (
                  <Text accessibilityRole="alert" style={s.error}>
                    {error}
                  </Text>
                )}
                <Button onPress={() => Linking.openURL(OTA)}>
                  Explore Umrah packages ↗
                </Button>
                <Text style={s.privacy}>
                  Already booked? Open the UTN invitation supplied with your
                  booking.
                </Text>
              </View>
            ) : (
              <>
                <View style={s.progress}>
                  {["Your details", "Document", "Assessment", "Credential"].map(
                    (name, i) => (
                      <View key={name} style={s.progressItem}>
                        <View style={[s.dot, i <= step && s.activeDot]}>
                          <Text
                            style={[s.dotText, i <= step && { color: "#fff" }]}
                          >
                            {i < step ? "✓" : i + 1}
                          </Text>
                        </View>
                        <Text
                          style={[
                            s.progressText,
                            i === step && { color: C.green, fontWeight: "700" },
                          ]}
                        >
                          {name}
                        </Text>
                      </View>
                    ),
                  )}
                </View>
                {!!error && (
                  <Text accessibilityRole="alert" style={s.error}>
                    {error}
                  </Text>
                )}
                {!!notice && <Text style={s.note}>{notice}</Text>}
                {step === 0 && (
                  <>
                    <Text style={s.eyebrow}>WELCOME TO UTN</Text>
                    <Text style={s.title}>
                      A smoother journey,{"\n"}starting with you.
                    </Text>
                    <Text style={s.subtitle}>
                      Your travel partner has shared your details. Review them
                      once, then choose the document that applies to you.
                    </Text>
                    <View style={s.profileCard}>
                      <View style={s.profileHeader}>
                        <View style={s.avatar}>
                          <Text style={s.avatarText}>
                            {travelerName.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <View>
                          <Text style={s.cardTitle}>Your traveler profile</Text>
                          <Text style={s.smallText}>
                            Connected from your OTA booking
                          </Text>
                        </View>
                        <Text style={s.connected}>↗</Text>
                      </View>
                      {details.map(([label, value]) => (
                        <View style={s.detailRow} key={label}>
                          <Text style={s.smallText}>{label}</Text>
                          <Text style={s.detailValue}>{value}</Text>
                        </View>
                      ))}
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        setCorrections(
                          Object.fromEntries(
                            [
                              "firstNameEn",
                              "familyNameEn",
                              "passportNumber",
                              "emailAddress",
                              "mobileNumber",
                            ].map((key) => [key, traveler[key] || ""]),
                          ),
                        );
                        setEditing(!editing);
                      }}
                    >
                      <Text style={s.textLink}>
                        {editing
                          ? "Cancel corrections"
                          : "Review or correct your traveler details ↗"}
                      </Text>
                    </Pressable>
                    {editing && (
                      <View style={[s.profileCard, { marginTop: 16 }]}>
                        {[
                          ["firstNameEn", "First name (English)"],
                          ["familyNameEn", "Family name (English)"],
                          ["passportNumber", "Passport number"],
                          ["emailAddress", "Email address"],
                          ["mobileNumber", "Mobile number"],
                        ].map(([key, label]) => (
                          <View key={key} style={{ marginBottom: 12 }}>
                            <Text style={s.smallText}>{label}</Text>
                            <TextInput
                              accessibilityLabel={label}
                              value={corrections[key]}
                              onChangeText={(text) =>
                                setCorrections({ ...corrections, [key]: text })
                              }
                              style={{
                                borderWidth: 1,
                                borderColor: C.line,
                                padding: 12,
                                fontSize: 16,
                                minHeight: 48,
                                color: C.ink,
                                borderRadius: 4,
                                marginTop: 5,
                              }}
                            />
                          </View>
                        ))}
                        <Button
                          disabled={
                            busy ||
                            !corrections.firstNameEn?.trim() ||
                            !corrections.familyNameEn?.trim()
                          }
                          onPress={saveCorrections}
                        >
                          {busy
                            ? "Saving corrections…"
                            : "Save corrected details"}
                        </Button>
                      </View>
                    )}
                    <View style={s.callout}>
                      <Text style={s.calloutIcon}>◇</Text>
                      <Text style={s.calloutText}>
                        One document. A clear assessment. A credential connected
                        to your booking.
                      </Text>
                    </View>
                    <Button disabled={editing} onPress={() => setStep(1)}>
                      Confirm details & continue →
                    </Button>
                  </>
                )}
                {step === 1 && (
                  <>
                    <Text style={s.eyebrow}>01 / YOUR DOCUMENT</Text>
                    <Text style={s.title}>
                      The right document.{"\n"}Nothing more.
                    </Text>
                    <Text style={s.subtitle}>
                      Select your category so we can request the relevant
                      document for this prototype assessment.
                    </Text>
                    <View style={s.categoryGrid}>
                      {categories.map((item) => (
                        <Pressable
                          key={item.id}
                          accessibilityRole="radio"
                          accessibilityState={{
                            checked: category.id === item.id,
                          }}
                          onPress={() => {
                            setCategory(item);
                            setDocument(null);
                          }}
                          style={[
                            s.category,
                            category.id === item.id && s.categorySelected,
                            width < 480 && { width: "100%" },
                          ]}
                        >
                          <View style={s.categoryTop}>
                            <Text style={s.categoryIcon}>{item.icon}</Text>
                            <Text style={s.radio}>
                              {category.id === item.id ? "●" : "○"}
                            </Text>
                          </View>
                          <Text style={s.categoryTitle}>{item.title}</Text>
                          <Text style={s.categoryDescription}>
                            {item.description}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                    <View style={s.required}>
                      <Text style={s.smallText}>WE’LL REQUEST</Text>
                      <Text style={s.cardTitle}>{category.documentLabel}</Text>
                    </View>
                    <Button onPress={() => setStep(2)}>
                      Continue to document check →
                    </Button>
                    <Pressable accessibilityRole="button" onPress={() => setStep(0)}>
                      <Text style={s.back}>← Back to your details</Text>
                    </Pressable>
                  </>
                )}
                {step === 2 && (
                  <>
                    <Text style={s.eyebrow}>02 / DOCUMENT ASSESSMENT</Text>
                    <Text style={s.title}>
                      A clear picture.{"\n"}A considered check.
                    </Text>
                    <Text style={s.subtitle}>
                      Upload your {category.documentLabel.toLowerCase()}. Keep
                      all corners visible and avoid glare. The document should
                      belong to {travelerName}.
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      onPress={pickDocument}
                      style={s.upload}
                    >
                      <Text style={s.uploadIcon}>{document ? "✓" : "↥"}</Text>
                      <Text style={s.cardTitle}>
                        {document
                          ? document.name
                          : `Choose your ${category.documentLabel.toLowerCase()}`}
                      </Text>
                      <Text style={s.smallText}>
                        {document
                          ? "Document ready · Tap to replace"
                          : "PNG, JPG or WebP · Up to 5 MB"}
                      </Text>
                    </Pressable>
                    {document && (
                      <Image
                        accessibilityLabel="Selected document preview"
                        source={{
                          uri: `data:${document.mimeType};base64,${document.base64}`,
                        }}
                        resizeMode="contain"
                        style={{
                          width: "100%",
                          height: 180,
                          marginTop: 12,
                          borderRadius: 6,
                          backgroundColor: C.cream,
                        }}
                      />
                    )}
                    <View style={s.modeRow}>
                      {(["demo", "ai"] as const).map((item) => (
                        <Pressable
                          accessibilityRole="radio"
                          accessibilityState={{ checked: mode === item }}
                          key={item}
                          onPress={() => {
                            setMode(item);
                            setConsent(false);
                          }}
                          style={[s.mode, mode === item && s.modeActive]}
                        >
                          <Text
                            style={[
                              s.modeText,
                              mode === item && { color: C.green },
                            ]}
                          >
                            {item === "demo"
                              ? "Demonstration"
                              : "AI-assisted check"}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                    <Text style={s.modeExplanation}>
                      {mode === "demo"
                        ? "A simulated outcome to explore the experience. No document authenticity assessment is performed."
                        : "Your document will be sent to the configured AI provider to assess readability, visible fields and consistency. AI cannot guarantee authenticity."}
                    </Text>
                    {mode === "demo" && (
                      <View style={s.scenarios}>
                        {(["verified", "review", "rejected"] as const).map(
                          (item) => (
                            <Pressable
                              accessibilityRole="button"
                              key={item}
                              onPress={() => setScenario(item)}
                              style={[
                                s.scenario,
                                scenario === item && {
                                  borderColor: C.green,
                                  backgroundColor: C.mint,
                                },
                              ]}
                            >
                              <Text style={s.smallText}>
                                {item === "verified"
                                  ? "Positive result"
                                  : item === "review"
                                    ? "Needs review"
                                    : "Action required"}
                              </Text>
                            </Pressable>
                          ),
                        )}
                      </View>
                    )}
                    <Pressable
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: consent }}
                      onPress={() => setConsent(!consent)}
                      style={s.consent}
                    >
                      <View
                        style={[
                          s.checkbox,
                          consent && {
                            backgroundColor: C.green,
                            borderColor: C.green,
                          },
                        ]}
                      >
                        <Text style={{ color: "#fff" }}>
                          {consent ? "✓" : ""}
                        </Text>
                      </View>
                      <Text style={s.consentText}>
                        {mode === "ai"
                          ? "I consent to UTN sharing this document with its configured AI provider for this assessment and returning the result to my travel partner."
                          : "I understand this is a demonstration result, and the selected outcome will be returned to my travel partner."}
                      </Text>
                    </Pressable>
                    <Button
                      disabled={
                        !consent || busy || (mode === "ai" && !document)
                      }
                      onPress={verify}
                    >
                      {busy
                        ? "Assessing your document…"
                        : mode === "demo"
                          ? "Run demonstration →"
                          : "Start document assessment →"}
                    </Button>
                    {busy && (
                      <View
                        style={{
                          backgroundColor: C.ink,
                          padding: 22,
                          borderRadius: 8,
                          marginTop: 10,
                        }}
                      >
                        <View style={s.processing}>
                          <ActivityIndicator color={C.gold} />
                          <Text
                            style={{
                              color: C.gold,
                              fontSize: 11,
                              letterSpacing: 2,
                            }}
                          >
                            {mode === "ai"
                              ? "DOCUMENT INTELLIGENCE"
                              : "DEMONSTRATION ENGINE"}
                          </Text>
                        </View>
                        <Text
                          style={{
                            color: "#d9e1d9",
                            fontSize: 13,
                            lineHeight: 22,
                          }}
                        >
                          {mode === "ai"
                            ? "Reading visible fields and assessing consistency with your traveler profile."
                            : "Preparing the explicitly selected sample outcome."}
                        </Text>
                        <Text
                          style={{
                            color: "#96aaa4",
                            fontSize: 10,
                            marginTop: 12,
                          }}
                        >
                          Identity · Document type · Issuer · Validity
                        </Text>
                      </View>
                    )}
                    <Pressable accessibilityRole="button" disabled={busy} onPress={() => setStep(1)}>
                      <Text style={s.back}>← Change document category</Text>
                    </Pressable>
                  </>
                )}
                {step === 3 && result && (
                  <>
                    <Text style={s.eyebrow}>03 / YOUR RESULT</Text>
                    <Text style={s.title}>
                      {verified
                        ? "A confident\nnext step."
                        : ["review", "manual_review", "needs_review"].includes(
                              verdict,
                            )
                          ? "A little more\nattention."
                          : "Let’s get your\ndocument ready."}
                    </Text>
                    <Text style={s.subtitle}>
                      {verified
                        ? "Your document check is complete. Your travel partner can now see the assessment result."
                        : "Your assessment needs attention. Review the findings below before continuing."}
                    </Text>
                    <View
                      style={[
                        s.credential,
                        !verified && { backgroundColor: "#283336" },
                      ]}
                    >
                      <View style={s.credentialTop}>
                        <Text style={s.credentialBrand}>UTN</Text>
                        <Text style={s.credentialMicro}>TRUSTED NETWORK</Text>
                        <Text style={s.credentialStar}>✧</Text>
                      </View>
                      <Text style={s.credentialLabel}>
                        {verified
                          ? "DOCUMENT ASSESSMENT CREDENTIAL"
                          : "DOCUMENT ASSESSMENT RESULT"}
                      </Text>
                      <Text style={s.credentialName}>{travelerName}</Text>
                      <Text style={s.credentialCategory}>
                        {category.title} · {category.documentLabel}
                      </Text>
                      <View style={s.credentialLine} />
                      <View style={s.credentialBottom}>
                        <View>
                          <Text style={s.credentialMicro}>ASSESSMENT</Text>
                          <Text style={s.credentialStatus}>
                            {verified
                              ? "✓ Verified"
                              : [
                                    "review",
                                    "manual_review",
                                    "needs_review",
                                  ].includes(verdict)
                                ? "◷ Review required"
                                : "! Action required"}
                          </Text>
                        </View>
                        <Text style={s.credentialId}>
                          {certificate?.certificateId ||
                            certificate?.id ||
                            result.caseId ||
                            "UTN assessment"}
                        </Text>
                      </View>
                      <Text style={s.credentialDisclaimer}>
                        {(result.mode || mode) === "demo"
                          ? "DEMONSTRATION · NOT A VALID CREDENTIAL"
                          : "AI-ASSISTED ASSESSMENT · NOT GOVERNMENT APPROVAL"}
                      </Text>
                    </View>
                    {(
                      result.findings ||
                      result.assessment?.findings ||
                      result.checks ||
                      []
                    ).map((finding: any, i: number) => (
                      <View key={i} style={s.finding}>
                        <Text style={s.findingIcon}>
                          {finding.passed === true
                            ? "✓"
                            : finding.passed === false
                              ? "!"
                              : "◇"}
                        </Text>
                        <View style={{ flex: 1 }}>
                          <Text style={s.cardTitle}>
                            {typeof finding === "string"
                              ? finding
                              : finding.label ||
                                finding.name ||
                                finding.check ||
                                finding.code ||
                                "Document finding"}
                          </Text>
                          {typeof finding === "object" && (
                            <Text style={s.smallText}>
                              {finding.message ||
                                finding.detail ||
                                finding.reason ||
                                finding.status ||
                                (finding.passed === true
                                  ? "Check passed"
                                  : finding.passed === false
                                    ? "Requires attention"
                                    : "")}
                            </Text>
                          )}
                        </View>
                      </View>
                    ))}
                    {result.extractedFields && (
                      <View
                        style={[
                          s.profileCard,
                          { marginTop: 20, backgroundColor: "#f5f8f3" },
                        ]}
                      >
                        <Text style={s.eyebrow}>{(result.mode || mode) === "demo" ? "DEMONSTRATION DATA" : "READ FROM YOUR DOCUMENT"}</Text>
                        <Text style={s.smallText}>
                          {(result.mode || mode) === "demo" ? "Sample fields for this demonstration. No AI document reading was performed." : "Visible evidence extracted by the AI model. Check it against your document."}
                        </Text>
                        {[
                          ["fullName", "Name"],
                          ["documentNumber", "Document number"],
                          ["issuingCountry", "Issuing country"],
                          ["expiryDate", "Expiry date"],
                        ].map(([key, label]) => (
                          <View key={key} style={s.detailRow}>
                            <Text style={s.smallText}>{label}</Text>
                            <Text style={s.detailValue}>
                              {result.extractedFields[key] || "Not readable"}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}
                    {(result.concerns || []).map(
                      (concern: string, i: number) => (
                        <Text key={`concern-${i}`} style={s.note}>
                          {concern}
                        </Text>
                      ),
                    )}
                    {result.callbackDelivered === false && (
                      <Text style={s.note}>
                        Your assessment is saved. Delivery to your travel
                        partner is pending.
                      </Text>
                    )}
                    {!!result.summary && (
                      <Text style={s.note}>{result.summary}</Text>
                    )}
                    <Text style={s.privacy}>
                      This assessment is not a visa or government-issued
                      approval.{" "}
                      {(result.mode || mode) === "demo"
                        ? "No document authenticity assessment was performed."
                        : "Image assessment cannot establish authenticity with certainty."}
                    </Text>
                    {verified && certificate && (
                      <Button secondary onPress={exportCertificate}>
                        ↓ Save assessment credential
                      </Button>
                    )}
                    {!verified && (
                      <Button
                        secondary
                        onPress={() => {
                          setStep(2);
                          setConsent(false);
                        }}
                      >
                        Replace document & try again
                      </Button>
                    )}
                    <Button onPress={() => Linking.openURL(returnUrl)}>
                      Return to your booking ↗
                    </Button>
                  </>
                )}
                <View style={s.footer}>
                  <Text style={s.footerIcon}>◇</Text>
                  <Text style={s.footerText}>
                    Purposeful verification. Clear next steps.
                  </Text>
                </View>
              </>
            )}
          </View>
        </View>
        <View style={s.bottomBar}>
          <Text style={s.bottomText}>UTN · UMRAH TRUSTED NETWORK</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 20 }}>
            <Pressable accessibilityRole="link" accessibilityLabel="Integration guide: connect your OTA to UTN" onPress={() => Linking.openURL('https://utn-staging.com/sandbox.html')}><Text style={[s.bottomText, { color: C.green, textDecorationLine: 'underline', fontSize: 12 }]}>Integration guide ↗</Text></Pressable>
            <Pressable accessibilityRole="link" accessibilityLabel="View UTN sandbox source on GitHub" onPress={() => Linking.openURL('https://github.com/manasikservicesllc-sudo/utn-sandbox')}><Text style={[s.bottomText, { color: C.green, textDecorationLine: 'underline', fontSize: 12 }]}>GitHub ↗</Text></Pressable>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.cream },
  page: { padding: 24, paddingTop: 0 },
  nav: {
    maxWidth: 1360,
    width: "100%",
    alignSelf: "center",
    minHeight: 104,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  brand: { flexDirection: "row", gap: 11, alignItems: "center" },
  brandMark: {
    width: 40,
    height: 44,
    borderWidth: 1,
    borderColor: C.green,
    borderRadius: 18,
    borderTopLeftRadius: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  markText: { fontSize: 33, color: C.green, fontFamily: "Georgia" },
  brandName: {
    fontSize: 23,
    letterSpacing: 5,
    color: C.ink,
    fontWeight: "700",
  },
  brandSub: { fontSize: 7, letterSpacing: 1.9, color: C.muted, marginTop: 2 },
  navRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
    flexShrink: 1,
  },
  navCaption: { color: C.muted, fontSize: 11, flexShrink: 1 },
  prototype: {
    borderWidth: 1,
    borderColor: "#d9d9ce",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  prototypeText: { color: C.muted, fontSize: 9, letterSpacing: 1 },
  layout: {
    maxWidth: 1360,
    width: "100%",
    alignSelf: "center",
    flexDirection: "row",
    backgroundColor: C.white,
    borderRadius: 8,
    overflow: "hidden",
    minHeight: 760,
  },
  editorial: {
    width: "42%",
    backgroundColor: C.ink,
    padding: 48,
    minHeight: 850,
    overflow: "hidden",
  },
  label: { fontSize: 9, letterSpacing: 3, color: C.gold, fontWeight: "600" },
  heroTitle: {
    color: "#f8f6ed",
    fontFamily: "Georgia",
    fontSize: 62,
    lineHeight: 69,
    letterSpacing: -2,
    marginTop: 46,
  },
  heroDescription: {
    color: "#a9b9b7",
    lineHeight: 26,
    fontSize: 14,
    marginTop: 24,
  },
  orbitOne: {
    position: "absolute",
    width: 500,
    height: 640,
    borderWidth: 1,
    borderColor: "#314348",
    borderRadius: 260,
    left: 60,
    top: 240,
    transform: [{ rotate: "-25deg" }],
  },
  orbitTwo: {
    position: "absolute",
    width: 430,
    height: 570,
    borderWidth: 1,
    borderColor: "#2c4146",
    borderRadius: 240,
    left: 95,
    top: 275,
    transform: [{ rotate: "-25deg" }],
  },
  seal: {
    alignSelf: "center",
    marginTop: 70,
    marginBottom: 65,
    height: 178,
    width: 178,
    borderRadius: 89,
    borderWidth: 1,
    borderColor: "#6b776a",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#182c33",
  },
  sealStar: { color: C.gold, fontSize: 36 },
  sealTitle: {
    color: "#d6c7a4",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 21,
    letterSpacing: 3,
  },
  sealFoot: { color: "#8e9c94", fontSize: 8, letterSpacing: 3, marginTop: 12 },
  editorialBottom: { marginTop: "auto" },
  smallLine: {
    width: 35,
    height: 1,
    backgroundColor: C.gold,
    marginBottom: 22,
  },
  editorialQuote: {
    color: "#dae0d7",
    fontFamily: "Georgia",
    fontSize: 20,
    lineHeight: 30,
  },
  editorialFine: { color: "#849895", fontSize: 10, marginTop: 20 },
  content: { flex: 1, minWidth: 0, padding: 48, paddingTop: 36 },
  progress: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 4,
    marginBottom: 42,
    borderBottomWidth: 1,
    borderColor: C.line,
    paddingBottom: 24,
  },
  progressItem: { alignItems: "center", gap: 8 },
  dot: {
    height: 25,
    width: 25,
    borderRadius: 20,
    backgroundColor: "#f0f2ec",
    alignItems: "center",
    justifyContent: "center",
  },
  activeDot: { backgroundColor: C.green },
  dotText: { fontSize: 10, color: C.muted },
  progressText: { color: C.muted, fontSize: 9 },
  eyebrow: {
    color: C.green,
    letterSpacing: 2,
    fontSize: 10,
    fontWeight: "700",
    marginBottom: 15,
  },
  title: {
    fontFamily: "Georgia",
    fontSize: 42,
    lineHeight: 49,
    letterSpacing: -1,
    color: C.ink,
  },
  subtitle: {
    color: C.muted,
    fontSize: 13,
    lineHeight: 22,
    marginTop: 17,
    marginBottom: 26,
  },
  profileCard: {
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 8,
    padding: 22,
  },
  profileHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingBottom: 20,
    marginBottom: 10,
    borderBottomWidth: 1,
    borderColor: C.line,
  },
  avatar: {
    height: 42,
    width: 42,
    backgroundColor: C.mint,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontFamily: "Georgia", fontSize: 22, color: C.green },
  cardTitle: { fontSize: 13, fontWeight: "600", color: C.ink, lineHeight: 20 },
  smallText: { color: C.muted, fontSize: 11, lineHeight: 18 },
  connected: { color: C.green, fontSize: 23, marginLeft: "auto" },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 20,
    paddingVertical: 10,
  },
  detailValue: {
    color: C.ink,
    fontSize: 11,
    fontWeight: "500",
    textAlign: "right",
    flex: 1,
  },
  textLink: { color: C.green, fontSize: 10, marginTop: 14, lineHeight: 18 },
  callout: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    paddingVertical: 25,
  },
  calloutIcon: { color: C.green, fontSize: 26 },
  calloutText: { flex: 1, fontSize: 12, color: C.muted, lineHeight: 20 },
  button: {
    backgroundColor: C.green,
    borderRadius: 5,
    minHeight: 51,
    justifyContent: "center",
    alignItems: "center",
    padding: 14,
    marginBottom: 10,
  },
  buttonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },
  secondary: { backgroundColor: C.white, borderWidth: 1, borderColor: C.line },
  footer: {
    flexDirection: "row",
    gap: 7,
    justifyContent: "center",
    marginTop: 26,
    alignItems: "center",
  },
  footerIcon: { color: C.green, fontSize: 16 },
  footerText: { color: C.muted, fontSize: 10 },
  bottomBar: {
    width: "100%",
    maxWidth: 1360,
    alignSelf: "center",
    paddingVertical: 25,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 10,
  },
  bottomText: { fontSize: 9, color: C.muted, letterSpacing: 0.5 },
  categoryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  category: {
    width: "48%",
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 6,
    padding: 15,
    minHeight: 118,
  },
  categorySelected: { backgroundColor: "#f0f6f1", borderColor: C.green },
  categoryTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  categoryIcon: { color: C.green, fontSize: 21 },
  radio: { color: C.green },
  categoryTitle: { color: C.ink, fontSize: 12, fontWeight: "600" },
  categoryDescription: {
    color: C.muted,
    fontSize: 10,
    lineHeight: 16,
    marginTop: 6,
  },
  required: {
    backgroundColor: C.cream,
    padding: 15,
    borderRadius: 5,
    marginVertical: 20,
    gap: 4,
  },
  back: { textAlign: "center", fontSize: 11, color: C.muted, padding: 12 },
  upload: {
    borderWidth: 1,
    borderColor: "#abc3b7",
    borderStyle: "dashed",
    backgroundColor: "#f6f9f5",
    borderRadius: 7,
    padding: 28,
    alignItems: "center",
    gap: 10,
  },
  uploadIcon: { color: C.green, fontSize: 31 },
  modeRow: {
    flexDirection: "row",
    backgroundColor: C.cream,
    borderRadius: 5,
    padding: 4,
    marginTop: 24,
  },
  mode: { flex: 1, paddingVertical: 12, alignItems: "center", borderRadius: 4 },
  modeActive: { backgroundColor: C.white },
  modeText: { color: C.muted, fontSize: 11, fontWeight: "600" },
  modeExplanation: {
    color: C.muted,
    lineHeight: 19,
    fontSize: 11,
    marginVertical: 12,
  },
  scenarios: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  scenario: {
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: C.line,
  },
  consent: {
    flexDirection: "row",
    gap: 11,
    marginVertical: 22,
    alignItems: "flex-start",
  },
  checkbox: {
    height: 20,
    width: 20,
    borderWidth: 1,
    borderColor: "#b4bfb6",
    borderRadius: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  consentText: { flex: 1, fontSize: 11, lineHeight: 18, color: C.muted },
  privacy: { color: C.muted, fontSize: 10, lineHeight: 18, marginVertical: 18 },
  processing: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
    marginVertical: 12,
  },
  credential: {
    backgroundColor: C.green,
    borderRadius: 12,
    padding: 26,
    marginBottom: 20,
  },
  credentialTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 30,
  },
  credentialBrand: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: 4,
  },
  credentialMicro: { color: "#b7cabe", fontSize: 8, letterSpacing: 1.4 },
  credentialStar: { color: "#d8c293", fontSize: 30, marginLeft: "auto" },
  credentialLabel: {
    color: "#bacdbb",
    fontSize: 8,
    letterSpacing: 1.7,
    marginBottom: 10,
  },
  credentialName: { fontFamily: "Georgia", fontSize: 28, color: "#fff" },
  credentialCategory: { color: "#bbd1c4", fontSize: 10, marginTop: 9 },
  credentialLine: { height: 1, backgroundColor: "#598271", marginVertical: 22 },
  credentialBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: 10,
  },
  credentialStatus: { color: "#fff", fontSize: 15, marginTop: 7 },
  credentialId: {
    color: "#c6d8ca",
    fontSize: 8,
    maxWidth: 150,
    textAlign: "right",
  },
  credentialDisclaimer: {
    color: "#daceaa",
    fontSize: 7,
    letterSpacing: 1,
    marginTop: 25,
  },
  finding: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: C.line,
  },
  findingIcon: { color: C.green, fontSize: 20 },
  error: {
    backgroundColor: "#fff1ed",
    color: C.red,
    fontSize: 12,
    lineHeight: 19,
    padding: 15,
    borderRadius: 5,
    marginBottom: 20,
  },
  note: {
    backgroundColor: C.cream,
    color: C.muted,
    fontSize: 12,
    lineHeight: 20,
    padding: 15,
    marginBottom: 15,
  },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  empty: { paddingTop: 70 },
});
