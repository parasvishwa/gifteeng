import { redirect } from "next/navigation";

// /b2c/help → redirect to FAQ until a full help centre is built
export default function HelpPage() {
  redirect("/faq");
}
