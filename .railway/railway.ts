import { defineRailway, github, preserve, project, service } from "railway/iac";

// One service in this repo, so the authoring file is scoped to it.
export const partial = "soccer";

export default defineRailway(() => {
  const soccer = service("soccer", {
    // Declared, not decorative: this file is the whole desired state, so a
    // source left out here disconnects the repo and ends auto-deploy.
    source: github("SnickerSec/soccer", { branch: "master" }),

    build: { builder: "NIXPACKS" },
    start: "npm start",

    // Migrations run before the new container takes traffic, so a schema
    // change ships with the code that needs it rather than waiting for
    // someone to remember. `railway config migrate` drops this to a comment
    // rather than translating it, along with the builder and the restart
    // policy below — they are written out here by hand.
    preDeploy: "npm run migrate",

    replicas: 1,

    deploy: {
      restartPolicyType: "ON_FAILURE",
      restartPolicyMaxRetries: 10,
    },

    // preserve() keeps the value Railway already holds without naming it here.
    // These are secrets and a database URL; the file is in a public repo, and
    // omitting them entirely would delete them from the service.
    env: {
      APP_URL: preserve(),
      DATABASE_URL: preserve(),
      GOOGLE_CLIENT_ID: preserve(),
      GOOGLE_CLIENT_SECRET: preserve(),
      SESSION_SECRET: preserve(),
    },
  });

  return project("AYSO Roster", {
    resources: [soccer],
  });
});
