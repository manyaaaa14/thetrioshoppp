import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, NavLink, Route, Routes, useNavigate, useSearchParams } from "react-router-dom";
import {
  addDoc, collection, doc, getDoc, onSnapshot, orderBy, query, serverTimestamp, setDoc, where
} from "firebase/firestore";
import { createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { QRCodeSVG } from "qrcode.react";
import {
  ArrowRight, CircleUserRound, Clock3, Menu, Plus, Search, ShoppingBag, ShoppingCart, Store, Trash2, X
} from "lucide-react";
import { auth, db, functions, isFirebaseConfigured, storage } from "./firebase";
import type { Category, CustomerProfile, Order, Product, ShopBanner, ShopSettings } from "./types";

const CONTACT = "9729794568";
const UPI_ID = "manishataneja980@oksbi";
const DELIVERY_FEE = 10;
const money = (amount: number) => `₹${amount.toFixed(2).replace(/\.00$/, "")}`;
const timestamp = (value?: { seconds: number }) => value ? new Date(value.seconds * 1000).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "Just now";

function useCollection<T>(path: string, constraints: Parameters<typeof query>[1][] = []) {
  const [items, setItems] = useState<T[]>([]);
  useEffect(() => onSnapshot(query(collection(db, path), ...constraints), (snapshot) => {
    setItems(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }) as T));
  }, (error) => console.error(`Unable to load ${path}`, error)), [path]);
  return items;
}

function useShop() {
  const [shop, setShop] = useState<ShopSettings>({ isOpen: false });
  useEffect(() => onSnapshot(doc(db, "settings", "shop"), (snapshot) => {
    if (snapshot.exists()) setShop(snapshot.data() as ShopSettings);
  }, (error) => console.error("Unable to load shop status", error)), []);
  return shop;
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [cart, setCart] = useState<Record<string, number>>(() => {
    try { return JSON.parse(localStorage.getItem("trio-cart") || "{}") as Record<string, number>; }
    catch { return {}; }
  });
  const [authReady, setAuthReady] = useState(false);
  const navigate = useNavigate();

  useEffect(() => onAuthStateChanged(auth, async (current) => {
    setUser(current);
    setProfile(null);
    setIsAdmin(false);
    if (current) {
      try {
        const [token, userDoc] = await Promise.all([current.getIdTokenResult(), getDoc(doc(db, "users", current.uid))]);
        setIsAdmin(token.claims.admin === true);
        if (userDoc.exists()) setProfile(userDoc.data() as CustomerProfile);
      } catch (error) { console.error("Unable to load account", error); }
    }
    setAuthReady(true);
  }), []);

  useEffect(() => localStorage.setItem("trio-cart", JSON.stringify(cart)), [cart]);

  const addToCart = (id: string, quantity = 1) => setCart((current) => ({ ...current, [id]: (current[id] || 0) + quantity }));
  const setQuantity = (id: string, quantity: number) => setCart((current) => {
    const updated = { ...current };
    if (quantity <= 0) delete updated[id]; else updated[id] = quantity;
    return updated;
  });
  const clearCart = () => setCart({});
  const cartCount = Object.values(cart).reduce((sum, qty) => sum + qty, 0);

  if (!isFirebaseConfigured) return <SetupRequired />;
  if (!authReady) return <div className="grid min-h-screen place-items-center text-sm text-stone-500">Getting your shop ready…</div>;

  return (
    <div className="min-h-screen">
      <Header user={user} admin={isAdmin} cartCount={cartCount} />
      <Routes>
        <Route path="/" element={<Home addToCart={addToCart} />} />
        <Route path="/products" element={<Products addToCart={addToCart} />} />
        <Route path="/categories" element={<Categories />} />
        <Route path="/login" element={<Login onSignedIn={() => navigate("/profile")} />} />
        <Route path="/admin/login" element={<AdminLogin onSignedIn={() => navigate("/admin")} />} />
        <Route path="/profile" element={<Protected user={user}><Profile user={user!} profile={profile} onSave={setProfile} /></Protected>} />
        <Route path="/cart" element={<Cart cart={cart} setQuantity={setQuantity} user={user} profile={profile} clearCart={clearCart} />} />
        <Route path="/orders" element={<Protected user={user}><Orders user={user!} admin={isAdmin} /></Protected>} />
        <Route path="/admin" element={<Protected user={user} requireAdmin isAdmin={isAdmin}><Admin user={user!} /></Protected>} />
        <Route path="*" element={<Home addToCart={addToCart} />} />
      </Routes>
      <Footer />
    </div>
  );
}

function SetupRequired() {
  return <main className="page-shell grid min-h-screen place-items-center py-10"><div className="card soft-shadow max-w-xl p-8">
    <div className="mb-3 flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#e6eee4] text-[#355b3d]"><Store /></span><h1 className="text-2xl font-bold">The Trio Shop</h1></div>
    <h2 className="mb-2 text-lg font-bold">Connect your Firebase project</h2>
    <p className="mb-4 text-sm leading-6 text-stone-600">Add your Firebase web app settings to <code>.env</code> (use <code>.env.example</code> as a guide), enable Email/Password Authentication, and deploy the included Firestore rules and Cloud Functions.</p>
    <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">No demo data or insecure fallback is enabled. The app will connect to your live Firebase project once configured.</p>
  </div></main>;
}

function Header({ user, admin, cartCount }: { user: User | null; admin: boolean; cartCount: number }) {
  const [open, setOpen] = useState(false);
  const links = [
    ["Home", "/"], ["All products", "/products"], ["Categories", "/categories"],
    ...(user && !admin ? [["My orders", "/orders"]] : [])
  ];
  return <header className="sticky top-0 z-30 border-b border-[#eae9e2] bg-[#f8f7f3]/95 backdrop-blur">
    <div className="page-shell flex h-[76px] items-center justify-between gap-5">
      <Link to="/" className="flex shrink-0 items-center gap-2.5">
        <span className="grid h-10 w-10 place-items-center rounded-[14px] bg-[#355b3d] text-white"><Store size={21} /></span>
        <span><strong className="block text-[16px] leading-5">The Trio Shop</strong><small className="text-[11px] text-stone-500">Hostel life, sorted.</small></span>
      </Link>
      <nav className="hidden items-center gap-7 md:flex">{links.map(([label, path]) => <NavLink key={path} to={path} className={({ isActive }) => `text-sm font-medium ${isActive ? "text-[#355b3d]" : "text-stone-600 hover:text-stone-950"}`}>{label}</NavLink>)}</nav>
      <div className="flex items-center gap-2">
        <Link aria-label="Your cart" to="/cart" className="relative grid h-10 w-10 place-items-center rounded-xl hover:bg-white"><ShoppingCart size={19} />{cartCount > 0 && <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[#d77752] px-1 text-[10px] font-bold text-white">{cartCount}</span>}</Link>
        {user ? <Link to={admin ? "/admin" : "/profile"} className="hidden rounded-xl border border-[#e8e7e1] bg-white px-3 py-2 text-sm font-semibold sm:block">{admin ? "Admin" : "Profile"}</Link> : <Link to="/login" className="hidden rounded-xl border border-[#e8e7e1] bg-white px-3 py-2 text-sm font-semibold sm:block">Log in</Link>}
        <button className="grid h-10 w-10 place-items-center rounded-xl md:hidden" onClick={() => setOpen(!open)} aria-label="Toggle menu">{open ? <X size={20} /> : <Menu size={20} />}</button>
      </div>
    </div>
    {open && <nav className="page-shell grid gap-1 border-t border-[#eae9e2] py-3 md:hidden">{links.map(([label, path]) => <Link onClick={() => setOpen(false)} key={path} className="rounded-lg px-3 py-2 text-sm" to={path}>{label}</Link>)}<Link onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 text-sm" to={user ? admin ? "/admin" : "/profile" : "/login"}>{user ? admin ? "Admin dashboard" : "My profile" : "Log in / sign up"}</Link></nav>}
  </header>;
}

function Footer() {
  return <footer className="mt-20 border-t border-[#eae9e2] bg-white py-8"><div className="page-shell flex flex-col justify-between gap-4 text-sm text-stone-500 sm:flex-row sm:items-center"><p>© {new Date().getFullYear()} The Trio Shop · Made for hostel life.</p><div className="flex items-center gap-5"><a href={`tel:${CONTACT}`} className="hover:text-[#355b3d]">Call {CONTACT}</a><a href={`https://wa.me/91${CONTACT}`} target="_blank" rel="noreferrer" className="font-semibold text-[#355b3d]">WhatsApp us</a></div></div></footer>;
}

function Protected({ user, requireAdmin = false, isAdmin = false, children }: { user: User | null; requireAdmin?: boolean; isAdmin?: boolean; children: ReactNode }) {
  if (!user) return <main className="page-shell py-20 text-center"><h2 className="mb-2 text-2xl font-bold">{requireAdmin ? "Administrator sign in required" : "Sign in to continue"}</h2><p className="mb-5 text-stone-500">{requireAdmin ? "Only authorized administrators can access the dashboard." : "Your account keeps your room details and orders together."}</p><Link className="btn-primary inline-block" to={requireAdmin ? "/admin/login" : "/login"}>{requireAdmin ? "Admin sign in" : "Log in or create account"}</Link></main>;
  if (requireAdmin && !isAdmin) return <main className="page-shell py-20 text-center"><h2 className="text-2xl font-bold">Access restricted</h2><p className="mt-2 text-stone-500">This area is available to authorized administrators only.</p></main>;
  return <>{children}</>;
}

function ShopStatus({ shop }: { shop: ShopSettings }) {
  return <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold ${shop.isOpen ? "bg-[#e6f0e5] text-[#315d3b]" : "bg-[#fff0eb] text-[#a94834]"}`}>
    <span className={`h-2 w-2 rounded-full ${shop.isOpen ? "bg-[#4b8c57]" : "bg-[#d65e49]"}`} />Shop is {shop.isOpen ? "Open" : "Closed"}
  </div>;
}

function Home({ addToCart }: { addToCart: (id: string, quantity?: number) => void }) {
  const products = useCollection<Product>("products", [where("active", "==", true)]);
  const categories = useCollection<Category>("categories", [where("active", "==", true)]);
  const banners = useCollection<ShopBanner>("banners", [where("active", "==", true)]);
  const shop = useShop();
  const liveBanners = banners.filter((banner) => {
    const now = new Date();
    return (!banner.startsAt || new Date(banner.startsAt) <= now) && (!banner.endsAt || new Date(banner.endsAt) >= now);
  });
  return <main className="page-shell">
    {liveBanners.slice(0, 1).map((banner) => <div key={banner.id} className="relative mt-5 overflow-hidden rounded-3xl bg-[#e8e4d7]">
      {banner.imageUrl && <img src={banner.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-25" />}
      <div className="relative px-6 py-6 sm:px-10"><p className="text-xs font-bold uppercase tracking-[.18em] text-[#47694a]">{banner.discount || "A little something for you"}</p><h2 className="mt-1 text-2xl font-extrabold sm:text-3xl">{banner.title}</h2><p className="mt-1 text-sm text-stone-700">{banner.description}</p></div>
    </div>)}
    <section className="grid items-center gap-8 py-12 md:grid-cols-[1.15fr_.85fr] md:py-16">
      <div><ShopStatus shop={shop} /><h1 className="mt-5 max-w-xl text-[42px] font-extrabold leading-[1.08] tracking-[-.045em] sm:text-[58px]">Hostel life,<br /><span className="text-[#59785a]">a little easier.</span></h1>
        <p className="mt-4 max-w-md text-base leading-7 text-stone-600">Snacks, essentials, and the little things you need — delivered right to your hostel room.</p>
        {shop.notice && <p className="mt-4 max-w-md rounded-xl bg-[#fff4de] px-4 py-3 text-sm font-medium text-[#765b24]">{shop.notice}</p>}
        <div className="mt-6 flex flex-wrap gap-3"><Link to="/products" className="btn-primary inline-flex items-center gap-2">Shop essentials <ArrowRight size={17} /></Link><a href={`https://wa.me/91${CONTACT}`} target="_blank" rel="noreferrer" className="btn-light">Chat with us</a></div>
      </div>
      <div className="relative mx-auto w-full max-w-[410px] rounded-[30px] bg-[#e4ebdf] p-5 sm:p-8">
        <div className="rounded-[24px] bg-white p-5 soft-shadow"><div className="flex items-center justify-between"><span className="rounded-full bg-[#f5efe4] px-3 py-1 text-xs font-semibold">Your hostel run</span><ShoppingBag className="text-[#5b795c]" size={20} /></div><div className="mt-8 grid grid-cols-2 gap-3"><div className="rounded-2xl bg-[#fcf2e7] p-5 text-center text-4xl">🍜<p className="mt-2 text-xs font-semibold text-stone-600">Late-night bites</p></div><div className="rounded-2xl bg-[#eff3e9] p-5 text-center text-4xl">🧴<p className="mt-2 text-xs font-semibold text-stone-600">Daily essentials</p></div><div className="rounded-2xl bg-[#f5edf0] p-5 text-center text-4xl">🧃<p className="mt-2 text-xs font-semibold text-stone-600">Quick refreshments</p></div><div className="rounded-2xl bg-[#f5f2e4] p-5 text-center text-4xl">📦<p className="mt-2 text-xs font-semibold text-stone-600">At your room</p></div></div></div>
      </div>
    </section>
    {categories.length > 0 && <section className="pb-12"><SectionTitle title="Browse categories" action="All categories" to="/categories" /><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">{categories.slice(0, 4).map((category, i) => <Link to={`/products?category=${category.id}`} className="card group overflow-hidden p-3" key={category.id}><div className="grid h-28 place-items-center overflow-hidden rounded-xl bg-[#f1f0e9] text-4xl">{category.imageUrl ? <img src={category.imageUrl} alt={category.name} className="h-full w-full object-cover" /> : ["🥨", "🧼", "🥤", "📚"][i % 4]}</div><p className="mt-3 text-sm font-bold">{category.name}</p></Link>)}</div></section>}
    <section className="pb-6"><SectionTitle title="Latest picks" action="See all" to="/products" /><div className="mt-4"><ProductGrid products={products.slice(0, 4)} addToCart={addToCart} /></div></section>
    {products.some((product) => product.popular) && <section className="mt-12"><SectionTitle title="Hostel favourites" action="Explore" to="/products" /><div className="mt-4"><ProductGrid products={products.filter((product) => product.popular).slice(0, 4)} addToCart={addToCart} /></div></section>}
  </main>;
}

function SectionTitle({ title, action, to }: { title: string; action: string; to: string }) {
  return <div className="flex items-end justify-between"><h2 className="text-xl font-extrabold tracking-tight sm:text-2xl">{title}</h2><Link to={to} className="text-sm font-semibold text-[#426b47]">{action} <span aria-hidden>→</span></Link></div>;
}

function Products({ addToCart }: { addToCart: (id: string, quantity?: number) => void }) {
  const products = useCollection<Product>("products", [where("active", "==", true)]);
  const categories = useCollection<Category>("categories", [where("active", "==", true)]);
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const categoryId = params.get("category") || "";
  const filtered = products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()) && (!categoryId || p.categoryId === categoryId));
  return <main className="page-shell py-10"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-semibold text-[#567658]">THE HOSTEL STORE</p><h1 className="mt-1 text-3xl font-extrabold">All the good stuff.</h1></div><div className="relative w-full sm:max-w-xs"><Search size={17} className="absolute left-3 top-3.5 text-stone-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products…" className="field pl-10" /></div></div>
    <div className="my-5 flex gap-2 overflow-auto pb-2"><button onClick={() => setParams({})} className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${!categoryId ? "bg-[#355b3d] text-white" : "bg-white"}`}>Everything</button>{categories.map((category) => <button key={category.id} onClick={() => setParams({ category: category.id })} className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${categoryId === category.id ? "bg-[#355b3d] text-white" : "bg-white"}`}>{category.name}</button>)}</div>
    <ProductGrid products={filtered} addToCart={addToCart} />
  </main>;
}

function ProductGrid({ products, addToCart }: { products: Product[]; addToCart: (id: string, quantity?: number) => void }) {
  const shop = useShop();
  if (products.length === 0) return <div className="card py-14 text-center text-sm text-stone-500">No products here just yet. Check back soon!</div>;
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">{products.map((product) => {
    const available = product.stock > 0;
    return <article className="card overflow-hidden" key={product.id}>
      <div className="relative grid aspect-square place-items-center overflow-hidden bg-[#f2f1eb]">{product.imageUrl ? <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" /> : <span className="text-5xl">🛍️</span>}<span className={`absolute left-2 top-2 pill ${available ? "bg-white/90 text-[#426b47]" : "bg-[#fff0eb] text-[#a94834]"}`}>{available ? "In stock" : "Sold out"}</span></div>
      <div className="p-3 sm:p-4"><h3 className="line-clamp-1 text-sm font-bold">{product.name}</h3><p className="mt-1 line-clamp-2 min-h-9 text-xs leading-4 text-stone-500">{product.description}</p><div className="mt-3 flex items-center justify-between gap-1"><strong className="text-[15px]">{money(product.price)}</strong><button disabled={!available || !shop.isOpen} onClick={() => addToCart(product.id)} className="grid h-9 w-9 place-items-center rounded-xl bg-[#355b3d] text-white disabled:bg-stone-300" aria-label={`Add ${product.name} to cart`}><Plus size={18} /></button></div></div>
    </article>;
  })}</div>;
}

function Categories() {
  const categories = useCollection<Category>("categories", [where("active", "==", true)]);
  return <main className="page-shell py-12"><p className="text-sm font-semibold text-[#567658]">FIND YOUR THING</p><h1 className="mt-1 text-3xl font-extrabold">Categories</h1><div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">{categories.map((category, i) => <Link key={category.id} to={`/products?category=${category.id}`} className="card overflow-hidden"><div className="grid aspect-[1.3] place-items-center bg-[#eeefe7] text-5xl">{category.imageUrl ? <img className="h-full w-full object-cover" src={category.imageUrl} alt={category.name} /> : ["🍿", "🧃", "🧼", "🎒"][i % 4]}</div><p className="p-4 font-bold">{category.name}<ArrowRight className="float-right text-[#678268]" size={18} /></p></Link>)}</div></main>;
}

function Login({ onSignedIn }: { onSignedIn: () => void }) {
  const [register, setRegister] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [profile, setProfile] = useState<CustomerProfile>({ fullName: "", mobile: "", email: "", hostelName: "", roomNumber: "", deliveryAddress: "" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const update = (key: keyof CustomerProfile, value: string) => setProfile((current) => ({ ...current, [key]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault(); setError(""); setBusy(true);
    try {
      if (register) {
        const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
        const customer = { ...profile, email: email.trim() };
        await setDoc(doc(db, "users", credential.user.uid), customer);
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
      onSignedIn();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to sign in."); }
    finally { setBusy(false); }
  }

  return <main className="page-shell grid min-h-[65vh] place-items-center py-10"><form onSubmit={submit} className="card soft-shadow w-full max-w-lg p-6 sm:p-8">
    <span className="text-sm font-bold text-[#557456]">{register ? "YOUR HOSTEL ACCOUNT" : "WELCOME BACK"}</span><h1 className="mt-2 text-2xl font-extrabold">{register ? "A room number away." : "Good to see you."}</h1><p className="mt-1 text-sm text-stone-500">{register ? "Sign up to get your order delivered to your room." : "Sign in to shop and track your orders."}</p>
    <div className="mt-6 grid gap-4">
      {register && <><Field label="Full name" value={profile.fullName} onChange={(v) => update("fullName", v)} required /><Field label="Mobile number" value={profile.mobile} onChange={(v) => update("mobile", v)} type="tel" required /><Field label="Hostel name" value={profile.hostelName} onChange={(v) => update("hostelName", v)} required /><Field label="Room number" value={profile.roomNumber} onChange={(v) => update("roomNumber", v)} required /><Field label="Delivery address / hostel block" value={profile.deliveryAddress} onChange={(v) => update("deliveryAddress", v)} required /></>}
      <Field label="Email address" value={email} onChange={setEmail} type="email" required /><Field label="Password" value={password} onChange={setPassword} type="password" required minLength={6} />
    </div>
    {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    <button className="btn-primary mt-5 w-full" disabled={busy}>{busy ? "One moment…" : register ? "Create my account" : "Log in"}</button>
    <button type="button" className="mt-4 w-full text-sm font-semibold text-[#426b47]" onClick={() => { setRegister(!register); setError(""); }}>{register ? "Already have an account? Log in" : "New to The Trio Shop? Create an account"}</button>
  </form></main>;
}

function AdminLogin({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(""); setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      onSignedIn();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to sign in."); }
    finally { setBusy(false); }
  }
  return <main className="page-shell grid min-h-[65vh] place-items-center py-10"><form onSubmit={submit} className="card soft-shadow w-full max-w-md p-6 sm:p-8">
    <span className="text-sm font-bold text-[#557456]">AUTHORIZED STAFF</span><h1 className="mt-2 text-2xl font-extrabold">Administrator sign in</h1><p className="mt-1 text-sm text-stone-500">Use your authorized Firebase account. Admin access is verified securely by the server.</p>
    <div className="mt-6 grid gap-4"><Field label="Admin email" value={email} onChange={setEmail} type="email" required /><Field label="Password" value={password} onChange={setPassword} type="password" required /></div>
    {error && <p className="mt-3 break-words text-sm text-red-600">{error}</p>}
    <button className="btn-primary mt-5 w-full" disabled={busy}>{busy ? "Signing in…" : "Sign in to dashboard"}</button>
  </form></main>;
}

function Field({ label, value, onChange, type = "text", required = false, minLength }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean; minLength?: number }) {
  return <label><span className="label">{label}</span><input className="field" type={type} value={value} onChange={(e) => onChange(e.target.value)} required={required} minLength={minLength} /></label>;
}

function Profile({ user, profile, onSave }: { user: User; profile: CustomerProfile | null; onSave: (value: CustomerProfile) => void }) {
  const [form, setForm] = useState<CustomerProfile>(profile || { fullName: "", mobile: "", email: user.email || "", hostelName: "", roomNumber: "", deliveryAddress: "" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (profile) setForm(profile);
  }, [profile]);
  const update = (key: keyof CustomerProfile, value: string) => setForm((current) => ({ ...current, [key]: value }));
  async function save(event: FormEvent) {
    event.preventDefault(); setMessage(""); setError("");
    try { await setDoc(doc(db, "users", user.uid), { ...form, email: user.email || form.email }); onSave(form); setMessage("Your details have been saved."); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to save profile."); }
  }
  return <main className="page-shell py-10"><div className="mx-auto max-w-2xl"><div className="flex items-center gap-3"><CircleUserRound className="text-[#527252]" size={28} /><div><p className="text-sm text-stone-500">YOUR ACCOUNT</p><h1 className="text-2xl font-extrabold">Delivery details</h1></div></div><form onSubmit={save} className="card mt-6 grid gap-4 p-5 sm:grid-cols-2 sm:p-7">
    <Field label="Full name" value={form.fullName} onChange={(v) => update("fullName", v)} required /><Field label="Mobile number" value={form.mobile} onChange={(v) => update("mobile", v)} type="tel" required /><label className="sm:col-span-2"><span className="label">Email address</span><input className="field bg-stone-50" value={user.email || ""} readOnly /></label><Field label="Hostel name" value={form.hostelName} onChange={(v) => update("hostelName", v)} required /><Field label="Room number" value={form.roomNumber} onChange={(v) => update("roomNumber", v)} required /><div className="sm:col-span-2"><Field label="Delivery address / hostel block" value={form.deliveryAddress} onChange={(v) => update("deliveryAddress", v)} required /></div>
    {message && <p className="text-sm text-green-700 sm:col-span-2">{message}</p>}{error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}<button className="btn-primary sm:col-span-2">Save changes</button><button type="button" onClick={() => void signOut(auth)} className="text-sm font-semibold text-stone-500 sm:col-span-2">Sign out</button>
  </form></div></main>;
}

function Cart({ cart, setQuantity, user, profile, clearCart }: { cart: Record<string, number>; setQuantity: (id: string, qty: number) => void; user: User | null; profile: CustomerProfile | null; clearCart: () => void }) {
  const products = useCollection<Product>("products", [where("active", "==", true)]);
  const shop = useShop();
  const [room, setRoom] = useState(profile?.roomNumber || "");
  const [address, setAddress] = useState(profile?.deliveryAddress || "");
  const [reference, setReference] = useState("");
  const [orderId, setOrderId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (profile) {
      setRoom(profile.roomNumber || "");
      setAddress(profile.deliveryAddress || "");
    }
  }, [profile]);
  const cartProducts = products.filter((product) => cart[product.id] > 0);
  const subtotal = cartProducts.reduce((sum, product) => sum + product.price * cart[product.id], 0);
  const total = subtotal + DELIVERY_FEE;
  const upiLink = `upi://pay?pa=${encodeURIComponent(UPI_ID)}&pn=${encodeURIComponent("The Trio Shop")}&am=${total.toFixed(2)}&cu=INR&tn=${encodeURIComponent("Hostel order")}`;

  async function placeOrder(event: FormEvent) {
    event.preventDefault(); setError(""); setBusy(true);
    try {
      const create = httpsCallable(functions, "createOrder");
      const result = await create({ items: cartProducts.map((product) => ({ productId: product.id, quantity: cart[product.id] })), roomNumber: room, deliveryAddress: address, paymentReference: reference });
      setOrderId((result.data as { orderId: string }).orderId);
      clearCart();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to place your order."); }
    finally { setBusy(false); }
  }

  if (orderId) return <main className="page-shell py-16"><div className="card mx-auto max-w-xl p-7 text-center"><span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#e6f0e5] text-[#426b47]"><Clock3 /></span><h1 className="mt-4 text-2xl font-extrabold">Payment verification in progress</h1><p className="mt-2 text-sm leading-6 text-stone-600">Your order <strong>#{orderId.slice(0, 8)}</strong> is saved. We’ll confirm it after an admin verifies your UPI payment; entering a reference doesn’t mark an order paid.</p><Link className="btn-primary mt-5 inline-flex" to="/orders">Track my order</Link></div></main>;
  if (cartProducts.length === 0) return <main className="page-shell py-20 text-center"><ShoppingBag className="mx-auto text-[#8d9b84]" size={35} /><h1 className="mt-4 text-2xl font-extrabold">Your cart is taking a break.</h1><p className="mt-2 text-stone-500">Find something you need for your room.</p><Link className="btn-primary mt-5 inline-block" to="/products">Browse products</Link></main>;

  return <main className="page-shell py-10"><h1 className="text-3xl font-extrabold">Your cart</h1><div className="mt-6 grid items-start gap-5 lg:grid-cols-[1fr_360px]"><div className="grid gap-3">{cartProducts.map((product) => <div className="card flex gap-4 p-3 sm:p-4" key={product.id}><div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-xl bg-[#f2f1eb]">{product.imageUrl ? <img src={product.imageUrl} alt="" className="h-full w-full object-cover" /> : "🛍️"}</div><div className="min-w-0 flex-1"><h2 className="font-bold">{product.name}</h2><p className="mt-1 text-sm text-stone-500">{money(product.price)} each</p><div className="mt-2 inline-flex items-center rounded-lg border"><button className="px-3 py-1" onClick={() => setQuantity(product.id, cart[product.id] - 1)} aria-label="Decrease quantity">−</button><span className="min-w-8 text-center text-sm">{cart[product.id]}</span><button className="px-3 py-1" onClick={() => setQuantity(product.id, cart[product.id] + 1)} aria-label="Increase quantity">+</button></div></div><div className="text-right font-bold">{money(product.price * cart[product.id])}<button onClick={() => setQuantity(product.id, 0)} aria-label={`Remove ${product.name}`} className="ml-auto mt-3 block text-stone-400 hover:text-red-600"><Trash2 size={17} /></button></div></div>)}</div>
    <form onSubmit={placeOrder} className="card p-5"><h2 className="text-lg font-extrabold">Checkout</h2><div className="mt-4 flex justify-between text-sm"><span>Items subtotal</span><span>{money(subtotal)}</span></div><div className="mt-2 flex justify-between text-sm"><span>Hostel delivery</span><span>{money(DELIVERY_FEE)}</span></div><div className="my-4 border-t border-dashed" /><div className="flex justify-between font-extrabold"><span>Total (prepaid)</span><span>{money(total)}</span></div>
      {user ? <><div className="mt-5 grid gap-3"><Field label="Room number (required)" value={room} onChange={setRoom} required /><Field label="Hostel block / delivery address" value={address} onChange={setAddress} required /></div><div className="mt-5 rounded-2xl bg-[#f5f4ed] p-4"><div className="flex items-center justify-between"><p className="font-bold">Pay with any UPI app</p><span className="pill bg-white">Exact total {money(total)}</span></div><div className="mt-3 flex items-center gap-4"><div className="rounded-xl bg-white p-2"><QRCodeSVG value={upiLink} size={100} /></div><div className="min-w-0 text-xs leading-5 text-stone-600">UPI ID<br /><strong className="break-all text-stone-900">{UPI_ID}</strong><br />Pay exactly {money(total)}, then enter your UPI reference below.</div></div><a href={upiLink} className="btn-light mt-3 block text-center text-sm">Open UPI app</a></div><label className="mt-4 block"><span className="label">UPI transaction reference</span><input className="field" value={reference} onChange={(e) => setReference(e.target.value)} required placeholder="Enter your payment reference" /></label><p className="mt-2 text-xs leading-5 text-stone-500">Orders remain unconfirmed until our team verifies payment. Please do not share your UPI PIN or OTP.</p>
      </> : <p className="mt-4 rounded-xl bg-[#f5f4ed] p-3 text-sm">Please <Link to="/login" className="font-bold text-[#355b3d]">log in or create an account</Link> before checkout.</p>}
      {!shop.isOpen && <p className="mt-3 text-sm font-semibold text-red-700">The shop is closed and cannot accept orders right now.</p>}{error && <p className="mt-3 break-words text-sm text-red-600">{error}</p>}
      <button disabled={!user || !shop.isOpen || busy || !room.trim() || !address.trim() || !reference.trim()} className="btn-primary mt-4 w-full">{busy ? "Submitting…" : "I’ve paid — submit for verification"}</button><p className="mt-3 text-center text-[11px] text-stone-400">Delivery is available inside the hostel only.</p>
    </form></div></main>;
}

function Orders({ user, admin }: { user: User; admin: boolean }) {
  const orders = useCollection<Order>("orders", [where("customerId", "==", user.uid), orderBy("createdAt", "desc")]);
  return <main className="page-shell py-10"><h1 className="text-3xl font-extrabold">Your orders</h1><p className="mt-1 text-sm text-stone-500">Follow every order all the way to your room.</p>
    {!admin && <div className="mt-6 grid gap-4">{orders.map((order) => <OrderCard key={order.id} order={order} />)}{orders.length === 0 && <p className="card p-8 text-center text-sm text-stone-500">Nothing ordered yet. Your next snack run starts here.</p>}</div>}
  </main>;
}

function OrderCard({ order }: { order: Order }) {
  const labels: Record<string, string> = { payment_verification: "Payment verification", payment_confirmed: "Payment confirmed", preparing: "Preparing your order", out_for_delivery: "Out for delivery", delivered: "Delivered", cancelled: "Cancelled", rejected: "Rejected" };
  return <article className="card p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold text-stone-500">ORDER #{order.id.slice(0, 8)} · {timestamp(order.createdAt)}</p><h2 className="mt-1 text-lg font-extrabold">{labels[order.status] || order.status}</h2></div><span className={`pill ${order.paymentStatus === "confirmed" ? "bg-[#e6f0e5] text-[#315d3b]" : "bg-[#fff4de] text-[#765b24]"}`}>{order.paymentStatus === "confirmed" ? "Payment confirmed" : "Payment pending verification"}</span></div>
    <div className="mt-4 grid gap-1 text-sm text-stone-600">{order.items.map((item, index) => <p key={`${item.productId}-${index}`}>{item.quantity} × {item.name} <span className="float-right font-semibold text-stone-800">{money(item.unitPrice * item.quantity)}</span></p>)}</div><div className="mt-4 border-t pt-3 text-sm"><p>Deliver to <strong>Room {order.customer.roomNumber}</strong> · {order.customer.hostelName}</p><p className="mt-2 flex justify-between font-extrabold"><span>Prepaid total</span><span>{money(order.total)}</span></p></div>
    {order.estimatedDeliveryMinutes && order.status !== "delivered" && <p className="mt-3 rounded-xl bg-[#eaf0e5] p-3 text-sm font-semibold text-[#355b3d]">Your order will reach your room in approximately {order.estimatedDeliveryMinutes} minutes.</p>}
    {order.status === "payment_verification" && <p className="mt-2 text-xs text-stone-500">Payment reference: {order.paymentReference}</p>}{order.rejectReason && <p className="mt-2 text-sm text-red-700">{order.rejectReason}</p>}
  </article>;
}

function Admin({ user }: { user: User }) {
  const [tab, setTab] = useState("Overview");
  const tabs = ["Overview", "Orders", "Products", "Categories", "Banners", "Shop"];
  return <main className="page-shell py-8"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-semibold text-[#567658]">THE TRIO SHOP</p><h1 className="text-3xl font-extrabold">Admin dashboard</h1></div><button onClick={() => void signOut(auth)} className="btn-light">Sign out</button></div>
    <div className="mt-6 flex gap-2 overflow-x-auto pb-2">{tabs.map((name) => <button onClick={() => setTab(name)} key={name} className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold ${tab === name ? "bg-[#355b3d] text-white" : "bg-white text-stone-600"}`}>{name}</button>)}</div>
    {tab === "Overview" && <Dashboard />}
    {tab === "Orders" && <AdminOrders />}
    {tab === "Products" && <ProductManager />}
    {tab === "Categories" && <CategoryManager />}
    {tab === "Banners" && <BannerManager />}
    {tab === "Shop" && <ShopManager />}
    <p className="mt-8 text-xs text-stone-400">Signed in as {user.email}. Admin access is secured by Firebase custom claims.</p>
  </main>;
}

function Dashboard() {
  const orders = useCollection<Order>("orders");
  const products = useCollection<Product>("products");
  const categories = useCollection<Category>("categories");
  const today = new Date().toDateString();
  const todaysOrders = orders.filter((order) => order.createdAt && new Date(order.createdAt.seconds * 1000).toDateString() === today);
  const pending = orders.filter((order) => order.paymentStatus !== "confirmed" && !["cancelled", "rejected"].includes(order.status));
  const completed = orders.filter((order) => order.status === "delivered");
  const sales = todaysOrders.filter((order) => order.paymentStatus === "confirmed").reduce((sum, order) => sum + order.total, 0);
  const cards = [["Total orders", orders.length], ["Today's orders", todaysOrders.length], ["Products", products.length], ["Categories", categories.length], ["Pending verification", pending.length], ["Completed", completed.length], ["Today's sales", money(sales)]];
  return <section className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{cards.map(([label, value]) => <div className="card p-4 sm:p-5" key={label}><p className="text-xs font-semibold text-stone-500">{label}</p><p className="mt-2 text-2xl font-extrabold">{value}</p></div>)}</section>;
}

function AdminOrders() {
  const orders = useCollection<Order>("orders", [orderBy("createdAt", "desc")]);
  return <section className="mt-5 grid gap-4">{orders.map((order) => <ManageOrder key={order.id} order={order} />)}{orders.length === 0 && <p className="card p-8 text-center text-sm text-stone-500">Orders will appear here as customers check out.</p>}</section>;
}

function ManageOrder({ order }: { order: Order }) {
  const [estimate, setEstimate] = useState(order.estimatedDeliveryMinutes?.toString() || "");
  const [status, setStatus] = useState(order.status);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function update(data: Record<string, unknown>) {
    setBusy(true); setMessage("");
    try { await httpsCallable(functions, "updateOrder")({ orderId: order.id, ...data }); setMessage("Order updated."); }
    catch (e) { setMessage(e instanceof Error ? e.message : "Unable to update order."); }
    finally { setBusy(false); }
  }
  return <article className="card p-5"><div className="flex flex-wrap justify-between gap-3"><div><p className="text-xs text-stone-500">#{order.id} · {timestamp(order.createdAt)}</p><h2 className="mt-1 font-extrabold">{order.customer.fullName} · {money(order.total)}</h2><p className="mt-1 text-sm text-stone-600">{order.customer.mobile} · {order.customer.email}</p><p className="text-sm text-stone-600">{order.customer.hostelName}, Room {order.customer.roomNumber} · {order.customer.deliveryAddress}</p></div><span className="pill h-fit bg-[#f1f0e9]">{order.status}</span></div>
    <div className="mt-4 grid gap-1 border-t pt-3 text-sm">{order.items.map((item, i) => <p key={`${item.productId}-${i}`}>{item.quantity} × {item.name} · {money(item.unitPrice * item.quantity)}</p>)}<p className="mt-1 text-stone-500">UPI ref: <strong className="text-stone-800">{order.paymentReference}</strong> · Payment: {order.paymentStatus}</p></div>
    <div className="mt-4 flex flex-wrap items-end gap-2"><label className="min-w-40 flex-1"><span className="label">Order status</span><select className="field" value={status} onChange={(e) => setStatus(e.target.value)}><option value="payment_verification">Payment verification</option><option value="payment_confirmed">Payment confirmed</option><option value="preparing">Preparing</option><option value="out_for_delivery">Out for delivery</option><option value="delivered">Delivered</option><option value="cancelled">Cancelled</option><option value="rejected">Rejected</option></select></label><label className="w-36"><span className="label">ETA (minutes)</span><input className="field" type="number" min="1" max="240" value={estimate} onChange={(e) => setEstimate(e.target.value)} /></label><button disabled={busy} onClick={() => void update({ status: ["payment_verification", "payment_confirmed"].includes(status) ? undefined : status, estimatedDeliveryMinutes: estimate ? Number(estimate) : null })} className="btn-light">Save update</button>
    {order.paymentStatus === "pending_verification" && <button disabled={busy} onClick={() => void update({ paymentVerified: true })} className="btn-primary">Verify payment & accept</button>}<a className="btn-light" href={`https://wa.me/91${order.customer.mobile}`} target="_blank" rel="noreferrer">Contact customer</a></div>
    {message && <p className="mt-2 text-sm text-stone-600">{message}</p>}
  </article>;
}

function uploadImage(file: File, folder: string) {
  const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
  const storageRef = ref(storage, `${folder}/${safeName}`);
  return uploadBytes(storageRef, file).then((result) => getDownloadURL(result.ref));
}

function ProductManager() {
  const products = useCollection<Product>("products");
  const categories = useCollection<Category>("categories");
  const [editing, setEditing] = useState<Product | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = event.currentTarget;
    try {
      const data = new FormData(form);
      const file = data.get("image") as File;
      const id = String(data.get("id") || "");
      const old = products.find((p) => p.id === id);
      const imageUrl = file.size ? await uploadImage(file, "products") : old?.imageUrl || "";
      const values = { name: String(data.get("name")), description: String(data.get("description")), price: Number(data.get("price")), stock: Number(data.get("stock")), categoryId: String(data.get("categoryId")), imageUrl, active: data.get("active") === "on", popular: data.get("popular") === "on", updatedAt: serverTimestamp() };
      if (id) await setDoc(doc(db, "products", id), values, { merge: true }); else await addDoc(collection(db, "products"), { ...values, createdAt: serverTimestamp() });
      setEditing(null); form.reset();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save product."); }
    finally { setBusy(false); }
  }
  async function remove(id: string) { if (confirm("Delete this product?")) await setDoc(doc(db, "products", id), { active: false, deletedAt: serverTimestamp() }, { merge: true }); }
  return <section className="mt-5 grid gap-4 lg:grid-cols-[minmax(280px,.8fr)_1.2fr]"><form key={editing?.id || "new"} onSubmit={save} className="card h-fit grid gap-3 p-5"><h2 className="text-lg font-extrabold">{editing ? "Edit product" : "Add a product"}</h2>{editing && <input type="hidden" name="id" value={editing.id} />}<label><span className="label">Product name</span><input className="field" name="name" defaultValue={editing?.name} required /></label><label><span className="label">Description</span><textarea className="field min-h-20" name="description" defaultValue={editing?.description} required /></label><div className="grid grid-cols-2 gap-3"><label><span className="label">Price (₹)</span><input className="field" name="price" type="number" min="0.01" step="0.01" defaultValue={editing?.price} required /></label><label><span className="label">Stock</span><input className="field" name="stock" type="number" min="0" defaultValue={editing?.stock ?? 0} required /></label></div><label><span className="label">Category</span><select className="field" name="categoryId" defaultValue={editing?.categoryId || ""} required><option value="" disabled>Choose a category</option>{categories.map((c) => <option value={c.id} key={c.id}>{c.name}</option>)}</select></label><label><span className="label">Product image</span><input className="field text-sm" name="image" type="file" accept="image/*" /></label><label className="flex items-center gap-2 text-sm"><input name="active" type="checkbox" defaultChecked={editing?.active ?? true} />Visible in shop</label><label className="flex items-center gap-2 text-sm"><input name="popular" type="checkbox" defaultChecked={editing?.popular ?? false} />Show as a popular pick</label>{error && <p className="text-sm text-red-600">{error}</p>}<div className="flex gap-2"><button disabled={busy} className="btn-primary flex-1">{busy ? "Saving…" : editing ? "Save product" : "Add product"}</button>{editing && <button type="button" onClick={() => setEditing(null)} className="btn-light">Cancel</button>}</div></form>
    <div className="grid content-start gap-2">{products.map((product) => <div key={product.id} className="card flex items-center gap-3 p-3"><div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-[#f1f0e9]">{product.imageUrl ? <img src={product.imageUrl} className="h-full w-full object-cover" alt="" /> : "🛍️"}</div><div className="min-w-0 flex-1"><p className="truncate font-bold">{product.name}</p><p className="text-xs text-stone-500">{money(product.price)} · {product.stock} in stock · {product.active ? "Visible" : "Hidden"}</p></div><button className="btn-light px-3 py-2 text-xs" onClick={() => setEditing(product)}>Edit</button><button className="btn-danger" onClick={() => void remove(product.id)}>Remove</button></div>)}</div></section>;
}

function CategoryManager() {
  const categories = useCollection<Category>("categories");
  const [editing, setEditing] = useState<Category | null>(null);
  const [error, setError] = useState("");
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    const form = event.currentTarget;
    try {
      const data = new FormData(form);
      const file = data.get("image") as File;
      const id = String(data.get("id") || "");
      const old = categories.find((category) => category.id === id);
      const imageUrl = file.size ? await uploadImage(file, "categories") : old?.imageUrl || "";
      const values: Record<string, unknown> = { name: String(data.get("name")), imageUrl, active: true };
      if (id) await setDoc(doc(db, "categories", id), values, { merge: true }); else await addDoc(collection(db, "categories"), values);
      setEditing(null); form.reset();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save category."); }
  }
  return <section className="mt-5 grid gap-4 md:grid-cols-[320px_1fr]"><form key={editing?.id || "new"} onSubmit={save} className="card grid h-fit gap-3 p-5">{editing && <input type="hidden" name="id" value={editing.id} />}<h2 className="font-extrabold">{editing ? "Edit category" : "Add category"}</h2><label><span className="label">Category name</span><input className="field" name="name" defaultValue={editing?.name} required /></label><label><span className="label">Image (optional)</span><input className="field text-sm" name="image" type="file" accept="image/*" /></label>{error && <p className="text-sm text-red-600">{error}</p>}<div className="flex gap-2"><button className="btn-primary flex-1">{editing ? "Save category" : "Create category"}</button>{editing && <button type="button" onClick={() => setEditing(null)} className="btn-light">Cancel</button>}</div></form><div className="grid content-start gap-2">{categories.map((category) => <div key={category.id} className="card flex items-center gap-3 p-3"><div className="grid h-12 w-12 place-items-center overflow-hidden rounded-xl bg-[#f1f0e9]">{category.imageUrl ? <img src={category.imageUrl} className="h-full w-full object-cover" alt="" /> : "🗂️"}</div><span className="flex-1 font-bold">{category.name}</span><button className="btn-light px-3 py-2 text-xs" onClick={() => setEditing(category)}>Edit</button><button className="btn-danger" onClick={() => { if (confirm("Hide this category? Products in it will not be deleted.")) void setDoc(doc(db, "categories", category.id), { active: false }, { merge: true }); }}>Remove</button></div>)}</div></section>;
}

function BannerManager() {
  const banners = useCollection<ShopBanner>("banners");
  const [editing, setEditing] = useState<ShopBanner | null>(null);
  const [error, setError] = useState("");
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    const form = event.currentTarget;
    try {
      const data = new FormData(form);
      const file = data.get("image") as File;
      const id = String(data.get("id") || "");
      const old = banners.find((banner) => banner.id === id);
      const imageUrl = file.size ? await uploadImage(file, "banners") : old?.imageUrl || "";
      const values = { title: String(data.get("title")), description: String(data.get("description")), discount: String(data.get("discount")), startsAt: String(data.get("startsAt")), endsAt: String(data.get("endsAt")), imageUrl, active: true, updatedAt: serverTimestamp() };
      if (id) await setDoc(doc(db, "banners", id), values, { merge: true }); else await addDoc(collection(db, "banners"), { ...values, createdAt: serverTimestamp() });
      setEditing(null); form.reset();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save banner."); }
  }
  return <section className="mt-5 grid gap-4 md:grid-cols-[360px_1fr]"><form key={editing?.id || "new"} onSubmit={save} className="card grid h-fit gap-3 p-5">{editing && <input type="hidden" name="id" value={editing.id} />}<h2 className="font-extrabold">{editing ? "Edit sale banner" : "New sale banner"}</h2><label><span className="label">Title</span><input className="field" name="title" defaultValue={editing?.title} required /></label><label><span className="label">Offer description</span><textarea className="field" name="description" defaultValue={editing?.description} required /></label><label><span className="label">Discount info</span><input className="field" name="discount" defaultValue={editing?.discount} placeholder="e.g. Hostel special" /></label><div className="grid grid-cols-2 gap-2"><label><span className="label">Starts</span><input className="field" name="startsAt" type="datetime-local" defaultValue={editing?.startsAt} /></label><label><span className="label">Ends</span><input className="field" name="endsAt" type="datetime-local" defaultValue={editing?.endsAt} /></label></div><label><span className="label">Banner image</span><input className="field text-sm" name="image" type="file" accept="image/*" /></label>{error && <p className="text-sm text-red-600">{error}</p>}<div className="flex gap-2"><button className="btn-primary flex-1">{editing ? "Save banner" : "Publish banner"}</button>{editing && <button type="button" onClick={() => setEditing(null)} className="btn-light">Cancel</button>}</div></form><div className="grid content-start gap-3">{banners.map((banner) => <div key={banner.id} className="card flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="font-bold">{banner.title}</p><p className="text-sm text-stone-500">{banner.description}</p></div><div className="flex gap-2"><button onClick={() => setEditing(banner)} className="btn-light px-3 py-2 text-xs">Edit</button><button onClick={() => void setDoc(doc(db, "banners", banner.id), { active: !banner.active }, { merge: true })} className={`pill ${banner.active ? "bg-[#e6f0e5] text-[#315d3b]" : "bg-stone-100 text-stone-500"}`}>{banner.active ? "Active" : "Hidden"}</button></div></div>)}</div></section>;
}

function ShopManager() {
  const shop = useShop();
  const [notice, setNotice] = useState(shop.notice || "");
  const [saved, setSaved] = useState(false);
  useEffect(() => setNotice(shop.notice || ""), [shop.notice]);
  async function saveNotice(event: FormEvent) { event.preventDefault(); await setDoc(doc(db, "settings", "shop"), { notice: notice.trim() }, { merge: true }); setSaved(true); setTimeout(() => setSaved(false), 2500); }
  return <section className="mt-5 max-w-2xl"><div className="card p-5 sm:p-7"><h2 className="text-xl font-extrabold">Shop availability</h2><p className="mt-1 text-sm text-stone-500">Closing the shop prevents customers placing new orders.</p><div className="mt-5 flex items-center justify-between rounded-2xl bg-[#f6f5ef] p-4"><div><p className="font-bold">{shop.isOpen ? "Your shop is open" : "Your shop is closed"}</p><p className="text-xs text-stone-500">Status updates on the customer homepage.</p></div><button onClick={() => void setDoc(doc(db, "settings", "shop"), { isOpen: !shop.isOpen }, { merge: true })} className={`rounded-full px-5 py-2.5 text-sm font-bold text-white ${shop.isOpen ? "bg-[#bb5943]" : "bg-[#426b47]"}`}>{shop.isOpen ? "Close shop" : "Open shop"}</button></div><form onSubmit={saveNotice} className="mt-5 grid gap-3"><label><span className="label">Customer notice</span><textarea className="field min-h-24" value={notice} onChange={(e) => setNotice(e.target.value)} placeholder="Shop will close at 10 PM…" maxLength={240} /></label><button className="btn-primary w-fit">Save notice</button>{saved && <p className="text-sm text-green-700">Notice saved.</p>}</form></div></section>;
}

export default App;
