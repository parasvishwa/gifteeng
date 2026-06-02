import { redirect } from "next/navigation";

// Root of the B2B surface — always redirect to the login page.
// The actual login UI lives at /login (app/b2b/login/page.tsx).
export default function B2BRootPage() {
  redirect("/login");
}
