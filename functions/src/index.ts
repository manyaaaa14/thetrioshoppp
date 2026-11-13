import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

initializeApp();
const db = getFirestore();
const DELIVERY_FEE = 10;
const HOSTEL_NAME = "Kalpana Hostel";
const PICKUP_LOCATION = "Room No. 222, Kalpana Hostel, Landran, Mohali, Punjab";

function requireUser(uid: string | undefined): asserts uid is string {
  if (!uid) throw new HttpsError("unauthenticated", "Please sign in first.");
}

function requireAdmin(request: { auth?: { uid: string; token: Record<string, unknown> } | null }) {
  requireUser(request.auth?.uid);
  if (request.auth?.token.admin !== true) {
    throw new HttpsError("permission-denied", "Administrator access is required.");
  }
}

export const createOrder = onCall(async (request) => {
  requireUser(request.auth?.uid);
  const uid = request.auth.uid;
  const { items, deliveryMethod, roomNumber, deliveryAddress, paymentReference } = request.data as {
    items?: Array<{ productId: string; quantity: number }>;
    deliveryMethod?: string;
    roomNumber?: string;
    deliveryAddress?: string;
    paymentReference?: string;
  };

  if (!Array.isArray(items) || items.length === 0 || items.length > 30) {
    throw new HttpsError("invalid-argument", "Your cart is empty or too large.");
  }
  if (deliveryMethod !== "pickup" && deliveryMethod !== "room_delivery") {
    throw new HttpsError("invalid-argument", "Choose pickup or room delivery.");
  }
  if (deliveryMethod === "room_delivery" && (!roomNumber?.trim() || !deliveryAddress?.trim())) {
    throw new HttpsError("invalid-argument", "Room number and hostel address are required.");
  }
  if (!paymentReference?.trim() || paymentReference.trim().length > 120) {
    throw new HttpsError("invalid-argument", "Enter the UPI transaction reference after paying.");
  }

  const profile = await db.doc(`users/${uid}`).get();
  if (!profile.exists) throw new HttpsError("failed-precondition", "Complete your customer profile first.");
  const user = profile.data()!;
  const shop = await db.doc("settings/shop").get();
  if (shop.data()?.isOpen !== true) throw new HttpsError("failed-precondition", "The shop is currently closed.");

  const normalized = new Map<string, number>();
  for (const item of items) {
    if (typeof item.productId !== "string" || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 50) {
      throw new HttpsError("invalid-argument", "Invalid product quantity.");
    }
    normalized.set(item.productId, (normalized.get(item.productId) ?? 0) + item.quantity);
  }

  const products = await Promise.all([...normalized.keys()].map((id) => db.doc(`products/${id}`).get()));
  const orderItems = products.map((snapshot) => {
    const quantity = normalized.get(snapshot.id)!;
    const product = snapshot.data();
    if (!snapshot.exists || !product || product.active !== true || product.stock < quantity) {
      throw new HttpsError("failed-precondition", "A product is unavailable or has insufficient stock. Refresh your cart.");
    }
    const listedPrice = Number(product.price);
    const discountPrice = Number(product.discountPrice);
    const unitPrice = discountPrice > 0 && discountPrice < listedPrice ? discountPrice : listedPrice;
    const images = Array.isArray(product.images) ? product.images : [];
    return {
      productId: snapshot.id,
      name: product.name as string,
      imageUrl: (images[0] as string) || (product.imageUrl as string) || "",
      unitPrice,
      quantity
    };
  });
  const subtotal = orderItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const deliveryFee = deliveryMethod === "room_delivery" ? DELIVERY_FEE : 0;
  const total = subtotal + deliveryFee;
  const ref = db.collection("orders").doc();

  await ref.set({
    customerId: uid,
    deliveryMethod,
    pickupLocation: deliveryMethod === "pickup" ? PICKUP_LOCATION : "",
    customer: {
      fullName: String(user.fullName ?? ""),
      mobile: String(user.mobile ?? ""),
      email: String(user.email ?? ""),
      hostelName: HOSTEL_NAME,
      roomNumber: deliveryMethod === "room_delivery" ? roomNumber!.trim() : "",
      deliveryAddress: deliveryMethod === "room_delivery" ? deliveryAddress!.trim() : ""
    },
    items: orderItems,
    subtotal,
    deliveryFee,
    total,
    paymentStatus: "pending_verification",
    paymentReference: paymentReference.trim(),
    status: "payment_verification",
    estimatedDeliveryMinutes: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  });
  return { orderId: ref.id, total };
});

export const updateOrder = onCall(async (request) => {
  requireAdmin(request);
  const { orderId, status, estimatedDeliveryMinutes, paymentVerified, rejectReason } = request.data as {
    orderId?: string;
    status?: string;
    estimatedDeliveryMinutes?: number | null;
    paymentVerified?: boolean;
    rejectReason?: string;
  };
  if (!orderId) throw new HttpsError("invalid-argument", "Order ID is required.");
  const orderRef = db.doc(`orders/${orderId}`);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(orderRef);
    if (!snapshot.exists) throw new HttpsError("not-found", "Order not found.");
    const order = snapshot.data()!;
    const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };

    if (paymentVerified === true) {
      if (order.paymentStatus !== "pending_verification") {
        throw new HttpsError("failed-precondition", "This payment is not awaiting verification.");
      }
      const productRefs = order.items.map((item: { productId: string }) => db.doc(`products/${item.productId}`));
      const productSnapshots = await Promise.all(productRefs.map((ref: FirebaseFirestore.DocumentReference) => transaction.get(ref)));
      productSnapshots.forEach((product: FirebaseFirestore.DocumentSnapshot, index: number) => {
        const item = order.items[index] as { quantity: number };
        const stock = Number(product.data()?.stock ?? 0);
        if (!product.exists || stock < item.quantity) {
          throw new HttpsError("failed-precondition", "Insufficient stock to confirm this order.");
        }
      });
      productSnapshots.forEach((product: FirebaseFirestore.DocumentSnapshot, index: number) => {
        const item = order.items[index] as { quantity: number };
        transaction.update(product.ref, { stock: Number(product.data()?.stock ?? 0) - item.quantity });
      });
      patch.paymentStatus = "confirmed";
      patch.status = "payment_confirmed";
    }

    if (status) {
      const allowed = ["preparing", "out_for_delivery", "delivered", "cancelled", "rejected"];
      if (!allowed.includes(status)) throw new HttpsError("invalid-argument", "Invalid order status.");
      if (order.paymentStatus !== "confirmed" && status !== "rejected" && status !== "cancelled") {
        throw new HttpsError("failed-precondition", "Confirm payment before processing this order.");
      }
      patch.status = status;
    }
    if (estimatedDeliveryMinutes !== undefined) {
      if (estimatedDeliveryMinutes !== null && (!Number.isInteger(estimatedDeliveryMinutes) || estimatedDeliveryMinutes < 1 || estimatedDeliveryMinutes > 240)) {
        throw new HttpsError("invalid-argument", "Delivery estimate must be 1–240 minutes.");
      }
      patch.estimatedDeliveryMinutes = estimatedDeliveryMinutes;
    }
    if (rejectReason) patch.rejectReason = String(rejectReason).slice(0, 300);
    transaction.update(orderRef, patch);
  });
  return { success: true };
});
