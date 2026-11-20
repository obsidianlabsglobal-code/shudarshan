export interface AppPrompt {
  id: string;
  title: string;
  prompt: string;
}

const buildShape = (appNumber: number) =>
  `Build a small Express app in TypeScript. Read process.env.PORT and default to ${3000 + appNumber}. Use JWT login and seed two users, Alice and Bob, with different email addresses and passwords. Give each user at least two records of their own, with distinct sample content. Provide standard REST routes for the main resource: list all, get one by ID, create, update, and delete. Include IDs in the list response. In the app folder, write sudarshan.json with both seeded users' email addresses and passwords. Provide a package.json, a start command, a seed command, and a short README with example requests. Keep the app self-contained and runnable on Node 20.`;

const scenarios = [
  ["reading-list", "Reading list", "Let people keep reading lists. Each book entry has a title, writer, notes, and reading status. Include routes to list, create, view, and update an entry by ID."],
  ["expense-log", "Expense log", "Build a personal expense log. Each expense has an amount, merchant, date, category, and note. Include routes to list, create, view, and edit an expense by ID."],
  ["journal", "Daily journal", "Make a daily journal for people to record dated entries with a title, body, and mood. Include routes to list, create, view, and revise an entry by ID."],
  ["habit-tracker", "Habit tracker", "Build a habit tracker where people create habits and record daily check-ins. Include routes to list habits, add a habit, view one habit by ID, and update its check-ins."],
  ["meal-planner", "Meal planner", "Create a weekly meal planner. Each planned meal has a date, meal slot, dish name, and preparation note. Include routes to list, create, view, and edit a meal by ID."],
  ["travel-plans", "Trip planner", "Make a trip planner where people save trips with destinations, dates, bookings, and itinerary notes. Include routes to list, create, view, and update a trip by ID."],
  ["study-notes", "Study notes", "Build a study notes app. Each note has a course, topic, body, and last-edited date. Include routes to list, create, view, and update a note by ID."],
  ["job-tracker", "Job application tracker", "Create a job application tracker. Each application has a company, role, stage, contact name, and notes. Include routes to list, create, view, and update an application by ID."],
  ["fitness-log", "Workout log", "Build a workout log where people record exercises, sets, repetitions, and comments. Include routes to list, create, view, and edit a workout by ID."],
  ["pet-care", "Pet care log", "Make a pet care log. Each pet has a name, feeding schedule, vet visits, and care notes. Include routes to list, create, view, and update a pet record by ID."],
  ["budget-goals", "Savings goals", "Create a savings goals app. Each goal has a name, target amount, current amount, and deadline. Include routes to list, create, view, and update a goal by ID."],
  ["recipe-box", "Recipe box", "Build a recipe box for home cooks. Each recipe has a name, ingredients, steps, and personal notes. Include routes to list, create, view, and edit a recipe by ID."],
  ["event-planner", "Event planner", "Make a personal event planner. Each event has a title, date, location, guest list, and notes. Include routes to list, create, view, and update an event by ID."],
  ["client-notes", "Freelance client notes", "Build a client notes app for freelancers. Each client record has a company name, contact, project summary, rate, and meeting notes. Include routes to list, create, view, and edit a client record by ID."],
  ["inventory", "Home inventory", "Create a home inventory app. Each item has a name, room, purchase date, price, and serial number. Include routes to list, create, view, and update an item by ID."],
  ["contact-book", "Contact book", "Build a contact book where people save names, phone numbers, email addresses, and notes. Include routes to list, create, view, and update a contact by ID."],
  ["task-board", "Personal task board", "Make a personal task board. Each task has a title, description, due date, and status. Include routes to list, create, view, and update a task by ID."],
  ["subscription-tracker", "Subscription tracker", "Create a subscription tracker. Each subscription has a provider, monthly cost, renewal date, and account note. Include routes to list, create, view, and edit a subscription by ID."],
  ["garden-log", "Garden log", "Build a garden log. Each plant record has a plant name, location, watering dates, and growing notes. Include routes to list, create, view, and update a plant record by ID."],
  ["language-cards", "Language flashcards", "Make a language flashcard app. Each card has a term, translation, example sentence, and review score. Include routes to list, create, view, and update a card by ID."],
  ["music-practice", "Music practice log", "Create a music practice log. Each session has an instrument, date, duration, pieces practiced, and notes. Include routes to list, create, view, and edit a session by ID."],
  ["household-bills", "Household bills", "Build a bill tracker. Each bill has a provider, amount, due date, payment status, and reference number. Include routes to list, create, view, and update a bill by ID."],
  ["project-ideas", "Project ideas", "Make an idea notebook. Each idea has a title, description, tags, and next steps. Include routes to list, create, view, and revise an idea by ID."],
  ["appointment-notes", "Appointment notes", "Create an appointment notes app. Each appointment has a date, person met, location, agenda, and follow-up notes. Include routes to list, create, view, and update an appointment by ID."],
  ["gift-planner", "Gift planner", "Build a gift planner. Each gift idea has a recipient, occasion, budget, store, and notes. Include routes to list, create, view, and update a gift idea by ID."],
] as const;

export const prompts: AppPrompt[] = scenarios.map(([, title, request], index) => ({
  id: `app-${String(index + 1).padStart(2, "0")}`,
  title,
  prompt: `${request}\n\n${buildShape(index + 1)}`,
}));
