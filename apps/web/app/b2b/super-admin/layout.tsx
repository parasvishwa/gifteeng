import { AdminLayout } from "./_components/AdminLayout";

export const dynamic = "force-dynamic";

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminLayout>{children}</AdminLayout>;
}
