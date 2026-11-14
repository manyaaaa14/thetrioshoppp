import { useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  browserLocalPersistence, browserSessionPersistence, createUserWithEmailAndPassword,
  GoogleAuthProvider, sendEmailVerification, sendPasswordResetEmail, setPersistence,
  signInWithEmailAndPassword, signInWithPopup, signOut, updateProfile, type User
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, LockKeyhole, Mail, Sparkles } from "lucide-react";
import { auth, db } from "./firebase";
import { firebaseErrorMessage } from "./firebaseErrors";
import type { CustomerProfile } from "./types";

type AuthMode = "login" | "signup" | "reset";
type Completion = { type: "verification"; email: string; sent: boolean } | { type: "reset"; email: string } | null;

const authImage = "https://images.unsplash.com/photo-1611652022419-a9419f74343d?auto=format&fit=crop&w=1400&q=88";

export function AuthPage({ onAuthenticated }: { onAuthenticated: (destination?: string) => void }) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [profile, setProfile] = useState<CustomerProfile>({
    fullName: "", mobile: "", email: "", roomNumber: "", deliveryAddress: ""
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [completion, setCompletion] = useState<Completion>(null);
  const [profileSaveFailed, setProfileSaveFailed] = useState(false);

  const updateProfileField = (field: keyof CustomerProfile, value: string) => {
    setProfile((current) => ({ ...current, [field]: value }));
  };

  function changeMode(next: AuthMode) {
    setMode(next);
    setError("");
    setSuccess("");
    setCompletion(null);
    setProfileSaveFailed(false);
  }

  async function persistSession() {
    await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setCompletion(null);
    setProfileSaveFailed(false);
    setBusy(true);

    try {
      if (mode === "reset") {
        await sendPasswordResetEmail(auth, email.trim());
        setCompletion({ type: "reset", email: email.trim() });
        setSuccess("If an account exists for this address, a password reset link is on its way.");
        return;
      }

      if (mode === "signup") {
        if (password !== confirmPassword) {
          setError("Your passwords do not match.");
          return;
        }
        if (!acceptedTerms) {
          setError("Please agree to the Terms and Conditions to create your account.");
          return;
        }
        const mobileDigits = profile.mobile.replace(/\D/g, "");
        if (mobileDigits.length < 10 || mobileDigits.length > 15) {
          setError("Enter a valid mobile number with 10 to 15 digits.");
          return;
        }

        await persistSession();
        const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
        const customer = { ...profile, fullName: profile.fullName.trim(), mobile: profile.mobile.trim(), email: email.trim(), roomNumber: profile.roomNumber.trim(), deliveryAddress: profile.deliveryAddress.trim() };
        try {
          await updateProfile(credential.user, { displayName: customer.fullName });
          await setDoc(doc(db, "users", credential.user.uid), customer);
        } catch (saveError) {
          setProfileSaveFailed(true);
          setError(`Your sign-in account was created, but your profile could not be saved. ${firebaseErrorMessage(saveError, "Try again from your profile after Firebase access is fixed.")}`);
          return;
        }

        try {
          await sendEmailVerification(credential.user);
          await signOut(auth);
          setCompletion({ type: "verification", email: customer.email, sent: true });
          setSuccess("Your account is ready. Verify your email before signing in.");
        } catch (verificationError) {
          setCompletion({ type: "verification", email: customer.email, sent: false });
          setError(`Your profile is saved, but we couldn't send the verification email. ${firebaseErrorMessage(verificationError, "Please try sending it again.")}`);
        }
        return;
      }

      await persistSession();
      const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
      if (!credential.user.emailVerified && credential.user.providerData.some((provider) => provider.providerId === "password")) {
        try {
          await sendEmailVerification(credential.user);
          await signOut(auth);
          setCompletion({ type: "verification", email: email.trim(), sent: true });
          setSuccess("Please verify your email using the link we sent before signing in.");
        } catch (verificationError) {
          setCompletion({ type: "verification", email: email.trim(), sent: false });
          setError(`Your email is not verified yet. ${firebaseErrorMessage(verificationError, "Please try sending the verification link again.")}`);
        }
        return;
      }
      onAuthenticated("/");
    } catch (submitError) {
      setError(firebaseErrorMessage(submitError, "We couldn't complete your request. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  async function signInWithGoogle() {
    setError("");
    setSuccess("");
    setCompletion(null);
    setProfileSaveFailed(false);
    setBusy(true);
    try {
      await persistSession();
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const credential = await signInWithPopup(auth, provider);
      const profileRef = doc(db, "users", credential.user.uid);
      const profileSnapshot = await getDoc(profileRef);
      let destination = "/";

      if (!profileSnapshot.exists()) {
        await setDoc(profileRef, {
          fullName: credential.user.displayName || "",
          mobile: "",
          email: credential.user.email || "",
          roomNumber: "",
          deliveryAddress: ""
        });
        destination = "/profile";
      } else {
        const data = profileSnapshot.data();
        if (!String(data.mobile || "").trim() || !String(data.roomNumber || "").trim() || !String(data.deliveryAddress || "").trim()) {
          destination = "/profile";
        }
      }
      onAuthenticated(destination);
    } catch (googleError) {
      setError(firebaseErrorMessage(googleError, "Google sign-in didn't finish. Please try again."));
      if (auth.currentUser) setProfileSaveFailed(true);
    } finally {
      setBusy(false);
    }
  }

  async function resendVerification() {
    const currentUser: User | null = auth.currentUser;
    if (!currentUser) {
      setError("Sign in again to request another verification link.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await sendEmailVerification(currentUser);
      await signOut(auth);
      setCompletion({ type: "verification", email: currentUser.email || email, sent: true });
      setSuccess("A fresh verification link has been sent. Check your inbox and spam folder.");
    } catch (resendError) {
      setError(firebaseErrorMessage(resendError, "We couldn't resend the verification link."));
    } finally {
      setBusy(false);
    }
  }

  const isSignup = mode === "signup";
  const isReset = mode === "reset";

  return (
    <main className="page-shell py-6 sm:py-10">
      <section className="auth-frame grid overflow-hidden rounded-[30px] border border-[#eee2df] bg-white shadow-[0_24px_80px_rgba(74,49,53,.12)] lg:min-h-[680px] lg:grid-cols-[.95fr_1.05fr]">
        <aside className="auth-visual relative flex min-h-[210px] flex-col justify-between overflow-hidden p-6 text-white sm:min-h-[250px] sm:p-9 lg:min-h-[680px] lg:p-12" style={{ backgroundImage: `linear-gradient(180deg,rgba(45,28,30,.1),rgba(45,28,30,.72)),url("${authImage}")` }}>
          <div className="relative z-10 flex items-center gap-3">
            <img src="/the-trio-shop-logo.jpeg" alt="The Trio Shop logo" className="h-12 w-12 rounded-full bg-white/90 object-contain p-1" />
            <div><p className="brand-serif text-sm font-bold tracking-[.13em]">THE TRIO SHOP</p><p className="text-xs text-white/75">Jewellery & accessories</p></div>
          </div>
          <div className="relative z-10 mt-10 max-w-md">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[.17em] backdrop-blur"><Sparkles size={13} /> A little sparkle, just for you</span>
            <h1 className="brand-serif mt-5 text-3xl leading-tight sm:text-4xl lg:text-5xl">Pieces that feel like <em>you.</em></h1>
            <p className="mt-4 max-w-sm text-sm leading-6 text-white/80">Discover thoughtful jewellery, made easy to find and delivered right to your hostel room.</p>
            <div className="mt-7 hidden items-center gap-3 text-xs text-white/75 sm:flex"><span className="grid h-8 w-8 place-items-center rounded-full border border-white/30"><Check size={15} /></span> Your personal edit, always within reach</div>
          </div>
        </aside>

        <div className="auth-content flex items-center justify-center px-5 py-8 sm:px-10 sm:py-12 lg:px-14">
          <div className="auth-enter w-full max-w-[440px]">
            {completion ? (
              <div aria-live="polite">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#f7ecee] text-[#8a5867]"><Check size={22} /></span>
                <p className="mt-6 text-xs font-bold uppercase tracking-[.18em] text-[#a16c71]">{completion.type === "reset" ? "PASSWORD RESET" : "CHECK YOUR INBOX"}</p>
                <h2 className="brand-serif mt-2 text-3xl font-semibold text-[#352a2d]">{completion.type === "reset" ? "One step to a fresh start." : "You’re almost there."}</h2>
                <p className="mt-3 text-sm leading-6 text-stone-600">{success}</p>
                <p className="mt-4 rounded-2xl bg-[#fcf8f7] p-4 text-sm text-stone-600">{completion.type === "reset" || completion.sent ? <>We sent instructions to <strong className="break-all text-[#49393c]">{completion.email}</strong>. If you don’t see them, check your spam folder.</> : <>We couldn’t send a verification link to <strong className="break-all text-[#49393c]">{completion.email}</strong> yet. You can try again below.</>}</p>
                {error && <p role="alert" className="mt-4 rounded-xl bg-[#fff1f1] px-3.5 py-3 text-sm leading-5 text-[#a13c4e]">{error}</p>}
                {completion.type === "verification" && !completion.sent && <button type="button" className="btn-light mt-5 w-full" disabled={busy} onClick={() => void resendVerification()}>{busy ? "Sending…" : "Resend verification email"}</button>}
                <button type="button" className="btn-primary mt-4 w-full" onClick={() => changeMode("login")}>Back to sign in <ArrowRight className="ml-2 inline" size={16} /></button>
              </div>
            ) : (
              <>
                <div className="mb-7">
                  <p className="text-xs font-bold uppercase tracking-[.18em] text-[#a16c71]">{isReset ? "ACCOUNT RECOVERY" : isSignup ? "JOIN THE TRIO EDIT" : "WELCOME BACK"}</p>
                  <h2 className="brand-serif mt-2 text-3xl font-semibold text-[#352a2d] sm:text-[2.15rem]">{isReset ? "Reset your password" : isSignup ? "Create your account" : "Your next favourite awaits."}</h2>
                  <p className="mt-2 text-sm leading-6 text-stone-500">{isReset ? "We’ll email you a secure link to choose a new password." : isSignup ? "A few details, then a little more sparkle in your day." : "Sign in to pick up right where you left off."}</p>
                </div>

                {!isReset && <div className="mb-6 grid grid-cols-2 rounded-xl bg-[#f8f3f2] p-1">
                  <button type="button" onClick={() => changeMode("login")} className={`rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ${!isSignup ? "bg-white text-[#704451] shadow-sm" : "text-stone-500 hover:text-stone-800"}`}>Sign in</button>
                  <button type="button" onClick={() => changeMode("signup")} className={`rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ${isSignup ? "bg-white text-[#704451] shadow-sm" : "text-stone-500 hover:text-stone-800"}`}>Create account</button>
                </div>}

                <form onSubmit={submit} className="grid gap-4">
                  {isSignup && <div className="grid gap-4 sm:grid-cols-2">
                    <AuthField label="Full name" autoComplete="name" value={profile.fullName} onChange={(value) => updateProfileField("fullName", value)} required />
                    <AuthField label="Mobile number" autoComplete="tel" type="tel" value={profile.mobile} onChange={(value) => updateProfileField("mobile", value)} required />
                    <AuthField label="Room number" autoComplete="off" value={profile.roomNumber} onChange={(value) => updateProfileField("roomNumber", value)} required />
                    <AuthField label="Hostel block / delivery address" autoComplete="street-address" value={profile.deliveryAddress} onChange={(value) => updateProfileField("deliveryAddress", value)} required />
                  </div>}

                  <AuthField label="Email address" autoComplete="email" icon={<Mail size={17} />} type="email" value={email} onChange={setEmail} required />
                  {!isReset && <div>
                    <div className="mb-1.5 flex items-center justify-between"><label htmlFor="auth-password" className="label mb-0">{isSignup ? "Create password" : "Password"}</label>{!isSignup && <button type="button" onClick={() => changeMode("reset")} className="text-xs font-semibold text-[#8a5867] hover:text-[#704451]">Forgot password?</button>}</div>
                    <div className="relative">
                      <input id="auth-password" className="field pr-12" type={showPassword ? "text" : "password"} autoComplete={isSignup ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} required minLength={isSignup ? 8 : 6} />
                      <button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((value) => !value)} className="absolute inset-y-0 right-0 grid w-11 place-items-center text-stone-400 hover:text-[#8a5867]">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>
                    </div>
                    {isSignup && <p className="mt-1.5 text-[11px] text-stone-400">Use at least 8 characters.</p>}
                  </div>}

                  {isSignup && <div>
                    <label htmlFor="auth-confirm-password" className="label">Confirm password</label>
                    <div className="relative">
                      <input id="auth-confirm-password" className="field pr-12" type={showConfirmPassword ? "text" : "password"} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required minLength={8} />
                      <button type="button" aria-label={showConfirmPassword ? "Hide confirmation password" : "Show confirmation password"} onClick={() => setShowConfirmPassword((value) => !value)} className="absolute inset-y-0 right-0 grid w-11 place-items-center text-stone-400 hover:text-[#8a5867]">{showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>
                    </div>
                  </div>}

                  {!isSignup && !isReset && <label className="flex items-center gap-2 text-sm text-stone-600"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} className="h-4 w-4 accent-[#8a5867]" /> Remember me</label>}
                  {isSignup && <label className="flex items-start gap-2 text-xs leading-5 text-stone-600"><input type="checkbox" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} required className="mt-0.5 h-4 w-4 shrink-0 accent-[#8a5867]" /><span>I agree to the Terms and Conditions and confirm my details are accurate.</span></label>}

                  {error && <p role="alert" className="rounded-xl bg-[#fff1f1] px-3.5 py-3 text-sm leading-5 text-[#a13c4e]">{error}</p>}
                  {success && <p role="status" className="rounded-xl bg-[#eef5ee] px-3.5 py-3 text-sm leading-5 text-[#44634b]">{success}</p>}
                  {profileSaveFailed && <Link to="/profile" className="text-sm font-semibold text-[#8a5867] hover:underline">Continue to your profile to finish setting up your account</Link>}

                  <button className="btn-primary mt-1 flex w-full items-center justify-center gap-2 py-3.5" disabled={busy}>{busy ? <><span className="auth-spinner" />{isReset ? "Sending link…" : isSignup ? "Creating account…" : "Signing in…"}</> : <>{isReset ? "Send reset link" : isSignup ? "Create account" : "Sign in"} <ArrowRight size={17} /></>}</button>
                </form>

                {!isReset && <div className="my-5 flex items-center gap-3 text-[11px] font-medium uppercase tracking-[.13em] text-stone-400"><span className="h-px flex-1 bg-[#eee5e3]" />or continue with<span className="h-px flex-1 bg-[#eee5e3]" /></div>}
                {!isReset && <button type="button" className="btn-light flex w-full items-center justify-center gap-3 py-3 transition hover:border-[#c89ba1] hover:bg-[#fffafa] disabled:opacity-50" onClick={() => void signInWithGoogle()} disabled={busy}><span className="grid h-5 w-5 place-items-center rounded-full border border-[#e9e3e1] bg-white font-bold text-[#4285f4]">G</span>Continue with Google</button>}

                <p className="mt-6 text-center text-sm text-stone-500">{isReset ? <button type="button" onClick={() => changeMode("login")} className="inline-flex items-center gap-1 font-semibold text-[#8a5867] hover:underline"><ArrowLeft size={15} /> Back to sign in</button> : isSignup ? <>Already have an account? <button type="button" onClick={() => changeMode("login")} className="font-semibold text-[#8a5867] hover:underline">Sign in</button></> : <>New to THE TRIO SHOP? <button type="button" onClick={() => changeMode("signup")} className="font-semibold text-[#8a5867] hover:underline">Create an account</button></>}</p>
                {!isReset && <div className="mt-6 flex items-center justify-center gap-2 text-[11px] text-stone-400"><LockKeyhole size={13} />Your password is protected by Firebase Authentication.</div>}
              </>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

function AuthField({ label, value, onChange, type = "text", required = false, autoComplete, icon }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  autoComplete?: string;
  icon?: ReactNode;
}) {
  return <label className="block"><span className="label">{label}</span><span className="relative block">{icon && <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-stone-400">{icon}</span>}<input className={`field ${icon ? "pl-11" : ""}`} type={type} value={value} onChange={(event) => onChange(event.target.value)} required={required} autoComplete={autoComplete} /></span></label>;
}
