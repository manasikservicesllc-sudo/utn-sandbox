import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  Check,
  ChevronDown,
  ShieldCheck,
  Plane,
  MapPin,
  CalendarDays,
  Users,
  Star,
  Car,
  Building2,
  Globe2,
  Menu,
  X,
  Plus,
  Trash2,
  LockKeyhole,
  CheckCircle2,
  Clock3,
  FileJson,
  Sparkles,
  Copy,
  RefreshCw,
} from "lucide-react";
import {
  countries,
  emptyTraveler,
  sampleTraveler,
  packages,
  makePayload,
  type Traveler,
  type Package,
} from "./contract";
const API =
  (import.meta as any).env.VITE_OTA_API_URL || "http://localhost:4100";
const UTN =
  (import.meta as any).env.VITE_UTN_WEB_URL || "http://localhost:8081";
const money = (v: number) =>
  new Intl.NumberFormat("en-SA", { maximumFractionDigits: 0 }).format(v);
function Seal() {
  return (
    <span className="seal">
      <ShieldCheck size={22} />
    </span>
  );
}
type Booking = {
  id: string;
  accessToken: string;
  status: string;
  invitations: any[];
  [key: string]: any;
};
const labels: Record<string, string> = {
  verified: "Document check complete",
  pending: "Awaiting verification",
  pending_verification: "Awaiting verification",
  action_required: "Action required",
  needs_review: "Review required",
  rejected: "Action required",
  not_required: "Verification not required",
};
export default function App() {
  const [page, setPage] = useState<"discover" | "checkout" | "confirmation">(
    "discover",
  );
  const [step, setStep] = useState(0);
  const [pkg, setPkg] = useState<Package>(packages[1]);
  const [service, setService] = useState("utn");
  const [travelers, setTravelers] = useState<Traveler[]>([emptyTraveler()]);
  const [active, setActive] = useState(0);
  const [signed, setSigned] = useState(false);
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [booking, setBooking] = useState<Booking | null>(null);
  const [showPayload, setShowPayload] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [departure, setDeparture] = useState("2026-11-15");
  const [origin, setOrigin] = useState("Dubai, UAE");
  const [filter, setFilter] = useState("all");
  const requestId = useRef(Math.floor(Date.now() / 1000));
  const idempotencyKey = useRef(crypto.randomUUID());
  const [copied, setCopied] = useState(false);
  const total = (pkg.price + (service === "utn" ? 150 : 0)) * travelers.length;
  const payload = makePayload(
    travelers,
    pkg,
    service,
    departure,
    origin,
    requestId.current,
  );
  const go = (s: number) => {
    setStep(s);
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  useEffect(() => {
    try {
      const saved =
        sessionStorage.getItem("manasik-booking") ||
        localStorage.getItem("manasik-booking-access");
      if (saved) {
        setBooking(JSON.parse(saved));
        setPage("confirmation");
      }
    } catch {}
  }, []);
  useEffect(() => {
    if (!booking) return;
    const refresh = async () => {
      try {
        const r = await fetch(`${API}/api/bookings/${booking.id}`, {
          headers: { Authorization: `Bearer ${booking.accessToken}` },
        });
        if (r.ok) {
          const b = await r.json();
          setBooking((old) => ({
            ...old!,
            ...b,
            accessToken: old!.accessToken,
          }));
        }
      } catch {}
    };
    refresh();
    const timer = setInterval(refresh, 4000);
    return () => clearInterval(timer);
  }, [booking?.id]);
  const select = (p: Package) => {
    setPkg(p);
    setPage("checkout");
    go(signed ? 1 : 0);
  };
  const update = (key: string, val: string) =>
    setTravelers((ts) =>
      ts.map((t, i) => (i === active ? { ...t, [key]: val } : t)),
    );
  const fillDemo = () => {
    setTravelers((ts) => ts.map((_, i) => sampleTraveler(i)));
    setEmail("guest@example.com");
  };
  const submit = async () => {
    setError("");
    setBusy(true);
    try {
      const r = await fetch(`${API}/api/bookings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey.current,
        },
        body: JSON.stringify(payload),
      });
      const b = await r.json();
      if (!r.ok)
        throw new Error(
          b.error?.message ||
            b.error ||
            "Unable to create this booking. Please try again.",
        );
      setBooking(b);
      sessionStorage.setItem("manasik-booking", JSON.stringify(b));
      localStorage.setItem(
        "manasik-booking-access",
        JSON.stringify({
          id: b.id,
          accessToken: b.accessToken,
          status: b.status,
          invitations: [],
        }),
      );
      setPage("confirmation");
      window.scrollTo(0, 0);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const input = (
    key: string,
    label: string,
    type = "text",
    required = true,
    options?: string[][],
  ) => (
    <label className="field" key={key}>
      <span>
        {label}
        {required && <b> *</b>}
      </span>
      {options ? (
        <select
          required={required}
          value={travelers[active][key]}
          onChange={(e) => update(key, e.target.value)}
        >
          <option value="">Select {label.toLowerCase()}</option>
          {options.map(([value, name]) => (
            <option key={value} value={value}>
              {name}
            </option>
          ))}
        </select>
      ) : (
        <input
          dir={key.endsWith("Ar") ? "rtl" : undefined}
          required={required}
          type={type}
          value={travelers[active][key]}
          onChange={(e) => update(key, e.target.value)}
          maxLength={key === "passportNumber" ? 15 : undefined}
          max={
            ["birthDate", "passportIssueDate"].includes(key)
              ? new Date().toISOString().slice(0, 10)
              : undefined
          }
          min={key === "passportExpiryDate" ? departure : undefined}
        />
      )}
    </label>
  );
  const saveTraveler = (e: React.FormEvent) => {
    e.preventDefault();
    const t = travelers[active];
    if (new Date(t.passportIssueDate) >= new Date(t.passportExpiryDate)) {
      setError("Passport expiry must be after its issue date.");
      return;
    }
    if (
      travelers.some(
        (x, i) =>
          i !== active &&
          x.passportNumber &&
          x.passportNumber === t.passportNumber,
      )
    ) {
      setError("Each traveler must have a different passport number.");
      return;
    }
    if (active < travelers.length - 1) {
      setActive(active + 1);
      window.scrollTo(0, 0);
    } else if (travelers.some((t) => !t.firstNameEn || !t.passportNumber)) {
      setActive(
        travelers.findIndex((t) => !t.firstNameEn || !t.passportNumber),
      );
      setError("Complete each traveler before continuing.");
    } else go(3);
  };
  return (
    <>
      <div className="presentation-bar">
        <span>
          <span className="live-dot" /> MANASIK × UTN
        </span>
        <span>
          AN INTERCONNECTED UMRAH EXPERIENCE <i>•</i> EXECUTIVE PROTOTYPE
        </span>
        <span>01 / JOURNEY</span>
      </div>
      <header className={page === "discover" ? "header over-hero" : "header"}>
        <button
          className="brand"
          onClick={() => {
            setPage("discover");
            setMobileMenu(false);
          }}
          aria-label="Manasik home"
        >
          <svg viewBox="0 0 44 48">
            <path d="M4 43V17L22 4l18 13v26M12 43V22l10-8 10 8v21M20 43V28l2-2 2 2v17" />
          </svg>
          <span>
            manasik<small>JOURNEYS WITH MEANING</small>
          </span>
        </button>
        <nav className={mobileMenu ? "open" : ""}>
          <button
            onClick={() => {
              setPage("discover");
              setMobileMenu(false);
              setTimeout(
                () =>
                  document
                    .getElementById("journeys")
                    ?.scrollIntoView({ behavior: "smooth" }),
                10,
              );
            }}
          >
            Umrah journeys
          </button>
          <button
            onClick={() => {
              setPage("discover");
              setMobileMenu(false);
              setTimeout(
                () =>
                  document
                    .getElementById("trust")
                    ?.scrollIntoView({ behavior: "smooth" }),
                10,
              );
            }}
          >
            The UTN experience <ArrowUpRight size={13} />
          </button>
        </nav>
        <div className="header-end">
          <span className="currency">
            <Globe2 size={15} /> EN <span>/</span> SAR
          </span>
          <button
            className="account"
            onClick={() => {
              if (booking) setPage("confirmation");
              else {
                setPage("checkout");
                go(0);
              }
            }}
          >
            {booking ? "My journey" : signed ? "My account" : "Sign in"}{" "}
            <ArrowUpRight size={15} />
          </button>
          <button
            className="mobile-toggle"
            aria-label="Open navigation"
            onClick={() => setMobileMenu(!mobileMenu)}
          >
            <Menu />
          </button>
        </div>
      </header>
      {page === "discover" ? (
        <main>
          <section className="hero">
            <div className="hero-image" />
            <div className="hero-copy">
              <div className="eyebrow light">
                <span /> A JOURNEY BEYOND THE ORDINARY
              </div>
              <h1>
                Closer to what
                <br />
                truly <em>matters.</em>
              </h1>
              <p>
                Your Umrah, thoughtfully brought together.
                <br />
                Exceptional stays. Seamless journeys. Peace of mind.
              </p>
              <a href="#journeys" className="hero-link">
                Discover your journey <ArrowDown />
              </a>
            </div>
            <div className="hero-caption">
              <MapPin size={14} /> MAKKAH AL MUKARRAMAH{" "}
              <span>21.4225° N · 39.8262° E</span>
            </div>
            <div className="hero-side">
              BEGIN WITH INTENTION — TRAVEL WITH CONFIDENCE
            </div>
          </section>
          <section className="search-wrap">
            <div className="search-card">
              <label>
                <span>
                  <Plane size={14} /> TRAVELING FROM
                </span>
                <select
                  value={origin}
                  onChange={(e) => setOrigin(e.target.value)}
                >
                  <option>Dubai, UAE</option>
                  <option>Doha, Qatar</option>
                  <option>Islamabad, Pakistan</option>
                  <option>Cairo, Egypt</option>
                  <option>London, UK</option>
                </select>
              </label>
              <label>
                <span>
                  <MapPin size={14} /> YOUR DESTINATION
                </span>
                <strong>Makkah & the sacred journey</strong>
              </label>
              <label>
                <span>
                  <CalendarDays size={14} /> DEPARTURE
                </span>
                <input
                  type="date"
                  min={new Date().toISOString().slice(0, 10)}
                  value={departure}
                  onChange={(e) => setDeparture(e.target.value)}
                />
              </label>
              <label>
                <span>
                  <Users size={14} /> TRAVELERS
                </span>
                <select
                  value={travelers.length}
                  onChange={(e) =>
                    setTravelers(
                      Array.from(
                        { length: Number(e.target.value) },
                        (_, i) => travelers[i] || emptyTraveler(),
                      ),
                    )
                  }
                >
                  {[1, 2, 3, 4].map((n) => (
                    <option key={n} value={n}>
                      {n} {n === 1 ? "traveler" : "travelers"}
                    </option>
                  ))}
                </select>
              </label>
              <a
                href="#journeys"
                className="search-button"
                aria-label="Explore journeys"
              >
                <ArrowRight />
              </a>
            </div>
            <div className="search-note">
              <ShieldCheck size={15} />
              <span>
                A connected journey, with UTN document verification available.
              </span>
              <span className="right-note">DESIGNED AROUND YOU</span>
            </div>
          </section>
          <section id="journeys" className="journeys section-shell">
            <div className="section-top">
              <div>
                <div className="eyebrow">THE UMRAH COLLECTION</div>
                <h2>
                  Every journey is personal.
                  <br />
                  <em>Find yours.</em>
                </h2>
              </div>
              <p>
                Considered details. Exceptional places.
                <br />
                Choose the experience that feels right for you.
              </p>
            </div>
            <div className="collection-toolbar">
              <div className="tabs">
                {[
                  ["all", "All journeys"],
                  ["premium", "Premium stays"],
                  ["private", "Private collection"],
                ].map(([id, name]) => (
                  <button
                    key={id}
                    className={filter === id ? "active" : ""}
                    onClick={() => setFilter(id)}
                  >
                    {name}
                  </button>
                ))}
              </div>
              <span>
                CURATED FOR YOUR UMRAH <span className="tiny-star">✦</span>
              </span>
            </div>
            <div className="package-grid">
              {packages
                .filter(
                  (p) =>
                    filter === "all" ||
                    (filter === "premium"
                      ? p.stars === 5
                      : p.id === "sanctuary"),
                )
                .map((p, i) => (
                  <article
                    className={`package-card ${p.id === "signature" ? "signature" : ""}`}
                    key={p.id}
                  >
                    <div className={`package-photo photo-${p.id}`}>
                      <img
                        src="/makkah-hero.png"
                        alt="Illustrative evening view of the sacred mosque in Makkah"
                      />
                      <span className="package-tag">{p.tag}</span>
                      <span className="photo-bottom">
                        <MapPin size={13} /> MAKKAH{" "}
                        <span>{p.nights} NIGHTS</span>
                      </span>
                    </div>
                    <div className="package-content">
                      <div className="star-row">
                        {Array.from({ length: p.stars }, (_, i) => (
                          <Star size={11} key={i} fill="currentColor" />
                        ))}
                        <span>{p.stars}-star stay</span>
                      </div>
                      <h3>{p.name}</h3>
                      <p>{p.description}</p>
                      <div className="amenities">
                        <span>
                          <Building2 size={16} /> {p.stars}-star hotel
                        </span>
                        <span>
                          <Plane size={16} /> Flights
                        </span>
                        <span>
                          <Car size={16} />{" "}
                          {p.id === "serenity" ? "Shared" : "Private"}
                        </span>
                      </div>
                      <div className="card-bottom">
                        <div>
                          <small>FROM / PERSON</small>
                          <strong>
                            <span>SAR</span> {money(p.price)}
                          </strong>
                        </div>
                        <button
                          aria-label={`Select ${p.name}`}
                          onClick={() => select(p)}
                        >
                          <ArrowUpRight size={22} />
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
            </div>
            <p className="collection-note">
              Illustrative packages and pricing for demonstration. No purchase
              or reservation is made.
            </p>
          </section>
          <section id="trust" className="trust-section section-shell">
            <div className="trust-art">
              <div className="orbit one" />
              <div className="orbit two" />
              <div className="trust-pass">
                <div className="trust-pass-top">
                  <Seal />
                  <span>
                    UTN<small>TRUSTED NETWORK</small>
                  </span>
                  <span className="chip">DEMO</span>
                </div>
                <div className="credential-lines" />
                <small>TRAVEL WITH CONFIDENCE</small>
                <h3>
                  Your journey.
                  <br />
                  Connected by trust.
                </h3>
                <div className="trust-pass-foot">
                  <CheckCircle2 size={17} /> A PERSONAL VERIFICATION EXPERIENCE
                </div>
              </div>
            </div>
            <div className="trust-copy">
              <div className="eyebrow">INTRODUCING UTN TRUSTED NETWORK</div>
              <h2>
                A little reassurance.
                <br />
                <em>For a meaningful journey.</em>
              </h2>
              <p>
                Choose a UTN-connected service and continue your document check
                in your personal UTN app. Your details move with you, so you can
                focus on the journey ahead.
              </p>
              <div className="trust-points">
                <span>
                  <Check />
                  One connected experience
                </span>
                <span>
                  <Check />
                  Your personal document check
                </span>
                <span>
                  <Check />A credential returned to your booking
                </span>
              </div>
              <button className="text-link" onClick={() => select(packages[1])}>
                Explore a connected journey <ArrowRight size={17} />
              </button>
            </div>
          </section>
        </main>
      ) : page === "checkout" ? (
        <main className="checkout section-shell">
          <button
            className="back-link"
            onClick={() => (step ? go(step - 1) : setPage("discover"))}
          >
            <ArrowLeft size={15} /> {step ? "Back" : "Back to journeys"}
          </button>
          <div className="checkout-heading">
            <div className="eyebrow">YOUR JOURNEY, THOUGHTFULLY ARRANGED</div>
            <h1>
              {
                [
                  "Welcome to your journey.",
                  "The details that make a difference.",
                  "Every traveler. Every detail.",
                  "One last look before you begin.",
                ][step]
              }
            </h1>
          </div>
          <div className="steps">
            {[
              "Your account",
              "Essential services",
              "Traveler details",
              "Review & connect",
            ].map((label, i) => (
              <div
                className={step === i ? "current" : step > i ? "complete" : ""}
                key={label}
              >
                <span>
                  {step > i ? (
                    <Check size={13} />
                  ) : (
                    String(i + 1).padStart(2, "0")
                  )}
                </span>
                {label}
              </div>
            ))}
          </div>
          <div className="checkout-layout">
            <div className="checkout-main">
              {step === 0 ? (
                <section className="surface signin">
                  <span className="section-icon">
                    <LockKeyhole />
                  </span>
                  <h2>A more personal experience.</h2>
                  <p>
                    Sign in to keep your journey and your verification together.
                  </p>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      setSigned(true);
                      go(1);
                    }}
                  >
                    <label className="field">
                      <span>Email address</span>
                      <input
                        required
                        type="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </label>
                    <button className="primary">
                      Continue with demo account <ArrowRight size={17} />
                    </button>
                  </form>
                  <div className="soft-note">
                    Prototype sign-in. No password, email, or real account is
                    created.
                  </div>
                </section>
              ) : null}
              {step === 1 ? (
                <section className="surface">
                  <div className="eyebrow">01 / ESSENTIAL UMRAH SERVICES</div>
                  <h2>Care, from arrival to departure.</h2>
                  <p className="muted">
                    Select the ground service experience for every traveler in
                    your booking.
                  </p>
                  <button
                    className={`service-option ${service === "essential" ? "selected" : ""}`}
                    onClick={() => setService("essential")}
                  >
                    <span className="radio">
                      {service === "essential" && <span />}
                    </span>
                    <div>
                      <span className="micro">THE ESSENTIALS</span>
                      <h3>Essential Service</h3>
                      <p>
                        Airport welcome, departure assistance, and local support
                        throughout your journey.
                      </p>
                      <span className="service-price">
                        Included in your package
                      </span>
                    </div>
                  </button>
                  <button
                    className={`service-option elevated ${service === "utn" ? "selected" : ""}`}
                    onClick={() => setService("utn")}
                  >
                    <span className="radio">
                      {service === "utn" && <span />}
                    </span>
                    <div>
                      <span className="micro">
                        A CONNECTED EXPERIENCE <ShieldCheck size={14} />
                      </span>
                      <h3>Essential + UTN Trusted Network</h3>
                      <p>
                        All essential services, with a personal document
                        assessment and a UTN digital credential.
                      </p>
                      <div className="verification-label">
                        <Clock3 size={14} /> Verification required after booking
                      </div>
                      <span className="service-price">
                        + SAR 150 <small>/ traveler</small>
                      </span>
                    </div>
                    <Seal />
                  </button>
                  <div className="next-action">
                    <button className="primary" onClick={() => go(2)}>
                      Continue to traveler details <ArrowRight size={17} />
                    </button>
                  </div>
                </section>
              ) : null}
              {step === 2 ? (
                <form className="surface traveler-form" onSubmit={saveTraveler}>
                  <div className="form-top">
                    <div>
                      <div className="eyebrow">02 / YOUR TRAVELERS</div>
                      <h2>Tell us who’s joining.</h2>
                    </div>
                    <button
                      type="button"
                      className="demo-fill"
                      onClick={fillDemo}
                    >
                      <Sparkles size={15} /> Fill demo travelers
                    </button>
                  </div>
                  <div className="traveler-tabs">
                    {travelers.map((t, i) => (
                      <button
                        type="button"
                        key={i}
                        className={active === i ? "active" : ""}
                        onClick={() => setActive(i)}
                      >
                        <Users size={14} />
                        {t.firstNameEn || `Traveler ${i + 1}`}
                      </button>
                    ))}
                    {travelers.length < 4 && (
                      <button
                        type="button"
                        aria-label="Add traveler"
                        onClick={() => {
                          setTravelers([...travelers, emptyTraveler()]);
                          setActive(travelers.length);
                        }}
                      >
                        <Plus size={16} />
                      </button>
                    )}
                    {travelers.length > 1 && (
                      <button
                        type="button"
                        aria-label="Remove selected traveler"
                        onClick={() => {
                          setTravelers(
                            travelers.filter((_, i) => i !== active),
                          );
                          setActive(0);
                        }}
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                  <fieldset>
                    <legend>Identity & personal details</legend>
                    <div className="form-grid">
                      {input(
                        "nationalityId",
                        "Nationality",
                        "text",
                        true,
                        countries,
                      )}
                      {input(
                        "currentCountryId",
                        "Country of residence",
                        "text",
                        true,
                        countries,
                      )}
                      {input("firstNameEn", "First name (English)")}
                      {input("familyNameEn", "Family name (English)")}
                      {input(
                        "fatherNameEn",
                        "Father name (English)",
                        "text",
                        false,
                      )}
                      {input(
                        "grandFatherNameEn",
                        "Grandfather name (English)",
                        "text",
                        false,
                      )}
                      {input("firstNameAr", "First name (Arabic)")}
                      {input("familyNameAr", "Family name (Arabic)")}
                      {input(
                        "fatherNameAr",
                        "Father name (Arabic)",
                        "text",
                        false,
                      )}
                      {input(
                        "grandFatherNameAr",
                        "Grandfather name (Arabic)",
                        "text",
                        false,
                      )}
                      {input("gender", "Gender", "text", true, [
                        ["1", "Male"],
                        ["2", "Female"],
                      ])}
                      {input("maritalStatus", "Marital status", "text", true, [
                        ["1", "Single"],
                        ["2", "Married"],
                        ["3", "Divorced"],
                        ["4", "Widowed"],
                        ["5", "Other"],
                      ])}
                      {input("birthDate", "Date of birth", "date")}
                      {input(
                        "birthCountryId",
                        "Country of birth",
                        "text",
                        true,
                        countries,
                      )}
                      {input("birthCityName", "City of birth", "text", false)}
                    </div>
                  </fieldset>
                  <fieldset>
                    <legend>Passport details</legend>
                    <p className="field-help">
                      Enter your details exactly as they appear on your
                      passport.
                    </p>
                    <div className="form-grid">
                      {input("passportNumber", "Passport number")}
                      {input("passportTypeId", "Passport type", "text", true, [
                        ["1", "Normal"],
                        ["2", "Diplomatic"],
                        ["3", "Travel document"],
                        ["4", "UN passport"],
                      ])}
                      {input(
                        "passportIssuingCountryId",
                        "Issuing country",
                        "text",
                        true,
                        countries,
                      )}
                      {input("passportIssuingCity", "Issuing city")}
                      {input("passportIssueDate", "Issue date", "date")}
                      {input("passportExpiryDate", "Expiry date", "date")}
                    </div>
                  </fieldset>
                  <fieldset>
                    <legend>Residence & contact</legend>
                    <div className="form-grid">
                      {input(
                        "iqamaNo",
                        "Residence permit number",
                        "text",
                        false,
                      )}
                      {input(
                        "iqamaExpiryDate",
                        "Residence permit expiry",
                        "date",
                        false,
                      )}
                      {input("educationalLevel", "Education", "text", false, [
                        ["1", "Primary"],
                        ["2", "Secondary"],
                        ["3", "Diploma"],
                        ["4", "University"],
                        ["5", "Postgraduate"],
                      ])}
                      {input("profession", "Profession", "text", false)}
                      {input("emailAddress", "Email address", "email")}
                      {input("mobileNumber", "Phone with country code", "tel")}
                    </div>
                  </fieldset>
                  <div className="soft-note">
                    <LockKeyhole size={15} /> Document images for UTN are
                    requested in the next app, according to your category.
                  </div>
                  <button className="primary">
                    {active < travelers.length - 1
                      ? "Save & next traveler"
                      : "Review your journey"}{" "}
                    <ArrowRight size={17} />
                  </button>
                </form>
              ) : null}
              {step === 3 ? (
                <section className="surface review">
                  <div className="eyebrow">03 / READY FOR THE NEXT CHAPTER</div>
                  <h2>Your journey, at a glance.</h2>
                  <div className="review-row">
                    <span>Selected journey</span>
                    <strong>{pkg.name}</strong>
                  </div>
                  <div className="review-row">
                    <span>Departure</span>
                    <strong>
                      {departure} · {origin}
                    </strong>
                  </div>
                  <div className="review-row">
                    <span>Essential services</span>
                    <strong>
                      {service === "utn" ? "Essential + UTN" : "Essential"}
                    </strong>
                  </div>
                  {travelers.map((t, i) => (
                    <div className="review-person" key={i}>
                      <span className="avatar">
                        {t.firstNameEn[0]}
                        {t.familyNameEn[0]}
                      </span>
                      <div>
                        <strong>
                          {t.firstNameEn} {t.familyNameEn}
                        </strong>
                        <span>
                          {t.emailAddress} · Passport ending{" "}
                          {t.passportNumber.slice(-4)}
                        </span>
                      </div>
                      <button
                        aria-label={`Edit traveler ${i + 1}`}
                        onClick={() => {
                          setActive(i);
                          go(2);
                        }}
                      >
                        Edit
                      </button>
                    </div>
                  ))}
                  <label className="consent">
                    <input
                      type="checkbox"
                      checked={consent}
                      onChange={(e) => setConsent(e.target.checked)}
                    />
                    <span>
                      {service === "utn"
                        ? "I confirm these details and agree to share the booking and traveler details with UTN for the requested document assessment."
                        : "I confirm the traveler and booking details for this demonstration."}
                    </span>
                  </label>
                  <div className="soft-note">
                    Demonstration only. No payment is collected and no visa
                    application is sent.
                  </div>
                  <button
                    className="primary"
                    disabled={!consent || busy}
                    onClick={submit}
                  >
                    {busy
                      ? "Connecting your journey…"
                      : service === "utn"
                        ? "Confirm & connect to UTN"
                        : "Confirm demo booking"}
                    <ArrowRight size={17} />
                  </button>
                  <button
                    className="payload-toggle"
                    onClick={() => setShowPayload(!showPayload)}
                  >
                    <FileJson size={15} /> {showPayload ? "Hide" : "Inspect"}{" "}
                    integration payload <ChevronDown size={14} />
                  </button>
                  {showPayload && (
                    <pre className="payload">
                      {JSON.stringify(payload, null, 2)}
                    </pre>
                  )}
                </section>
              ) : null}
              {error && (
                <div role="alert" className="error">
                  {error}
                </div>
              )}
            </div>
            <aside className="booking-summary">
              <img src="/makkah-hero.png" alt="Illustrative Makkah panorama" />
              <div className="summary-content">
                <span className="micro">YOUR SELECTED JOURNEY</span>
                <h3>{pkg.name}</h3>
                <div className="summary-detail">
                  <CalendarDays size={16} />
                  {pkg.nights} nights in Makkah
                </div>
                <div className="summary-detail">
                  <Users size={16} />
                  {travelers.length}{" "}
                  {travelers.length === 1 ? "traveler" : "travelers"}
                </div>
                <div className="summary-detail">
                  <Building2 size={16} />
                  {pkg.stars}-star accommodation
                </div>
                <div className="summary-detail">
                  <Car size={16} />
                  {pkg.transport}
                </div>
                <div className="summary-total">
                  <span>Journey total</span>
                  <strong>
                    <small>SAR</small> {money(total)}
                  </strong>
                  <small>Illustrative total · no payment required</small>
                </div>
                {service === "utn" && (
                  <div className="summary-utn">
                    <Seal />
                    <span>
                      Connected with UTN
                      <small>Verification after booking</small>
                    </span>
                  </div>
                )}
              </div>
            </aside>
          </div>
        </main>
      ) : (
        <main className="confirmation section-shell">
          <div className="confirmation-banner">
            <span className="success-icon">
              <Check size={28} />
            </span>
            <div className="eyebrow">YOUR NEXT CHAPTER STARTS HERE</div>
            <h1>
              Your journey is <em>connected.</em>
            </h1>
            <p>
              Booking request received.{" "}
              {booking?.invitations?.length
                ? "Your personal UTN experience is ready."
                : "Your demonstration booking is ready."}
            </p>
            <span className="booking-reference">
              BOOKING {booking?.id?.slice(0, 16).toUpperCase()}
            </span>
          </div>
          <div className="confirmation-grid">
            <section className="surface">
              <div className="eyebrow">YOUR TRAVELERS</div>
              <h2>A little reassurance, before you go.</h2>
              <p className="muted">
                {booking?.invitations?.length
                  ? "Continue to UTN to complete each traveler’s document assessment. Results will appear here automatically."
                  : "The selected essential service does not require a UTN assessment."}
              </p>
              {booking?.invitations?.map((inv: any, i: number) => {
                const state = inv.status || "pending";
                return (
                  <div className="invite-card" key={inv.id}>
                    <div className="invite-top">
                      <span className="avatar">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <div>
                        <h3>
                          {inv.applicantName ||
                            inv.name ||
                            booking.visaRequest?.mutamers?.[i]?.firstNameEn ||
                            `Traveler ${i + 1}`}
                        </h3>
                        <span className={`status ${state}`}>
                          <span />
                          {labels[state] || state}
                        </span>
                      </div>
                      <ShieldCheck className="invite-shield" />
                    </div>
                    <p>
                      {state === "verified"
                        ? "Your UTN result has arrived and is attached to this journey."
                        : "Your details are already with UTN. Choose your category and upload the relevant document."}
                    </p>
                    <a
                      className="primary"
                      href={
                        inv.webUrl ||
                        `${UTN}/?token=${encodeURIComponent(inv.token)}`
                      }
                      target="_blank"
                      rel="noreferrer"
                    >
                      {state === "verified"
                        ? "View UTN credential"
                        : "Continue to UTN"}
                      <ArrowUpRight size={17} />
                    </a>
                    <div className="invite-links">
                      <a href={inv.deepLink}>Open iOS app</a>
                      <button
                        onClick={async () => {
                          await navigator.clipboard.writeText(
                            inv.webUrl || `${UTN}/?token=${inv.token}`,
                          );
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                        }}
                      >
                        <Copy size={12} />
                        {copied ? "Copied" : "Copy invitation"}
                      </button>
                    </div>
                    {inv.certificate && (
                      <div className="soft-note">
                        <CheckCircle2 size={16} /> Credential{" "}
                        {inv.certificate.id} ·{" "}
                        {inv.certificate.mode === "demo"
                          ? "Demonstration"
                          : "AI-assisted"}
                      </div>
                    )}
                  </div>
                );
              })}
              <div className="notification-preview">
                <div className="eyebrow">YOUR UTN INVITATION</div>
                <h3>A warm welcome, wherever you are.</h3>
                <div className="notification-channels">
                  <span>SMS</span>
                  <span>WhatsApp</span>
                  <small>SIMULATED · NOT SENT</small>
                </div>
                <p dir="auto" style={{ whiteSpace: "pre-line", overflowWrap: "anywhere" }}>
                  {booking?.notifications?.[0]?.preview ||
                    "Welcome to UTN. Your personal document assessment is ready. Continue with the invitation above to begin."}
                </p>
                <small>
                  These are message previews. Live SMS and WhatsApp delivery
                  requires a connected messaging provider.
                </small>
              </div>
            </section>
            <aside className="connection-card">
              <Seal />
              <h3>
                Two experiences.
                <br />
                One seamless journey.
              </h3>
              <div className="connection-step">
                <span>
                  <Check size={14} />
                </span>
                <div>
                  <strong>Journey selected</strong>
                  <small>Your package and essential services</small>
                </div>
              </div>
              <div className="connection-step">
                <span>
                  <Check size={14} />
                </span>
                <div>
                  <strong>Details securely handed over</strong>
                  <small>
                    {booking?.invitations?.length
                      ? "OTA → UTN"
                      : "No UTN transfer required"}
                  </small>
                </div>
              </div>
              <div className="connection-step">
                <span>
                  {booking?.status === "verified" ? <Check size={14} /> : 3}
                </span>
                <div>
                  <strong>Document assessment</strong>
                  <small>
                    {labels[booking?.status || "pending"] || booking?.status}
                  </small>
                </div>
              </div>
              <div className="connection-step">
                <span>4</span>
                <div>
                  <strong>Your UTN credential</strong>
                  <small>Returned to your booking after verification</small>
                </div>
              </div>
              <p>
                A UTN assessment is not a visa or government-issued approval.
              </p>
              <button
                className="text-link"
                onClick={() => {
                  sessionStorage.removeItem("manasik-booking");
                  localStorage.removeItem("manasik-booking-access");
                  setBooking(null);
                  setPage("discover");
                  requestId.current = Math.floor(Date.now() / 1000);
                  idempotencyKey.current = crypto.randomUUID();
                  setConsent(false);
                }}
              >
                <RefreshCw size={14} /> Start another demonstration
              </button>
            </aside>
          </div>
        </main>
      )}
      <footer>
        <div className="footer-brand">
          manasik<span>JOURNEYS WITH MEANING</span>
        </div>
        <p>Thoughtfully connected. Personally considered.</p>
        <a href="/sandbox.html" className="text-link">
          Developer sandbox <ArrowUpRight size={14} />
        </a>
        <span>MANASIK × UTN · EXPERIENCE PROTOTYPE</span>
      </footer>
    </>
  );
}
function ArrowDown() {
  return <ArrowRight size={17} style={{ transform: "rotate(90deg)" }} />;
}
