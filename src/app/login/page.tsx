import { login } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="word">TrueYacht</div>
        <span className="tag">Office</span>
        <form action={login}>
          <input name="email" type="email" placeholder="Email" required />
          <input name="password" type="password" placeholder="Password" required />
          <button type="submit">Sign in</button>
        </form>
        {error === "not_staff" && (
          <p className="login-error">
            That account isn&apos;t set up for Office access. Ask Samuel to add you.
          </p>
        )}
        {error === "invalid_credentials" && <p className="login-error">Wrong email or password.</p>}
      </div>
    </div>
  );
}
