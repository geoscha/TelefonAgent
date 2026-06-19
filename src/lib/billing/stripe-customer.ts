import "server-only";

import type Stripe from "stripe";

import {
  emailForStripeCheckout,
  getStripeClient,
} from "@/lib/billing/stripe-config";
import { createAdminClient } from "@/lib/supabase/admin";

interface ProfileStripeRow {
  stripe_customer_id: string | null;
  email: string | null;
  name: string | null;
}

export async function loadProfileStripeRow(
  userId: string
): Promise<ProfileStripeRow | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("stripe_customer_id, email, name")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("[stripe-customer] load profile:", error.message);
    return null;
  }
  return data as ProfileStripeRow | null;
}

export async function saveStripeCustomerId(
  userId: string,
  customerId: string
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ stripe_customer_id: customerId })
    .eq("id", userId);
  if (error) throw error;
}

export async function getOrCreateStripeCustomer(
  userId: string,
  email?: string | null,
  name?: string | null
): Promise<string> {
  const stripe = await getStripeClient();
  if (!stripe) {
    throw new Error("Stripe nicht konfiguriert.");
  }

  const row = await loadProfileStripeRow(userId);
  if (row?.stripe_customer_id) {
    return row.stripe_customer_id;
  }

  const customer = await stripe.customers.create({
    email: emailForStripeCheckout(email),
    name: name?.trim() || undefined,
    metadata: { userId },
  });

  await saveStripeCustomerId(userId, customer.id);
  return customer.id;
}

export async function setDefaultPaymentMethod(
  stripe: Stripe,
  customerId: string,
  paymentMethodId: string
): Promise<void> {
  await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
  await stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: paymentMethodId },
  });
}
