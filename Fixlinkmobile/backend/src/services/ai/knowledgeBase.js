// FixLink Assistant knowledge base.
//
// One structured, curated description of how FixLink works. It is the single
// source the assistant is grounded on, replacing the short hardcoded paragraph
// that used to live inside routes/ai/assistantRoutes.js.
//
// Each section carries:
//   id      stable key, used by tests and retrieval logging
//   title   short heading shown to the model
//   roles   'all', or a list of roles the section applies to ('customer',
//           'technician', 'admin')
//   tags    extra keywords that route a question to this section
//   content a few factual sentences, safe to quote to the user
//
// Keep the content factual and free of prices: matching is free, repair
// payment is arranged directly between customer and technician.

const KNOWLEDGE_SECTIONS = [
  {
    id: 'platform-overview',
    title: 'What FixLink is',
    roles: 'all',
    tags: ['fixlink', 'platform', 'about', 'service', 'app', 'unsa', 'ano', 'what', 'system'],
    content: `FixLink is a home-services platform that connects customers with verified local technicians for appliance and repair work in the Philippines. Customers submit a repair request, nearby skill-matched technicians accept it, and the technician travels to the customer's home. FixLink itself is free to match; the cost of the actual repair is agreed directly between the customer and the technician. The app is built with Expo/React Native, a Node.js and Express API, and a Supabase (PostgreSQL) database with file storage.`,
  },
  {
    id: 'account-auth',
    title: 'Accounts, login and verification',
    roles: 'all',
    tags: ['login', 'sign in', 'account', 'register', 'signup', 'password', 'forgot', 'role', 'email', 'confirm', 'logout', 'verify', 'verification', 'pending verification', 'cannot log in'],
    content: `Accounts use an email address and password. Customer login and technician login are separate: an account registered as a customer cannot sign in through the technician portal, and a technician account cannot sign in as a customer. New technicians start as pending_verification and cannot log in until an admin approves the application; rejected applications cannot log in either. Forgot password sends a reset link to the account email. If login fails while the credentials are correct, the usual cause is that the app cannot reach the server (no internet, server not running, or the tunnel is closed).`,
  },
  {
    id: 'customer-submit-request',
    title: 'How a customer books a repair',
    roles: ['customer'],
    tags: ['submit', 'request', 'book', 'repair', 'appliance', 'steps', 'form', 'photo', 'schedule', 'location', 'gps', 'dashboard', 'mag book', 'unsaon pag'],
    content: `A customer books a repair in four steps: (1) Appliance, choose a category and device (or Others) and attach a photo, (2) Problem, describe what is wrong, (3) Schedule, pick a preferred date and time window such as Morning 8AM-12PM, (4) Location, set the service address and pin it on the map with GPS. After submitting, the request appears under Repairs with the status Pending while it waits for a technician.`,
  },
  {
    id: 'job-lifecycle',
    title: 'Repair request statuses',
    roles: 'all',
    tags: ['status', 'pending', 'accepted', 'confirmed', 'customer ready', 'in progress', 'completed', 'cancelled', 'no show', 'timeline', 'progress', 'lifecycle', 'state'],
    content: `A repair request moves through these statuses: Pending (waiting for a technician), then Accepted, Confirmed, Customer Ready, In Progress, and finally Completed. It can also end as Cancelled or No-Show. Only Accepted, Confirmed, Customer Ready, and In Progress count as active work for the technician. Customers follow the progress under Repairs, and technicians move the status forward as the work advances.`,
  },
  {
    id: 'technician-jobs-feed',
    title: 'How technicians find and accept jobs',
    roles: ['technician'],
    tags: ['available jobs', 'feed', 'accept', 'decline', 'skill', 'match', 'near', 'distance', '20km', 'nearby', 'queue', 'jobs near me'],
    content: `The technician job feed lists Pending requests that match the technician's registered skills and are within roughly 20 km of their current location. Only active and verified technicians receive a feed. A technician can accept or decline a job; accepting assigns the job to them and creates the customer's 4-digit completion code. If a job is too far away, or the skill does not match, it will not appear in the feed.`,
  },
  {
    id: 'technician-workload',
    title: 'Technician workload and capacity',
    roles: ['technician'],
    tags: ['workload', 'capacity', 'busy', 'available', 'active jobs', 'at capacity', 'too many jobs', 'limit'],
    content: `Workload is counted live from active jobs. With 0 to 2 active jobs a technician is available; with 3 to 5 they are busy and still eligible but slightly lower in priority; with 6 or more they are at_capacity, are left out of automatic recommendations, and cannot accept new jobs until they finish some (the server replies TECHNICIAN_AT_CAPACITY). Capacity recovers automatically as active jobs are completed.`,
  },
  {
    id: 'tracking-location',
    title: 'Live tracking and location privacy',
    roles: 'all',
    tags: ['track', 'tracking', 'map', 'gps', 'location', 'live', 'navigation', 'route', 'privacy', 'address', 'where is'],
    content: `While a request is Pending, the customer's exact address and coordinates stay hidden and only the town or city and an approximate distance are shown. Once the job is Accepted or In Progress, mutual live tracking unlocks: the technician sends live coordinates and the customer watches the technician move on the map with turn-by-turn road routing. Tracking stops as soon as the job is Completed or Cancelled. Live tracking also needs location permission allowed on the device.`,
  },
  {
    id: 'chat-messaging',
    title: 'Chat between customer and technician',
    roles: 'all',
    tags: ['chat', 'message', 'messages', 'inbox', 'talk', 'text', 'contact', 'unread', 'send'],
    content: `Once a technician accepts a job, the customer and technician can chat under Messages for that job. New messages raise a notification and an unread badge. Use chat to coordinate arrival time, gate or access instructions, and any extra detail about the appliance.`,
  },
  {
    id: 'completion-otp',
    title: 'Four-digit completion code (OTP)',
    roles: 'all',
    tags: ['otp', 'code', '4-digit', 'four digit', 'verify', 'verification code', 'completion', 'finish', 'complete', 'handshake', 'secure'],
    content: `To confirm the repair was actually done, the technician enters a 4-digit code that the customer sees on the progress screen. The code is created when the job is accepted and is stored on the job. Only a matching code marks the job Completed. Do not share the code before the work is truly finished.`,
  },
  {
    id: 'reviews-ratings',
    title: 'Reviews and ratings',
    roles: 'all',
    tags: ['review', 'rating', 'star', 'feedback', 'rate', 'reputation', 'comment', 'rate technician'],
    content: `After a job is Completed, the customer can rate the technician from 1 to 5 stars and leave a comment. Ratings and review counts build the technician's reputation and influence how the technician ranks in recommendations, so customers should rate honestly.`,
  },
  {
    id: 'notifications',
    title: 'Notifications and the unread badge',
    roles: 'all',
    tags: ['notification', 'bell', 'badge', 'alert', 'update', 'unread', 'deep link', 'notify'],
    content: `Notifications cover chat messages and job updates such as when a request is Accepted or Completed. Tapping a notification once opens a short detail and marks it read; tapping the same notification again opens the exact destination, either the chat thread or the job. The unread badge never goes below zero, and read state persists after reopening the app.`,
  },
  {
    id: 'schedule',
    title: 'Technician schedule availability',
    roles: 'all',
    tags: ['schedule', 'availability', 'available', 'busy', 'same day', 'date', 'booking conflict', 'free time'],
    content: `A technician's schedule shows whether they are available or busy for a given date, based on the jobs they already have that day. Schedule availability is separate from workload capacity. Customers can check a technician's schedule before choosing a time.`,
  },
  {
    id: 'matching-recommendation',
    title: 'How technicians are matched and ranked',
    roles: 'all',
    tags: ['recommend', 'recommendation', 'best technician', 'top', 'ranking', 'matching', 'free', 'price', 'cost', 'fee', 'magkano', 'pila', 'bayad'],
    content: `Matching is automatic. The system ranks verified technicians using skill match, distance, rating, review count, years of experience, and current workload, and it only considers technicians who are not at capacity. FixLink does not set or show repair prices: matching on FixLink is free, and any repair payment is settled directly between the customer and the technician. Never quote a price.`,
  },
  {
    id: 'troubleshooting-faq',
    title: 'Common problems and what they mean',
    roles: 'all',
    tags: ['problem', 'issue', 'error', 'cannot log in', 'cannot reach server', 'offline', 'no jobs', 'not showing', 'stuck', 'pending', 'not working', 'help', 'fix', 'error message'],
    content: `Common situations: a "Cannot reach the server" message means the app cannot reach the FixLink backend, so check the internet connection and that the server is running. "Pending verification" means a technician account is still waiting for admin approval. An empty technician job feed means no matching jobs are nearby, the skill does not match, or the account is not verified. Live tracking that does not appear usually means the job is not Accepted yet or location permission is switched off. A status that seems stuck normally needs the other party to take the next step.`,
  },
  {
    id: 'assistant-capabilities',
    title: 'What the assistant can do',
    roles: 'all',
    tags: ['assistant', 'ai', 'help', 'about you', 'what can you do', 'can you', 'kaparehas', 'tabang'],
    content: `The FixLink Assistant explains how the app works and answers questions about booking a repair, technicians, tracking, chat, the completion code, and reviews, using real FixLink data when it is provided. It can also answer general knowledge questions that are not about FixLink. It must not invent FixLink data such as names, statuses, or times, and it must not give prices.`,
  },
];

module.exports = { KNOWLEDGE_SECTIONS };
