// MediTrack seed data + reset. Running this file directly restores the
// demo to its seeded state (npm run victim:reset). All data is FAKE.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export interface User {
  id: string;
  name: string;
  username: string;
  password: string;
  phone: string;
  email: string;
  dob: string;
}

export interface Appointment {
  id: string;
  ownerId: string;
  patient: string;
  phone: string;
  date: string;
  doctor: string;
  reason: string; // sensitive note — this is what the attack leaks
}

export interface State {
  users: User[];
  appointments: Appointment[];
}

export const CANONICAL: State = {
  users: [
    {
      id: "u-anita",
      name: "Anita Deshpande",
      username: "anita@meditrack.test",
      password: "anita-demo-2026",
      phone: "9845012376",
      email: "anita@meditrack.test",
      dob: "1991-03-14",
    },
    {
      id: "u-rohan",
      name: "Rohan Mehta",
      username: "rohan@meditrack.test",
      password: "rohan-demo-2026",
      phone: "9820114567",
      email: "rohan@meditrack.test",
      dob: "1988-07-22",
    },
  ],
  appointments: [
    { id: "a-1001", ownerId: "u-anita", patient: "Anita Deshpande", phone: "9845012376", date: "2026-11-24", doctor: "Dr. Sharma", reason: "Follow-up on thyroid medication" },
    { id: "a-1002", ownerId: "u-anita", patient: "Anita Deshpande", phone: "9845012376", date: "2026-12-02", doctor: "Dr. Sharma", reason: "Persistent migraine review" },
    { id: "a-1003", ownerId: "u-anita", patient: "Anita Deshpande", phone: "9845012376", date: "2026-12-15", doctor: "Dr. Sharma", reason: "Routine blood pressure check" },
    { id: "a-2001", ownerId: "u-rohan", patient: "Rohan Mehta", phone: "9820114567", date: "2026-11-25", doctor: "Dr. Sharma", reason: "Sports injury assessment, left knee" },
    { id: "a-2002", ownerId: "u-rohan", patient: "Rohan Mehta", phone: "9820114567", date: "2026-12-05", doctor: "Dr. Sharma", reason: "Annual health check-up" },
    { id: "a-2003", ownerId: "u-rohan", patient: "Rohan Mehta", phone: "9820114567", date: "2026-12-18", doctor: "Dr. Sharma", reason: "Allergy consultation" },
  ],
};

const DIR = fileURLToPath(new URL(".", import.meta.url));
export const STATE_PATH = DIR + ".state.json";

export function writeState(): void {
  writeFileSync(STATE_PATH, JSON.stringify(CANONICAL, null, 2));
}

// Only reset when this file is the entry point (npm run victim:reset),
// not when server.ts imports CANONICAL/STATE_PATH.
const entry = process.argv[1] ?? "";
if (entry.endsWith("seed.ts")) {
  writeState();
  console.log(
    `MediTrack reset: ${CANONICAL.users.length} users, ${CANONICAL.appointments.length} appointments.`,
  );
}
