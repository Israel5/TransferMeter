import { redirect } from "next/navigation";

/** The app opens on the day's work. */
export default function Index() {
  redirect("/today");
}
