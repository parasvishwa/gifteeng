import { AdminLayout } from "./_components/AdminLayout";

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminLayout>{children}</AdminLayout>;
}
