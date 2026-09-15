import { AuthForm } from "@/components/AuthForm";
import { PasswordForm } from "@/components/PasswordForm";
import { databaseConfigured } from "@/lib/db";

// Which form to show depends on the environment at request time, not at build
// time: prerendering this would bake in whichever mode the build machine had.
export const dynamic = "force-dynamic";

/**
 * Two ways in, depending on how the deployment is configured: accounts when
 * there is a database, and the single shared password when there is not.
 */
export default function Login() {
  return databaseConfigured() ? <AuthForm mode="login" /> : <PasswordForm />;
}
