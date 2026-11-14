# THE TRIO SHOP — Jewellery & Accessories

A mobile-first React + Firebase jewellery and accessories shop for hostel students. It includes customer accounts, room-based checkout, live products and shop status, admin management, order tracking, and Firebase-backed authorization.

## What is and is not automated

Checkout lets customers choose free pickup at **Room No. 222, Kalpana Hostel** or ₹10 room delivery. The backend validates the selected method and calculates the final amount; pickup orders are never charged the delivery fee. Checkout creates an order in **payment verification pending** state with an exact-amount UPI intent/QR and captures the customer's transaction reference, but this app has no payment-gateway credentials or bank callback to independently verify UPI transactions. An authorized admin must verify the payment before the backend confirms the order and deducts stock. A customer entering a reference or tapping the submit button never confirms payment.

For automatic payment confirmation, integrate a payment provider with signed server-side webhooks; do not treat a client redirect or screenshot as proof of payment. The supplied manual review flow is the secure fallback.

## Requirements

- Node.js 20+
- A Firebase project with Email/Password and Google Authentication providers, Cloud Firestore, Firebase Storage, Cloud Functions, and Firebase Hosting enabled
- Firebase CLI (`npm install -g firebase-tools`) and permission to deploy the project

## Local setup

1. Copy `.env.example` to `.env` and fill in the Firebase Web App configuration from Firebase Console → Project settings → Your apps.
2. In Firebase Console, enable **Authentication → Email/Password** and **Google** sign-in providers. Add localhost and the deployed site domain under **Authentication → Settings → Authorized domains**; configure the verification and password-reset email templates.
3. Install frontend dependencies with `npm install`, then start the app with `npm run dev`.
4. Create an administrator account directly in Firebase Authentication. Public sign-up is customer-only; there is no admin registration page.
5. Assign that existing account the `admin: true` custom claim from a trusted local machine:

   **PowerShell**

   ```powershell
   $env:FIREBASE_SERVICE_ACCOUNT = "C:\secure\service-account.json"
   $env:ADMIN_EMAIL = "the-admin-email"
   node scripts\set-admin-role.mjs
   ```

   Download the service account JSON securely from Firebase Console → Project settings → Service accounts. Never put it in the project, a browser bundle, or source control. The admin must sign out and back in after the claim is applied.

6. Deploy the Firestore rules and required order-list index, Storage rules, and functions:

   ```powershell
   npm install
   cd functions
   npm install
   npm run build
   cd ..
   firebase login
   firebase use YOUR_FIREBASE_PROJECT_ID
   firebase deploy --only firestore:rules,storage,functions
   ```

7. Deploy the frontend with `npm run build` and `firebase deploy --only hosting`. `firebase.json` includes a single-page-app rewrite for customer and admin routes.

For a Render Node web service, use `npm install` as the build command, `npm run build` as the build step, and `npm start` as the start command. The start script serves the production build on Render's `PORT` (or port 4173 locally).

## Data and authorization

- `products`, `categories`, `banners`, and `settings/shop` are managed from the admin UI and read live by the customer site.
- `users/{uid}` holds that account's profile, room number, and hostel block/address. The shop serves Kalpana Hostel, so customers no longer enter a hostel name.
- `orders/{id}` is created by the `createOrder` callable function, which calculates prices from Firestore, checks the shop status and stock, validates the selected pickup/room-delivery method, charges ₹10 only for room delivery, and requires a room/address for room delivery plus a transaction reference. It snapshots the selected method and the customer's name, phone, email, hostel, room, and delivery address so an authorized admin can see them in Admin → Orders. Customers can read only their own orders.
- `updateOrder` is callable only by an authenticated user with the Firebase custom claim `admin: true`. It alone confirms payment and decrements stock transactionally, and it validates status and delivery estimates.
- Authorized admins can permanently delete products, categories, and sale banners, or remove the custom customer notice. Deleting a category does not delete its products.
- Firestore rules prohibit client writes to orders. Storage rules permit only admins to upload images, limited to image files under 5 MB.
- Firebase Auth email/password accounts are used for customer and admin sign-in; authorization comes from a server-managed custom claim, not from a profile field.
- Keep administrator email/password values out of the frontend and source control. Set `ADMIN_EMAIL` only in the trusted local shell when running the role-assignment script; possession of an email alone does not grant admin access.

Review the Firebase Console's Auth, Firestore, Storage, Functions, and Hosting settings before launch. Apply App Check, billing/region policies, backups, and monitoring appropriate to your deployment.
