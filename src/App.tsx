import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, NavLink, Route, Routes, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  addDoc, collection, deleteDoc, doc, getDoc, onSnapshot, orderBy, query, serverTimestamp, setDoc, where, writeBatch
} from "firebase/firestore";
import { createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { QRCodeSVG } from "qrcode.react";
import {
  ArrowLeft, ArrowRight, Check, ChevronLeft, ChevronRight, CircleUserRound, Clock3, Gem, Menu, Plus, Search, ShoppingBag, ShoppingCart, Sparkles, Trash2, X
} from "lucide-react";
import { auth, db, functions, isFirebaseConfigured, storage } from "./firebase";
import type { Category, CustomerProfile, DeliveryMethod, Order, Product, ShopBanner, ShopSettings } from "./types";

const CONTACT = "9729794568";
const UPI_ID = "manishataneja980@oksbi";
const DELIVERY_FEE = 10;
const HOSTEL_NAME = "Kalpana Hostel";
const PICKUP_LOCATION = "Room No. 222, Kalpana Hostel, Landran, Mohali, Punjab";
const DEFAULT_CATEGORIES = [
  "Anti-Tarnish Jewellery", "Earrings", "Oxidised Jewellery", "Neckpieces", "Rings", "Bracelets",
  "Nose Pins", "Anklets", "Press-On Nails", "Hair Accessories", "Jewellery Organizers", "Gift Sets"
];
const EDITORIAL_IMAGES = [
  "https://images.unsplash.com/photo-1611652022419-a9419f74343d?auto=format&fit=crop&w=1200&q=85",
  "https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&w=900&q=85",
  "https://images.unsplash.com/photo-1617038220319-276d3cfab638?auto=format&fit=crop&w=900&q=85",
  "https://images.unsplash.com/photo-1611085583191-a3b181a88401?auto=format&fit=crop&w=900&q=85"
];
const money = (amount: number) => `₹${amount.toFixed(2).replace(/\.00$/, "")}`;
const sellingPrice = (product: Product) => product.discountPrice && product.discountPrice > 0 && product.discountPrice < product.price ? product.discountPrice : product.price;
const timestamp = (value?: { seconds: number }) => value ? new Date(value.seconds * 1000).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "Just now";
const categorySlug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

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
        const token = await current.getIdTokenResult();
        setIsAdmin(token.claims.admin === true);
      } catch (error) { console.error("Unable to verify administrator role", error); }
      try {
        const userDoc = await getDoc(doc(db, "users", current.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          setProfile({
            fullName: String(data.fullName ?? ""),
            mobile: String(data.mobile ?? ""),
            email: String(data.email ?? ""),
            roomNumber: String(data.roomNumber ?? ""),
            deliveryAddress: String(data.deliveryAddress ?? "")
          });
        }
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
        <Route path="/products/:productId" element={<ProductDetail addToCart={addToCart} />} />
        <Route path="/categories" element={<Categories />} />
        <Route path="/login" element={<Login onSignedIn={() => navigate("/profile")} />} />
        <Route path="/admin/login" element={<AdminLogin onSignedIn={() => { setIsAdmin(true); navigate("/admin"); }} />} />
        <Route path="/profile" element={<Protected user={user}><Profile user={user!} profile={profile} onSave={setProfile} /></Protected>} />
        <Route path="/cart" element={<Cart cart={cart} setQuantity={setQuantity} user={user} profile={profile} clearCart={clearCart} />} />
        <Route path="/orders" element={<Protected user={user}><Orders user={user!} admin={isAdmin} /></Protected>} />
        <Route path="/admin" element={<Protected user={user} requireAdmin isAdmin={isAdmin}><Admin /></Protected>} />
        <Route path="*" element={<Home addToCart={addToCart} />} />
      </Routes>
      <Footer />
    </div>
  );
}

function SetupRequired() {
  return <main className="page-shell grid min-h-screen place-items-center py-10"><div className="card soft-shadow max-w-xl p-8">
    <div className="mb-3 flex items-center gap-3"><img src="/the-trio-shop-logo.jpeg" alt="The Trio Shop logo" className="h-14 w-14 rounded-full object-contain" /><h1 className="text-2xl font-bold">THE TRIO SHOP</h1></div>
    <h2 className="mb-2 text-lg font-bold">Connect your Firebase project</h2>
    <p className="mb-4 text-sm leading-6 text-stone-600">Add your Firebase web app settings to <code>.env</code> (use <code>.env.example</code> as a guide), enable Email/Password Authentication, and deploy the included Firestore rules and Cloud Functions.</p>
    <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">No demo data or insecure fallback is enabled. The app will connect to your live Firebase project once configured.</p>
  </div></main>;
}

function Header({ user, admin, cartCount }: { user: User | null; admin: boolean; cartCount: number }) {
  const [open, setOpen] = useState(false);
  const links = [
    ["Home", "/"], ["Shop", "/products"], ["Categories", "/categories"],
    ...(user && !admin ? [["My Orders", "/orders"], ["Profile", "/profile"]] : []),
    ...(!admin ? [["Admin sign in", "/admin/login"]] : [])
  ];
  return <header className="sticky top-0 z-30 border-b border-[#efe5e5] bg-white/95 backdrop-blur">
    <div className="page-shell flex h-[76px] items-center justify-between gap-5">
      <Link to="/" className="flex shrink-0 items-center gap-2.5">
        <img src="/the-trio-shop-logo.jpeg" alt="The Trio Shop logo" className="h-[68px] w-[68px] object-contain" />
        <span><strong className="brand-serif block text-[13px] leading-5 tracking-[.08em]">THE TRIO SHOP</strong><small className="text-[11px] text-stone-500">Jewellery & accessories</small></span>
      </Link>
      <nav className="hidden items-center gap-7 md:flex">{links.map(([label, path]) => <NavLink key={path} to={path} className={({ isActive }) => `text-sm font-medium ${isActive ? "text-[#8a5867]" : "text-stone-600 hover:text-stone-950"}`}>{label}</NavLink>)}</nav>
      <div className="flex items-center gap-2">
        <Link aria-label="Your cart" to="/cart" className="relative grid h-10 w-10 place-items-center rounded-xl hover:bg-[#fbf5f5]"><ShoppingCart size={19} />{cartCount > 0 && <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[#b97782] px-1 text-[10px] font-bold text-white">{cartCount}</span>}</Link>
        {user && admin ? <Link to="/admin" className="hidden rounded-xl border border-[#efe5e5] bg-white px-3 py-2 text-sm font-semibold sm:block">Admin</Link> : !user ? <Link to="/login" className="hidden rounded-xl border border-[#efe5e5] bg-white px-3 py-2 text-sm font-semibold sm:block">Log in</Link> : null}
        <button className="grid h-10 w-10 place-items-center rounded-xl md:hidden" onClick={() => setOpen(!open)} aria-label="Toggle menu">{open ? <X size={20} /> : <Menu size={20} />}</button>
      </div>
    </div>
    {open && <nav className="page-shell grid gap-1 border-t border-[#eae9e2] py-3 md:hidden">{links.map(([label, path]) => <Link onClick={() => setOpen(false)} key={path} className="rounded-lg px-3 py-2 text-sm" to={path}>{label}</Link>)}<Link onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 text-sm" to={user ? admin ? "/admin" : "/profile" : "/login"}>{user ? admin ? "Admin dashboard" : "My profile" : "Log in / sign up"}</Link></nav>}
  </header>;
}

function Footer() {
  return <footer className="mt-20 border-t border-[#efe5e5] bg-white py-8"><div className="page-shell grid gap-4 text-sm text-stone-500 sm:grid-cols-2 sm:items-center"><p>© {new Date().getFullYear()} THE TRIO SHOP · Jewellery for your every day.</p><div className="grid gap-2 sm:justify-items-end"><p>Location: {PICKUP_LOCATION}</p><div className="flex items-center gap-5"><a href={`tel:${CONTACT}`} className="hover:text-[#8a5867]">Call {CONTACT}</a><a href={`https://wa.me/91${CONTACT}`} target="_blank" rel="noreferrer" className="font-semibold text-[#8a5867]">WhatsApp us</a></div></div></div></footer>;
}

function Protected({ user, requireAdmin = false, isAdmin = false, children }: { user: User | null; requireAdmin?: boolean; isAdmin?: boolean; children: ReactNode }) {
  if (!user) return <main className="page-shell py-20 text-center"><h2 className="mb-2 text-2xl font-bold">{requireAdmin ? "Administrator sign in required" : "Sign in to continue"}</h2><p className="mb-5 text-stone-500">{requireAdmin ? "Only authorized administrators can access the dashboard." : "Your account keeps your room details and orders together."}</p><Link className="btn-primary inline-block" to={requireAdmin ? "/admin/login" : "/login"}>{requireAdmin ? "Admin sign in" : "Log in or create account"}</Link></main>;
  if (requireAdmin && !isAdmin) return <main className="page-shell py-20 text-center"><h2 className="text-2xl font-bold">Access restricted</h2><p className="mt-2 text-stone-500">This area is available to authorized administrators only.</p><Link className="btn-primary mt-5 inline-block" to="/admin/login">Admin sign in</Link></main>;
  return <>{children}</>;
}

function ShopStatus({ shop }: { shop: ShopSettings }) {
  return <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold ${shop.isOpen ? "bg-[#edf4ed] text-[#466b4d]" : "bg-[#fff0f1] text-[#a94858]"}`}>
    <span className={`h-2 w-2 rounded-full ${shop.isOpen ? "bg-[#5d9564]" : "bg-[#d65e70]"}`} />Shop is {shop.isOpen ? "Open" : "Closed"}
  </div>;
}

function Home({ addToCart }: { addToCart: (id: string, quantity?: number) => void }) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const products = useCollection<Product>("products", [where("active", "==", true)]);
  const categories = useCollection<Category>("categories", [where("active", "==", true)]);
  const banners = useCollection<ShopBanner>("banners", [where("active", "==", true)]);
  const shop = useShop();
  const latest = [...products].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  const displayCategories = categories.slice(0, 6);
  const liveBanners = banners.filter((banner) => {
    const now = new Date();
    return (!banner.startsAt || new Date(banner.startsAt) <= now) && (!banner.endsAt || new Date(banner.endsAt) >= now);
  });
  function searchProducts(event: FormEvent) {
    event.preventDefault();
    navigate(`/products${search.trim() ? `?search=${encodeURIComponent(search.trim())}` : ""}`);
  }
  return <main className="page-shell">
    {liveBanners.slice(0, 1).map((banner) => <Link to="/products" key={banner.id} className="group relative mt-5 block min-h-40 overflow-hidden rounded-[26px] bg-[#f1dfe2]">
      {banner.imageUrl && <img src={banner.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30 transition-transform duration-500 group-hover:scale-[1.02]" />}
      <div className="relative px-6 py-7 sm:px-10 sm:py-8"><p className="text-xs font-bold uppercase tracking-[.2em] text-[#885d67]">{banner.discount || "A little something lovely"}</p><h2 className="brand-serif mt-1 text-2xl font-bold sm:text-3xl">{banner.title}</h2><p className="mt-1 text-sm text-[#594a4c]">{banner.description}</p></div>
    </Link>)}
    <section className="grid items-center gap-8 py-10 md:grid-cols-[1fr_.95fr] md:py-14">
      <div className="order-2 md:order-1"><div className="flex flex-wrap items-center gap-3"><ShopStatus shop={shop} /><span className="text-[11px] font-semibold uppercase tracking-[.16em] text-[#9b7a66]">A little lovely, every day</span></div>
        <h1 className="brand-serif mt-5 max-w-xl text-[43px] font-medium leading-[1.04] tracking-[-.035em] sm:text-[62px]">Your everyday,<br /><em className="font-normal text-[#a96f7b]">a little more</em> golden.</h1>
        <p className="mt-4 max-w-md text-base leading-7 text-stone-600">Jewellery and little treasures for campus days, late-night plans, and everything in between.</p>
        {shop.notice && <p className="mt-4 max-w-md rounded-xl bg-[#fbf0e8] px-4 py-3 text-sm font-medium text-[#7a5e50]">{shop.notice}</p>}
        <form onSubmit={searchProducts} className="mt-6 flex max-w-lg items-center rounded-2xl border border-[#eee2df] bg-white p-1.5 shadow-[0_8px_28px_rgba(74,49,53,.06)]"><Search className="ml-3 shrink-0 text-[#9a8383]" size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find your new favourite…" aria-label="Search jewellery and accessories" className="min-w-0 flex-1 border-0 bg-transparent px-3 py-3 text-sm outline-none" /><button className="btn-primary px-4 py-2.5">Search</button></form>
        <div className="mt-4 flex flex-wrap items-center gap-4"><Link to="/products" className="inline-flex items-center gap-2 text-sm font-bold text-[#805461]">Explore the collection <ArrowRight size={16} /></Link><a href={`https://wa.me/91${CONTACT}`} target="_blank" rel="noreferrer" className="text-sm font-semibold text-stone-500">Need a hand? Chat with us</a></div>
      </div>
      <div className="relative order-1 mx-auto w-full max-w-[520px] md:order-2">
        <div className="absolute -left-3 top-8 h-20 w-20 rounded-full bg-[#f2dfe1] blur-2xl sm:-left-5 sm:h-28 sm:w-28" />
        <div className="relative overflow-hidden rounded-t-[48%] rounded-b-[26px] bg-[#ead8d0] p-2 shadow-[0_24px_70px_rgba(90,59,61,.14)]">
          <img src={EDITORIAL_IMAGES[0]} alt="Gold jewellery styled for an everyday look" className="h-[340px] w-full rounded-t-[48%] rounded-b-[22px] object-cover sm:h-[440px]" />
          <div className="absolute bottom-7 left-7 rounded-2xl bg-white/90 px-4 py-3 shadow-lg backdrop-blur"><p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#a16c71]">The everyday edit</p><p className="brand-serif mt-0.5 text-lg">Made to feel like you.</p></div>
        </div>
      </div>
    </section>
    <section className="pb-12"><SectionTitle title="Find your kind of sparkle" action="All categories" to="/categories" /><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">{displayCategories.map((category, index) => <Link to={`/products?category=${category.id}`} className="group card overflow-hidden p-2.5 transition-transform hover:-translate-y-1" key={category.id}><div className="grid h-28 place-items-center overflow-hidden rounded-xl bg-[#f6eceb] text-4xl">{category.imageUrl ? <img src={category.imageUrl} alt={category.name} className="h-full w-full object-cover transition-transform group-hover:scale-105" /> : <img src={EDITORIAL_IMAGES[(index + 1) % EDITORIAL_IMAGES.length]} alt="" className="h-full w-full object-cover" />}</div><p className="mt-2 min-h-9 text-xs font-bold leading-4">{category.name}</p></Link>)}{displayCategories.length === 0 && <p className="col-span-full card p-6 text-center text-sm text-stone-500">Jewellery categories are coming soon.</p>}</div></section>
    {liveBanners.length > 0 && <section className="mb-12 rounded-[26px] bg-[#f7ece8] p-5 sm:p-7"><div className="mb-4 flex items-center justify-between"><div><p className="text-[11px] font-bold uppercase tracking-[.2em] text-[#a16c71]">A little treat</p><h2 className="brand-serif mt-1 text-2xl">Special offers</h2></div><Sparkles className="text-[#aa7d69]" /></div><div className="grid gap-3 sm:grid-cols-2">{liveBanners.slice(0, 2).map((banner) => <Link key={banner.id} to="/products" className="rounded-2xl bg-white/80 p-4"><p className="text-xs font-bold uppercase tracking-widest text-[#a16c71]">{banner.discount || "Just for you"}</p><p className="brand-serif mt-1 text-xl">{banner.title}</p><p className="mt-1 text-sm text-stone-600">{banner.description}</p></Link>)}</div></section>}
    <section className="pb-8"><SectionTitle title="New arrivals" action="Shop all" to="/products" /><p className="mt-1 text-sm text-stone-500">Fresh little favourites, just added.</p><div className="mt-4"><ProductGrid products={latest.slice(0, 4)} addToCart={addToCart} /></div></section>
    {products.some((product) => product.featured) && <section className="mt-10"><SectionTitle title="Featured jewellery" action="Discover the collection" to="/products" /><div className="mt-4"><ProductGrid products={products.filter((product) => product.featured).slice(0, 4)} addToCart={addToCart} /></div></section>}
    {products.some((product) => product.popular) && <section className="mt-10"><SectionTitle title="Best sellers" action="Shop best sellers" to="/products" /><p className="mt-1 text-sm text-stone-500">Loved, worn, and loved again.</p><div className="mt-4"><ProductGrid products={products.filter((product) => product.popular).slice(0, 4)} addToCart={addToCart} /></div></section>}
    {products.some((product) => product.trending) && <section className="mt-10"><SectionTitle title="Trending accessories" action="Explore the edit" to="/products" /><div className="mt-4"><ProductGrid products={products.filter((product) => product.trending).slice(0, 4)} addToCart={addToCart} /></div></section>}
    <section className="my-12 grid overflow-hidden rounded-[26px] bg-[#f2e4df] md:grid-cols-[1.1fr_.9fr]"><div className="p-6 sm:p-10"><p className="text-xs font-bold uppercase tracking-[.2em] text-[#a16c71]">THE TRIO GIRL</p><h2 className="brand-serif mt-2 text-3xl sm:text-4xl">A little detail.<br />A whole new feeling.</h2><p className="mt-3 max-w-md text-sm leading-6 text-stone-600">Thoughtful accessories for your everyday campus style, delivered right to your hostel room.</p><Link to="/products" className="btn-primary mt-5 inline-flex items-center gap-2">Discover your next favourite <ArrowRight size={16} /></Link></div><img src={EDITORIAL_IMAGES[2]} alt="Delicate jewellery styling" className="hidden h-full min-h-64 w-full object-cover md:block" /></section>
  </main>;
}

function SectionTitle({ title, action, to }: { title: string; action: string; to: string }) {
  return <div className="flex items-end justify-between"><h2 className="brand-serif text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2><Link to={to} className="text-sm font-semibold text-[#8a5867]">{action} <span aria-hidden>→</span></Link></div>;
}

function Products({ addToCart }: { addToCart: (id: string, quantity?: number) => void }) {
  const products = useCollection<Product>("products", [where("active", "==", true)]);
  const categories = useCollection<Category>("categories", [where("active", "==", true)]);
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get("search") || "");
  const categoryId = params.get("category") || "";
  const filtered = products.filter((p) => `${p.name} ${p.description}`.toLowerCase().includes(search.toLowerCase()) && (!categoryId || p.categoryId === categoryId));
  return <main className="page-shell py-10"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-semibold uppercase tracking-[.18em] text-[#a16c71]">THE TRIO COLLECTION</p><h1 className="brand-serif mt-1 text-4xl font-semibold">Jewellery & accessories</h1></div><div className="relative w-full sm:max-w-xs"><Search size={17} className="absolute left-3 top-3.5 text-stone-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search jewellery…" className="field pl-10" /></div></div>
    <div className="my-5 flex gap-2 overflow-auto pb-2"><button onClick={() => setParams(search ? { search } : {})} className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${!categoryId ? "bg-[#8a5867] text-white" : "bg-white"}`}>Everything</button>{categories.map((category) => <button key={category.id} onClick={() => setParams(search ? { category: category.id, search } : { category: category.id })} className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${categoryId === category.id ? "bg-[#8a5867] text-white" : "bg-white"}`}>{category.name}</button>)}</div>
    <ProductGrid products={filtered} addToCart={addToCart} />
  </main>;
}

function ProductGrid({ products, addToCart }: { products: Product[]; addToCart: (id: string, quantity?: number) => void }) {
  const shop = useShop();
  if (products.length === 0) return <div className="card py-14 text-center text-sm text-stone-500">No products here just yet. Check back soon!</div>;
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">{products.map((product) => {
    const available = product.stock > 0;
    const photo = product.images?.[0] || product.imageUrl;
    const price = sellingPrice(product);
    return <article className="card overflow-hidden" key={product.id}>
      <div className="relative grid aspect-[.88] place-items-center overflow-hidden bg-[#f6eeec]">{photo ? <Link to={`/products/${product.id}`} className="h-full w-full"><img src={photo} alt={product.name} className="h-full w-full object-cover transition-transform duration-500 hover:scale-[1.03]" /></Link> : <Link to={`/products/${product.id}`} className="grid h-full w-full place-items-center"><Gem className="text-[#c29b91]" size={48} /></Link>}<span className={`absolute left-2 top-2 pill ${available ? "bg-white/90 text-[#6b7b63]" : "bg-[#fff0f1] text-[#a94858]"}`}>{available ? "In stock" : "Sold out"}</span>{price < product.price && <span className="absolute right-2 top-2 pill bg-[#9a6570] text-white">Special price</span>}</div>
      <div className="p-3 sm:p-4"><Link to={`/products/${product.id}`}><h3 className="line-clamp-1 text-sm font-semibold hover:text-[#8a5867]">{product.name}</h3></Link><p className="mt-1 line-clamp-2 min-h-9 text-xs leading-4 text-stone-500">{product.description}</p><div className="mt-3 flex items-center justify-between gap-1"><div className="flex items-baseline gap-1.5"><strong className="text-[15px]">{money(price)}</strong>{price < product.price && <del className="text-xs text-stone-400">{money(product.price)}</del>}</div><button disabled={!available || !shop.isOpen} onClick={() => addToCart(product.id)} className="grid h-9 w-9 place-items-center rounded-xl bg-[#8a5867] text-white disabled:bg-stone-300" aria-label={`Add ${product.name} to cart`}><Plus size={18} /></button></div></div>
    </article>;
  })}</div>;
}

function ProductDetail({ addToCart }: { addToCart: (id: string, quantity?: number) => void }) {
  const { productId } = useParams();
  const products = useCollection<Product>("products", [where("active", "==", true)]);
  const product = products.find((item) => item.id === productId);
  const shop = useShop();
  const [imageIndex, setImageIndex] = useState(0);
  useEffect(() => setImageIndex(0), [productId]);
  if (!product) return <main className="page-shell py-20 text-center"><p className="brand-serif text-2xl">Looking for that lovely piece…</p><Link to="/products" className="mt-4 inline-block text-sm font-bold text-[#8a5867]">Back to the collection</Link></main>;
  const images = product.images?.length ? product.images : product.imageUrl ? [product.imageUrl] : [];
  const price = sellingPrice(product);
  const step = (direction: number) => setImageIndex((current) => (current + direction + images.length) % images.length);
  return <main className="page-shell py-8 sm:py-12"><Link to="/products" className="inline-flex items-center gap-2 text-sm font-semibold text-[#8a5867]"><ArrowLeft size={16} /> Back to the collection</Link><section className="mt-5 grid gap-8 md:grid-cols-2 md:gap-12">
    <div><div className="relative aspect-[.9] overflow-hidden rounded-[28px] bg-[#f6eeec]">{images.length ? <img src={images[imageIndex]} alt={`${product.name} view ${imageIndex + 1}`} className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center"><Gem size={60} className="text-[#c29b91]" /></div>}{images.length > 1 && <><button onClick={() => step(-1)} aria-label="Previous image" className="absolute left-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/90"><ChevronLeft /></button><button onClick={() => step(1)} aria-label="Next image" className="absolute right-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/90"><ChevronRight /></button></>}</div>{images.length > 1 && <div className="mt-3 flex gap-2 overflow-auto">{images.map((image, index) => <button key={image} onClick={() => setImageIndex(index)} className={`h-16 w-16 shrink-0 overflow-hidden rounded-xl border-2 ${index === imageIndex ? "border-[#9a6570]" : "border-transparent"}`}><img src={image} alt={`${product.name} thumbnail ${index + 1}`} className="h-full w-full object-cover" /></button>)}</div>}</div>
    <div className="flex flex-col justify-center"><p className="text-xs font-bold uppercase tracking-[.2em] text-[#a16c71]">THE TRIO EDIT</p><h1 className="brand-serif mt-2 text-4xl font-semibold">{product.name}</h1><p className="mt-4 leading-7 text-stone-600">{product.description}</p><div className="mt-5 flex items-center gap-3"><strong className="text-2xl">{money(price)}</strong>{price < product.price && <del className="text-lg text-stone-400">{money(product.price)}</del>}</div><p className={`mt-4 text-sm font-semibold ${product.stock > 0 ? "text-[#668064]" : "text-[#a94858]"}`}>{product.stock > 0 ? `In stock · ${product.stock} available` : "Currently out of stock"}</p>{!shop.isOpen && <p className="mt-2 text-sm text-[#a94858]">The shop is closed for new orders right now.</p>}<button disabled={product.stock < 1 || !shop.isOpen} onClick={() => addToCart(product.id)} className="btn-primary mt-6 inline-flex w-full items-center justify-center gap-2 sm:w-fit"><ShoppingBag size={17} /> Add to bag</button><div className="mt-6 border-t border-[#eee2df] pt-5 text-sm leading-6 text-stone-500"><p><Check className="mr-2 inline text-[#8a5867]" size={15} />Delivered to your hostel room</p><p><Check className="mr-2 inline text-[#8a5867]" size={15} />Secure prepaid checkout</p><p><Check className="mr-2 inline text-[#8a5867]" size={15} />Payment verified before order confirmation</p></div></div>
  </section></main>;
}

function Categories() {
  const categories = useCollection<Category>("categories", [where("active", "==", true)]);
  return <main className="page-shell py-12"><p className="text-sm font-semibold uppercase tracking-[.18em] text-[#a16c71]">EXPLORE THE EDITS</p><h1 className="brand-serif mt-1 text-4xl font-semibold">Find your kind of sparkle</h1><p className="mt-2 max-w-xl text-sm leading-6 text-stone-500">From everyday hoops to little gifts worth keeping, there’s a piece for every version of you.</p><div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">{categories.map((category, index) => <Link key={category.id} to={`/products?category=${category.id}`} className="card group overflow-hidden"><div className="aspect-[1.15] overflow-hidden bg-[#f6eceb]">{category.imageUrl ? <img className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" src={category.imageUrl} alt={category.name} /> : <img className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" src={EDITORIAL_IMAGES[index % EDITORIAL_IMAGES.length]} alt="" />}</div><p className="p-4 font-semibold">{category.name}<ArrowRight className="float-right text-[#a16c71]" size={18} /></p></Link>)}{categories.length === 0 && <p className="col-span-full card p-8 text-center text-sm text-stone-500">No categories are available right now.</p>}</div></main>;
}

function Login({ onSignedIn }: { onSignedIn: () => void }) {
  const [register, setRegister] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [profile, setProfile] = useState<CustomerProfile>({ fullName: "", mobile: "", email: "", roomNumber: "", deliveryAddress: "" });
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
    <span className="text-sm font-bold text-[#a16c71]">{register ? "YOUR HOSTEL ACCOUNT" : "WELCOME BACK"}</span><h1 className="mt-2 text-2xl font-extrabold">{register ? "A room number away." : "Good to see you."}</h1><p className="mt-1 text-sm text-stone-500">{register ? "Sign up to get your jewellery delivered to your room." : "Sign in to shop and track your orders."}</p>
    <div className="mt-6 grid gap-4">
      {register && <><Field label="Full name" value={profile.fullName} onChange={(v) => update("fullName", v)} required /><Field label="Mobile number" value={profile.mobile} onChange={(v) => update("mobile", v)} type="tel" required /><Field label="Room number" value={profile.roomNumber} onChange={(v) => update("roomNumber", v)} required /><Field label="Delivery address / hostel block" value={profile.deliveryAddress} onChange={(v) => update("deliveryAddress", v)} required /></>}
      <Field label="Email address" value={email} onChange={setEmail} type="email" required /><Field label="Password" value={password} onChange={setPassword} type="password" required minLength={6} />
    </div>
    {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    <button className="btn-primary mt-5 w-full" disabled={busy}>{busy ? "One moment…" : register ? "Create my account" : "Log in"}</button>
    <button type="button" className="mt-4 w-full text-sm font-semibold text-[#8a5867]" onClick={() => { setRegister(!register); setError(""); }}>{register ? "Already have an account? Log in" : "New to THE TRIO SHOP? Create an account"}</button>
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
      const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
      const token = await credential.user.getIdTokenResult(true);
      if (token.claims.admin !== true) {
        await signOut(auth);
        setError("This account is not authorized as an admin. Ask the project owner to grant the admin role.");
        return;
      }
      onSignedIn();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to sign in."); }
    finally { setBusy(false); }
  }
  return <main className="page-shell grid min-h-[65vh] place-items-center py-10"><form onSubmit={submit} className="card soft-shadow w-full max-w-md p-6 sm:p-8">
    <span className="text-sm font-bold text-[#a16c71]">AUTHORIZED STAFF</span><h1 className="mt-2 text-2xl font-extrabold">Administrator sign in</h1><p className="mt-1 text-sm text-stone-500">Use your authorized Firebase account. Admin access is verified securely by the server.</p>
    <div className="mt-6 grid gap-4"><Field label="Admin email" value={email} onChange={setEmail} type="email" required /><Field label="Password" value={password} onChange={setPassword} type="password" required /></div>
    {error && <p className="mt-3 break-words text-sm text-red-600">{error}</p>}
    <button className="btn-primary mt-5 w-full" disabled={busy}>{busy ? "Signing in…" : "Sign in to dashboard"}</button>
  </form></main>;
}

function Field({ label, value, onChange, type = "text", required = false, minLength }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean; minLength?: number }) {
  return <label><span className="label">{label}</span><input className="field" type={type} value={value} onChange={(e) => onChange(e.target.value)} required={required} minLength={minLength} /></label>;
}

function Profile({ user, profile, onSave }: { user: User; profile: CustomerProfile | null; onSave: (value: CustomerProfile) => void }) {
  const [form, setForm] = useState<CustomerProfile>(profile || { fullName: "", mobile: "", email: user.email || "", roomNumber: "", deliveryAddress: "" });
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
  return <main className="page-shell py-10"><div className="mx-auto max-w-2xl"><div className="flex items-center gap-3"><CircleUserRound className="text-[#a16c71]" size={28} /><div><p className="text-sm text-stone-500">YOUR ACCOUNT</p><h1 className="text-2xl font-extrabold">Delivery details</h1></div></div><form onSubmit={save} className="card mt-6 grid gap-4 p-5 sm:grid-cols-2 sm:p-7">
    <Field label="Full name" value={form.fullName} onChange={(v) => update("fullName", v)} required /><Field label="Mobile number" value={form.mobile} onChange={(v) => update("mobile", v)} type="tel" required /><label className="sm:col-span-2"><span className="label">Email address</span><input className="field bg-stone-50" value={user.email || ""} readOnly /></label><Field label="Room number" value={form.roomNumber} onChange={(v) => update("roomNumber", v)} required /><div className="sm:col-span-2"><Field label="Delivery address / hostel block" value={form.deliveryAddress} onChange={(v) => update("deliveryAddress", v)} required /></div>
    {message && <p className="text-sm text-green-700 sm:col-span-2">{message}</p>}{error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}<button className="btn-primary sm:col-span-2">Save changes</button><button type="button" onClick={() => void signOut(auth)} className="text-sm font-semibold text-stone-500 sm:col-span-2">Sign out</button>
  </form></div></main>;
}

function Cart({ cart, setQuantity, user, profile, clearCart }: { cart: Record<string, number>; setQuantity: (id: string, qty: number) => void; user: User | null; profile: CustomerProfile | null; clearCart: () => void }) {
  const products = useCollection<Product>("products", [where("active", "==", true)]);
  const shop = useShop();
  const [room, setRoom] = useState(profile?.roomNumber || "");
  const [address, setAddress] = useState(profile?.deliveryAddress || "");
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod | "">("");
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
  const subtotal = cartProducts.reduce((sum, product) => sum + sellingPrice(product) * cart[product.id], 0);
  const deliveryFee = deliveryMethod === "room_delivery" ? DELIVERY_FEE : 0;
  const total = subtotal + deliveryFee;
  const upiLink = deliveryMethod
    ? `upi://pay?pa=${encodeURIComponent(UPI_ID)}&pn=${encodeURIComponent("The Trio Shop")}&am=${total.toFixed(2)}&cu=INR&tn=${encodeURIComponent("Jewellery order")}`
    : "";

  async function placeOrder(event: FormEvent) {
    event.preventDefault(); setError(""); setBusy(true);
    try {
      if (!deliveryMethod) throw new Error("Choose a delivery method before continuing to payment.");
      const create = httpsCallable(functions, "createOrder");
      const result = await create({
        items: cartProducts.map((product) => ({ productId: product.id, quantity: cart[product.id] })),
        deliveryMethod,
        roomNumber: deliveryMethod === "room_delivery" ? room : "",
        deliveryAddress: deliveryMethod === "room_delivery" ? address : "",
        paymentReference: reference
      });
      setOrderId((result.data as { orderId: string }).orderId);
      clearCart();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to place your order."); }
    finally { setBusy(false); }
  }

  if (orderId) return <main className="page-shell py-16"><div className="card mx-auto max-w-xl p-7 text-center"><span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#e6f0e5] text-[#426b47]"><Clock3 /></span><h1 className="mt-4 text-2xl font-extrabold">Payment verification in progress</h1><p className="mt-2 text-sm leading-6 text-stone-600">Your order <strong>#{orderId.slice(0, 8)}</strong> is saved. We’ll confirm it after an admin verifies your UPI payment; entering a reference doesn’t mark an order paid.</p><Link className="btn-primary mt-5 inline-flex" to="/orders">Track my order</Link></div></main>;
  if (cartProducts.length === 0) return <main className="page-shell py-20 text-center"><Gem className="mx-auto text-[#ad7b81]" size={35} /><h1 className="brand-serif mt-4 text-2xl font-semibold">Your jewellery box is waiting.</h1><p className="mt-2 text-stone-500">Find a little something that feels like you.</p><Link className="btn-primary mt-5 inline-block" to="/products">Browse the collection</Link></main>;

  return <main className="page-shell py-10"><h1 className="brand-serif text-4xl font-semibold">Your bag</h1><div className="mt-6 grid items-start gap-5 lg:grid-cols-[1fr_360px]"><div className="grid gap-3">{cartProducts.map((product) => <div className="card flex gap-4 p-3 sm:p-4" key={product.id}><div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-xl bg-[#f6eeec]">{(product.images?.[0] || product.imageUrl) ? <img src={product.images?.[0] || product.imageUrl || ""} alt="" className="h-full w-full object-cover" /> : <Gem className="text-[#c29b91]" />}</div><div className="min-w-0 flex-1"><h2 className="font-bold">{product.name}</h2><p className="mt-1 text-sm text-stone-500">{money(sellingPrice(product))} each</p><div className="mt-2 inline-flex items-center rounded-lg border"><button className="px-3 py-1" onClick={() => setQuantity(product.id, cart[product.id] - 1)} aria-label="Decrease quantity">−</button><span className="min-w-8 text-center text-sm">{cart[product.id]}</span><button className="px-3 py-1" onClick={() => setQuantity(product.id, cart[product.id] + 1)} aria-label="Increase quantity">+</button></div></div><div className="text-right font-bold">{money(sellingPrice(product) * cart[product.id])}<button onClick={() => setQuantity(product.id, 0)} aria-label={`Remove ${product.name}`} className="ml-auto mt-3 block text-stone-400 hover:text-red-600"><Trash2 size={17} /></button></div></div>)}</div>
    <form onSubmit={placeOrder} className="card p-5"><h2 className="text-lg font-extrabold">Checkout</h2>
      <div className="mt-4 flex justify-between text-sm"><span>Product total</span><span>{money(subtotal)}</span></div>
      <fieldset className="mt-5"><legend className="text-sm font-bold">Choose a delivery method</legend><div className="mt-2 grid gap-3">
        <label className={`cursor-pointer rounded-2xl border p-4 transition-colors ${deliveryMethod === "pickup" ? "border-[#8a5867] bg-[#fbf3f3]" : "border-[#eee2df] bg-white"}`}>
          <span className="flex items-start gap-3"><input className="mt-1 accent-[#8a5867]" type="radio" name="deliveryMethod" value="pickup" required checked={deliveryMethod === "pickup"} onChange={() => { setDeliveryMethod("pickup"); setReference(""); setError(""); }} /><span className="min-w-0 flex-1"><span className="flex flex-wrap justify-between gap-2 font-bold"><span>I'll Pick Up My Order</span><span className="pill bg-[#e6f0e5] text-[#315d3b]">FREE · ₹0</span></span><span className="mt-1 block text-sm text-stone-600">Save ₹10! Collect your jewellery order yourself.</span><span className="mt-2 block text-xs text-stone-500">Pickup location: {PICKUP_LOCATION}</span></span></span>
        </label>
        <label className={`cursor-pointer rounded-2xl border p-4 transition-colors ${deliveryMethod === "room_delivery" ? "border-[#8a5867] bg-[#fbf3f3]" : "border-[#eee2df] bg-white"}`}>
          <span className="flex items-start gap-3"><input className="mt-1 accent-[#8a5867]" type="radio" name="deliveryMethod" value="room_delivery" required checked={deliveryMethod === "room_delivery"} onChange={() => { setDeliveryMethod("room_delivery"); setReference(""); setError(""); }} /><span className="min-w-0 flex-1"><span className="flex flex-wrap justify-between gap-2 font-bold"><span>Deliver to My Room</span><span className="pill bg-[#fff4de] text-[#765b24]">₹10</span></span><span className="mt-1 block text-sm text-stone-600">Get your favourite jewellery delivered directly to your hostel room.</span></span></span>
        </label>
      </div></fieldset>
      {deliveryMethod === "room_delivery" && <div className="mt-4 grid gap-3 rounded-xl bg-[#faf6f4] p-4">
        <p className="text-sm"><span className="font-semibold">Hostel:</span> {HOSTEL_NAME}</p>
        <Field label="Room number (required)" value={room} onChange={setRoom} required />
        <Field label="Hostel block / delivery address" value={address} onChange={setAddress} required />
      </div>}
      <div className="mt-4 border-t border-dashed pt-3"><div className="flex justify-between text-sm"><span>Delivery charges</span><span>{deliveryMethod ? (deliveryFee === 0 ? "FREE · ₹0" : money(deliveryFee)) : "Choose a method"}</span></div><div className="mt-2 flex justify-between font-extrabold"><span>Final amount (prepaid)</span><span>{deliveryMethod ? money(total) : "Choose a method"}</span></div></div>
      {user ? deliveryMethod ? <><div className="mt-5 rounded-2xl bg-[#f5f4ed] p-4"><div className="flex items-center justify-between"><p className="font-bold">Pay with any UPI app</p><span className="pill bg-white">Exact total {money(total)}</span></div><div className="mt-3 flex items-center gap-4"><div className="rounded-xl bg-white p-2"><QRCodeSVG value={upiLink} size={100} /></div><div className="min-w-0 text-xs leading-5 text-stone-600">UPI ID<br /><strong className="break-all text-stone-900">{UPI_ID}</strong><br />Pay exactly {money(total)}, then enter your UPI reference below.</div></div><a href={upiLink} className="btn-light mt-3 block text-center text-sm">Open UPI app</a></div><label className="mt-4 block"><span className="label">UPI transaction reference</span><input className="field" value={reference} onChange={(e) => setReference(e.target.value)} required placeholder="Enter your payment reference" /></label><p className="mt-2 text-xs leading-5 text-stone-500">Orders remain unconfirmed until our team verifies payment. Please do not share your UPI PIN or OTP.</p>
      </> : <p className="mt-4 rounded-xl bg-[#f5f4ed] p-3 text-sm">Choose pickup or room delivery to see your exact UPI payment amount.</p> : <p className="mt-4 rounded-xl bg-[#f5f4ed] p-3 text-sm">Please <Link to="/login" className="font-bold text-[#355b3d]">log in or create an account</Link> before checkout.</p>}
      {!shop.isOpen && <p className="mt-3 text-sm font-semibold text-red-700">The shop is closed and cannot accept orders right now.</p>}{error && <p className="mt-3 break-words text-sm text-red-600">{error}</p>}
      <button disabled={!user || !profile || !shop.isOpen || busy || !deliveryMethod || (deliveryMethod === "room_delivery" && (!room.trim() || !address.trim())) || !reference.trim()} className="btn-primary mt-4 w-full">{busy ? "Submitting…" : "I’ve paid — submit for verification"}</button><p className="mt-3 text-center text-[11px] text-stone-400">Prepaid orders only. Room delivery is available inside {HOSTEL_NAME}.</p>
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
  const deliveryMethod = order.deliveryMethod ?? "room_delivery";
  return <article className="card p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold text-stone-500">ORDER #{order.id.slice(0, 8)} · {timestamp(order.createdAt)}</p><h2 className="mt-1 text-lg font-extrabold">{labels[order.status] || order.status}</h2></div><span className={`pill ${order.paymentStatus === "confirmed" ? "bg-[#e6f0e5] text-[#315d3b]" : "bg-[#fff4de] text-[#765b24]"}`}>{order.paymentStatus === "confirmed" ? "Payment confirmed" : "Payment pending verification"}</span></div>
    <div className="mt-4 grid gap-1 text-sm text-stone-600">{order.items.map((item, index) => <p key={`${item.productId}-${index}`}>{item.quantity} × {item.name} <span className="float-right font-semibold text-stone-800">{money(item.unitPrice * item.quantity)}</span></p>)}</div><div className="mt-4 border-t pt-3 text-sm"><span className={`pill ${deliveryMethod === "pickup" ? "bg-[#e6f0e5] text-[#315d3b]" : "bg-[#fff4de] text-[#765b24]"}`}>{deliveryMethod === "pickup" ? "FREE PICKUP" : "ROOM DELIVERY – ₹10"}</span>{deliveryMethod === "pickup" ? <p className="mt-2">Pickup at <strong>{order.pickupLocation || PICKUP_LOCATION}</strong></p> : <p className="mt-2">Deliver to <strong>Room {order.customer.roomNumber}</strong> · {order.customer.hostelName}{order.customer.deliveryAddress ? ` · ${order.customer.deliveryAddress}` : ""}</p>}<p className="mt-2 flex justify-between font-extrabold"><span>Prepaid total</span><span>{money(order.total)}</span></p></div>
    {order.estimatedDeliveryMinutes && order.status !== "delivered" && <p className="mt-3 rounded-xl bg-[#eaf0e5] p-3 text-sm font-semibold text-[#355b3d]">{deliveryMethod === "pickup" ? `Your order will be ready for pickup in approximately ${order.estimatedDeliveryMinutes} minutes.` : `Your order will reach your room in approximately ${order.estimatedDeliveryMinutes} minutes.`}</p>}
    {order.status === "payment_verification" && <p className="mt-2 text-xs text-stone-500">Payment reference: {order.paymentReference}</p>}{order.rejectReason && <p className="mt-2 text-sm text-red-700">{order.rejectReason}</p>}
  </article>;
}

function Admin() {
  const [tab, setTab] = useState("Overview");
  const tabs = ["Overview", "Orders", "Products", "Categories", "Banners", "Shop"];
  return <main className="page-shell py-8"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-semibold text-[#a16c71]">THE TRIO SHOP · JEWELLERY & ACCESSORIES</p><h1 className="brand-serif text-4xl font-semibold">Admin dashboard</h1></div><button onClick={() => void signOut(auth)} className="btn-light">Sign out</button></div>
    <div className="mt-6 flex gap-2 overflow-x-auto pb-2">{tabs.map((name) => <button onClick={() => setTab(name)} key={name} className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold ${tab === name ? "bg-[#8a5867] text-white" : "bg-white text-stone-600"}`}>{name}</button>)}</div>
    {tab === "Overview" && <Dashboard />}
    {tab === "Orders" && <AdminOrders />}
    {tab === "Products" && <ProductManager />}
    {tab === "Categories" && <CategoryManager />}
    {tab === "Banners" && <BannerManager />}
    {tab === "Shop" && <ShopManager />}
    <p className="mt-8 text-xs text-stone-400">Admin access is secured by Firebase custom claims.</p>
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
  const deliveryMethod = order.deliveryMethod ?? "room_delivery";
  async function update(data: Record<string, unknown>) {
    setBusy(true); setMessage("");
    try { await httpsCallable(functions, "updateOrder")({ orderId: order.id, ...data }); setMessage("Order updated."); }
    catch (e) { setMessage(e instanceof Error ? e.message : "Unable to update order."); }
    finally { setBusy(false); }
  }
  return <article className="card p-5"><div className="flex flex-wrap justify-between gap-3"><div><p className="text-xs text-stone-500">#{order.id} · {timestamp(order.createdAt)}</p><h2 className="mt-1 font-extrabold">{order.customer.fullName} · {money(order.total)}</h2></div><span className="pill h-fit bg-[#f1f0e9]">{order.status}</span></div>
    <section className="mt-4 rounded-xl bg-[#faf6f4] p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-bold">Customer details</h3><span className={`pill ${deliveryMethod === "pickup" ? "bg-[#e6f0e5] text-[#315d3b]" : "bg-[#fff4de] text-[#765b24]"}`}>{deliveryMethod === "pickup" ? "FREE PICKUP" : "ROOM DELIVERY – ₹10"}</span></div><dl className="mt-2 grid gap-1 text-sm text-stone-600 sm:grid-cols-2"><div><dt className="inline font-semibold text-stone-800">Mobile: </dt><dd className="inline"><a className="hover:text-[#8a5867]" href={`tel:${order.customer.mobile}`}>{order.customer.mobile}</a></dd></div><div><dt className="inline font-semibold text-stone-800">Email: </dt><dd className="inline"><a className="break-all hover:text-[#8a5867]" href={`mailto:${order.customer.email}`}>{order.customer.email}</a></dd></div><div><dt className="inline font-semibold text-stone-800">Hostel: </dt><dd className="inline">{order.customer.hostelName}</dd></div>{deliveryMethod === "room_delivery" && <><div><dt className="inline font-semibold text-stone-800">Room: </dt><dd className="inline">{order.customer.roomNumber}</dd></div><div className="sm:col-span-2"><dt className="inline font-semibold text-stone-800">Delivery address: </dt><dd className="inline">{order.customer.deliveryAddress}</dd></div></>}{deliveryMethod === "pickup" && <div className="sm:col-span-2"><dt className="inline font-semibold text-stone-800">Pickup location: </dt><dd className="inline">{order.pickupLocation || PICKUP_LOCATION}</dd></div>}</dl></section>
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
      const id = String(data.get("id") || "");
      const old = products.find((p) => p.id === id);
      const files = data.getAll("images").filter((value): value is File => value instanceof File && value.size > 0);
      const oldImages = old?.images?.length ? old.images : old?.imageUrl ? [old.imageUrl] : [];
      const images = files.length ? await Promise.all(files.map((file) => uploadImage(file, "products"))) : oldImages;
      const price = Number(data.get("price"));
      const discountValue = String(data.get("discountPrice") || "");
      const discountPrice = discountValue ? Number(discountValue) : null;
      if (discountPrice !== null && (!Number.isFinite(discountPrice) || discountPrice <= 0 || discountPrice >= price)) {
        throw new Error("Discounted price must be greater than ₹0 and lower than the regular price.");
      }
      const values = { name: String(data.get("name")), description: String(data.get("description")), price, discountPrice, stock: Number(data.get("stock")), categoryId: String(data.get("categoryId")), images, imageUrl: images[0] || "", active: data.get("active") === "on", featured: data.get("featured") === "on", popular: data.get("popular") === "on", trending: data.get("trending") === "on", updatedAt: serverTimestamp() };
      if (id) await setDoc(doc(db, "products", id), values, { merge: true }); else await addDoc(collection(db, "products"), { ...values, createdAt: serverTimestamp() });
      setEditing(null); form.reset();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save product."); }
    finally { setBusy(false); }
  }
  async function remove(id: string) {
    if (!confirm("Permanently delete this product?")) return;
    try { await deleteDoc(doc(db, "products", id)); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to delete product."); }
  }
  return <section className="mt-5 grid gap-4 lg:grid-cols-[minmax(280px,.8fr)_1.2fr]"><form key={editing?.id || "new"} onSubmit={save} className="card h-fit grid gap-3 p-5"><h2 className="text-lg font-extrabold">{editing ? "Edit product" : "Add a product"}</h2>{editing && <input type="hidden" name="id" value={editing.id} />}<label><span className="label">Product name</span><input className="field" name="name" defaultValue={editing?.name} required /></label><label><span className="label">Description</span><textarea className="field min-h-20" name="description" defaultValue={editing?.description} required /></label><div className="grid grid-cols-2 gap-3"><label><span className="label">Regular price (₹)</span><input className="field" name="price" type="number" min="0.01" step="0.01" defaultValue={editing?.price} required /></label><label><span className="label">Discounted price (₹)</span><input className="field" name="discountPrice" type="number" min="0.01" step="0.01" max={editing?.price ? editing.price - 0.01 : undefined} defaultValue={editing?.discountPrice || ""} placeholder="Optional" /></label></div><label><span className="label">Stock quantity</span><input className="field" name="stock" type="number" min="0" defaultValue={editing?.stock ?? 0} required /></label><label><span className="label">Category</span><select className="field" name="categoryId" defaultValue={editing?.categoryId || ""} required><option value="" disabled>Choose a category</option>{categories.filter((category) => category.active !== false).map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label><label><span className="label">Product photos (select multiple)</span><input className="field text-sm" name="images" type="file" accept="image/*" multiple /></label>{editing?.images?.length ? <div className="flex gap-2 overflow-auto">{editing.images.map((image) => <img src={image} alt="" key={image} className="h-12 w-12 rounded-lg object-cover" />)}</div> : null}<label className="flex items-center gap-2 text-sm"><input name="active" type="checkbox" defaultChecked={editing?.active ?? true} />Available in shop</label><label className="flex items-center gap-2 text-sm"><input name="featured" type="checkbox" defaultChecked={editing?.featured ?? false} />Feature on homepage collection</label><label className="flex items-center gap-2 text-sm"><input name="popular" type="checkbox" defaultChecked={editing?.popular ?? false} />Feature in Best Sellers</label><label className="flex items-center gap-2 text-sm"><input name="trending" type="checkbox" defaultChecked={editing?.trending ?? false} />Feature in Trending Accessories</label>{error && <p className="text-sm text-red-600">{error}</p>}<div className="flex gap-2"><button disabled={busy} className="btn-primary flex-1">{busy ? "Saving…" : editing ? "Save product" : "Add product"}</button>{editing && <button type="button" onClick={() => setEditing(null)} className="btn-light">Cancel</button>}</div></form>
    <div className="grid content-start gap-2">{products.map((product) => <div key={product.id} className="card flex items-center gap-3 p-3"><div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-[#f6eeec]">{(product.images?.[0] || product.imageUrl) ? <img src={product.images?.[0] || product.imageUrl || ""} className="h-full w-full object-cover" alt="" /> : <Gem className="text-[#c29b91]" />}</div><div className="min-w-0 flex-1"><p className="truncate font-bold">{product.name}</p><p className="text-xs text-stone-500">{money(sellingPrice(product))}{product.discountPrice && product.discountPrice < product.price ? ` (was ${money(product.price)})` : ""} · {product.stock} in stock · {product.active ? "Visible" : "Hidden"}</p></div><button className="btn-light px-3 py-2 text-xs" onClick={() => setEditing(product)}>Edit</button><button className="btn-danger" onClick={() => void remove(product.id)}>Remove</button></div>)}</div></section>;
}

function CategoryManager() {
  const categories = useCollection<Category>("categories");
  const [editing, setEditing] = useState<Category | null>(null);
  const [error, setError] = useState("");
  const [seeding, setSeeding] = useState(false);
  async function remove(id: string) {
    if (!confirm("Delete this category? Products in it will remain in your shop without a category.")) return;
    setError("");
    try { await deleteDoc(doc(db, "categories", id)); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to delete category."); }
  }
  async function seedJewelleryCategories() {
    setError(""); setSeeding(true);
    try {
      const batch = writeBatch(db);
      DEFAULT_CATEGORIES.forEach((name) => {
        batch.set(doc(db, "categories", categorySlug(name)), { name, active: true, createdAt: serverTimestamp() });
      });
      await batch.commit();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to add starter categories."); }
    finally { setSeeding(false); }
  }
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
  return <section className="mt-5 grid gap-4 md:grid-cols-[320px_1fr]"><form key={editing?.id || "new"} onSubmit={save} className="card grid h-fit gap-3 p-5">{editing && <input type="hidden" name="id" value={editing.id} />}<h2 className="font-extrabold">{editing ? "Edit category" : "Add category"}</h2><label><span className="label">Category name</span><input className="field" name="name" defaultValue={editing?.name} required /></label><label><span className="label">Image (optional)</span><input className="field text-sm" name="image" type="file" accept="image/*" /></label>{error && <p className="text-sm text-red-600">{error}</p>}<div className="flex gap-2"><button className="btn-primary flex-1">{editing ? "Save category" : "Create category"}</button>{editing && <button type="button" onClick={() => setEditing(null)} className="btn-light">Cancel</button>}</div>{categories.length === 0 && <button type="button" disabled={seeding} onClick={() => void seedJewelleryCategories()} className="btn-light">{seeding ? "Adding categories…" : "Add all 12 jewellery categories"}</button>}</form><div className="grid content-start gap-2">{categories.map((category) => <div key={category.id} className="card flex items-center gap-3 p-3"><div className="grid h-12 w-12 place-items-center overflow-hidden rounded-xl bg-[#f6eeec]">{category.imageUrl ? <img src={category.imageUrl} className="h-full w-full object-cover" alt="" /> : <Gem className="text-[#c29b91]" />}</div><span className="flex-1 font-bold">{category.name}</span><button className="btn-light px-3 py-2 text-xs" onClick={() => setEditing(category)}>Edit</button><button className="btn-danger" onClick={() => void remove(category.id)}>Delete</button></div>)}</div></section>;
}

function BannerManager() {
  const banners = useCollection<ShopBanner>("banners");
  const [editing, setEditing] = useState<ShopBanner | null>(null);
  const [error, setError] = useState("");
  async function remove(id: string) {
    if (!confirm("Permanently delete this sale banner?")) return;
    setError("");
    try { await deleteDoc(doc(db, "banners", id)); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to delete sale banner."); }
  }
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
  return <section className="mt-5 grid gap-4 md:grid-cols-[360px_1fr]"><form key={editing?.id || "new"} onSubmit={save} className="card grid h-fit gap-3 p-5">{editing && <input type="hidden" name="id" value={editing.id} />}<h2 className="font-extrabold">{editing ? "Edit sale banner" : "New sale banner"}</h2><label><span className="label">Title</span><input className="field" name="title" defaultValue={editing?.title} required /></label><label><span className="label">Offer description</span><textarea className="field" name="description" defaultValue={editing?.description} required /></label><label><span className="label">Discount info</span><input className="field" name="discount" defaultValue={editing?.discount} placeholder="e.g. Hostel special" /></label><div className="grid grid-cols-2 gap-2"><label><span className="label">Starts</span><input className="field" name="startsAt" type="datetime-local" defaultValue={editing?.startsAt} /></label><label><span className="label">Ends</span><input className="field" name="endsAt" type="datetime-local" defaultValue={editing?.endsAt} /></label></div><label><span className="label">Banner image</span><input className="field text-sm" name="image" type="file" accept="image/*" /></label>{error && <p className="text-sm text-red-600">{error}</p>}<div className="flex gap-2"><button className="btn-primary flex-1">{editing ? "Save banner" : "Publish banner"}</button>{editing && <button type="button" onClick={() => setEditing(null)} className="btn-light">Cancel</button>}</div></form><div className="grid content-start gap-3">{error && <p className="text-sm text-red-600">{error}</p>}{banners.map((banner) => <div key={banner.id} className="card flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="font-bold">{banner.title}</p><p className="text-sm text-stone-500">{banner.description}</p></div><div className="flex gap-2"><button onClick={() => setEditing(banner)} className="btn-light px-3 py-2 text-xs">Edit</button><button onClick={() => void setDoc(doc(db, "banners", banner.id), { active: !banner.active }, { merge: true })} className={`pill ${banner.active ? "bg-[#e6f0e5] text-[#315d3b]" : "bg-stone-100 text-stone-500"}`}>{banner.active ? "Active" : "Hidden"}</button><button onClick={() => void remove(banner.id)} className="btn-danger">Delete</button></div></div>)}</div></section>;
}

function ShopManager() {
  const shop = useShop();
  const [notice, setNotice] = useState(shop.notice || "");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => setNotice(shop.notice || ""), [shop.notice]);
  async function saveNotice(event: FormEvent) {
    event.preventDefault(); setError(""); setSaved(false);
    try {
      await setDoc(doc(db, "settings", "shop"), { notice: notice.trim() }, { merge: true });
      setSaved(true); setTimeout(() => setSaved(false), 2500);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save notice."); }
  }
  async function deleteNotice() {
    if (!confirm("Remove the customer notice?")) return;
    setError(""); setSaved(false);
    try {
      await setDoc(doc(db, "settings", "shop"), { notice: "" }, { merge: true });
      setNotice("");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to remove notice."); }
  }
  async function toggleShop() {
    setError("");
    try { await setDoc(doc(db, "settings", "shop"), { isOpen: !shop.isOpen }, { merge: true }); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to update shop status."); }
  }
  return <section className="mt-5 max-w-2xl"><div className="card p-5 sm:p-7"><h2 className="text-xl font-extrabold">Shop availability</h2><p className="mt-1 text-sm text-stone-500">Closing the shop prevents customers placing new orders.</p><div className="mt-5 flex items-center justify-between rounded-2xl bg-[#f6f5ef] p-4"><div><p className="font-bold">{shop.isOpen ? "Your shop is open" : "Your shop is closed"}</p><p className="text-xs text-stone-500">Status updates on the customer homepage.</p></div><button onClick={() => void toggleShop()} className={`rounded-full px-5 py-2.5 text-sm font-bold text-white ${shop.isOpen ? "bg-[#bb5943]" : "bg-[#426b47]"}`}>{shop.isOpen ? "Close shop" : "Open shop"}</button></div><form onSubmit={saveNotice} className="mt-5 grid gap-3"><label><span className="label">Customer notice</span><textarea className="field min-h-24" value={notice} onChange={(e) => setNotice(e.target.value)} placeholder="Shop will close at 10 PM…" maxLength={240} /></label><div className="flex flex-wrap gap-2"><button className="btn-primary">Save notice</button><button type="button" onClick={() => void deleteNotice()} disabled={!shop.notice && !notice} className="btn-danger">Delete notice</button></div>{saved && <p className="text-sm text-green-700">Notice saved.</p>}{error && <p className="text-sm text-red-600">{error}</p>}</form></div></section>;
}

export default App;
