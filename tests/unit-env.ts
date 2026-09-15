// Unit tests import client components whose server-action imports create auth config.
// Use unreachable, synthetic connection details so these tests need no local services.
Object.assign(process.env, {
  NODE_ENV: "test",
  DATABASE_URL: "mysql://unit:unit@127.0.0.1:1/adluv_unit_test",
  BETTER_AUTH_URL: "http://localhost:3001",
  BETTER_AUTH_SECRET: "unit-tests-only-synthetic-auth-secret-2026",
  RUN_DB_INTEGRATION_TESTS: "0",
  adluv_FAKE_RESEND: "1",
});
