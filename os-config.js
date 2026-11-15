/* Your OS settings: the starting schedule, your automations, and the latest morning brief.
   You can change the schedule inside the OS (it saves in your browser). Claude can rewrite this file for you. */
window.OS_SEED = {
  schedule: [
    { id: 'anat', title: 'Anatomy', kind: 'school', days: [1], start: '08:00', end: '10:30' },
    { id: 'dmat', title: 'Dental Materials', kind: 'school', days: [1], start: '12:00', end: '14:00', note: 'End time not confirmed' },
    { id: 'cdmon', title: 'Complete Dentures (optional lab)', kind: 'school', days: [1], start: '16:00', end: '22:00', optional: true },
    { id: 'intro', title: 'Intro to Denturism', kind: 'school', days: [2], start: '09:00', end: '10:30' },
    { id: 'oro', title: 'Orofacial', kind: 'school', days: [3], start: '08:00', end: '10:40' },
    { id: 'cdwed', title: 'Complete Dentures', kind: 'school', days: [3], start: '12:00', end: '17:00' },
    { id: 'cdthu', title: 'Complete Dentures', kind: 'school', days: [4], start: '08:00', end: '12:00' }
  ],
  // From Blackboard (checked Nov 13, 2026). Ticking or deleting one here sticks, even when this file is updated.
  tasks: [
    { id: 'bb2950417', text: 'Missed: Anatomy Assignment 1 (0/50)', due: '2026-09-15', domain: 'school', done: false },
    { id: 'bb2991098', text: 'Missed: Communication Knowledge Check 3 (APA)', due: '2026-10-02', domain: 'school', done: false },
    { id: 'bb2931920', text: 'Missed: Communication Gen AI Literacy quiz (0/20)', due: '2026-10-23', domain: 'school', done: false },
    { id: 'bb3002647', text: 'Communication Knowledge Check Ch 6 (got 100%)', due: '2026-11-15', domain: 'school', done: true },
    { id: 'bb3003589', text: 'Intro to Denturism: Week 9 journal', due: '2026-11-17', domain: 'school', done: false },
    { id: 'bb2998274', text: 'Orofacial: Week 7 homework', due: '2026-11-17', domain: 'school', done: false },
    { id: 'bb3002802', text: 'Orofacial: Homework week 9', due: '2026-11-17', domain: 'school', done: false },
    { id: 'bb2948871', text: 'Orofacial: Test 2 at 8 AM (85 marks)', due: '2026-11-18', domain: 'school', done: false },
    { id: 'bb2971401', text: 'Dental Materials research assignment (title says Nov 25)', due: '2026-11-25', domain: 'school', done: false },
    { id: 'bb2948872', text: 'Orofacial: Test 3 at 8 AM (110 marks)', due: '2026-12-16', domain: 'school', done: false }
  ]
};
// Your scheduled automations (they run in Claude, even when your computer is off)
window.OS_AUTOMATIONS = [
  { name: 'Morning coach brief', when: 'Every day 7:41 AM', cron: '41 7 * * *', what: 'Your day (school + trading plan + news) sent to your phone. Reply to it to ask Claude to do things.', domain: 'trading', status: 'on' },
  { name: 'Gold + BTC setup alerts', when: 'Every 4 hours', cron: '24 */4 * * *', utc: true, what: 'Checks Quiet Breakout, Gold Trend, London Breakout and Trend Rider and pings you only when a fresh setup fires.', domain: 'trading', status: 'on' },
  { name: 'TikTok + Instagram stickman (5 a day)', when: 'Every day 8:47 AM', cron: '47 8 * * *', what: 'Makes and schedules 5 stick-figure videos to @stickman_factss and @mindsetover_limits.', domain: 'content', status: 'on' },
  { name: 'Daily Shorts (fruit series)', when: 'Paused', what: 'YouTube Shorts episodes. Paused because it needs your computer awake.', domain: 'content', status: 'paused' },
  { name: 'Trades by Sci YouTube watch', when: 'Paused', what: 'Pings you when SCI posts or goes live.', domain: 'trading', status: 'paused' }
];
// Atlas with Claude's own voice and brain (opens on claude.ai or in the Claude app).
window.OS_LINKS = { site: 'https://yelias242.github.io/yazdan-os/' };
// One copy only: the files in Downloads open the website instead, so two Atlases never answer at once.
if (location.protocol === 'file:' && window.top === window) location.replace(window.OS_LINKS.site + (location.pathname.split('/').pop() || 'os.html') + location.hash);
// The newest morning brief. The scheduled brief can overwrite this file when your Mac is on.
window.OS_BRIEF = null;

// About Yazdan (from what he wrote for Atlas, Nov 14, 2026). Atlas uses this as background.
window.OS_ABOUT = `Studying Denturism at Georgian College; it's his chosen career direction and he wants to get really good at it, but it doesn't define his whole identity.
Bigger ambitions: build businesses, develop technology and digital products, understand and use AI well, create extra income streams, learn skills outside school, and eventually have the freedom to create his own opportunities. Wants help balancing studies with these ambitions without neglecting either.
Builds websites and tools with AI (mainly Claude): a personal Study Hub with quizzes, flashcards, notes, anatomy/orofacial/denture/dental materials questions tied to lecture slides, and test countdowns. Interested in web development (HTML, CSS, JavaScript), UI design, automation and turning problems into tech solutions. Doesn't need to be a pro engineer but wants to understand code, not blindly copy it. Exploring turning this into a business: study sites for other college programs, websites for local businesses, small apps that solve real problems.
Wants to learn business, AI, programming, psychology, finance, marketing, communication and entrepreneurship. Long-term: create something meaningful, financial independence, help his family, and freedom over his time.
Also practising trading gold and Bitcoin on a demo account, and makes stick-figure TikTok/Instagram videos.
How to talk to him: explain things clearly without assuming he knows everything, but don't underestimate him; encourage understanding over copy-paste.`;

// Yazdan's study hubs (they live in his Claude account, so they're always the latest version) and his school portal.
window.OS_PORTAL = 'https://gc.blackboard.com/ultra';
