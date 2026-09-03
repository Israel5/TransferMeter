"use client";

import { useParams } from "next/navigation";
import { CustomerQuote } from "../customer-quote";

/** A customer's quote, addressed by the token in the link they were sent. */
export default function QuoteByToken() {
  const params = useParams<{ token: string }>();
  return <CustomerQuote token={String(params?.token ?? "")} />;
}
